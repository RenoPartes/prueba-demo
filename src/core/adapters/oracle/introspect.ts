import oracledb from 'oracledb'
import { getPool, isUnreachable } from './pool'
import { getOracleConfig } from '@/core/config/env'
import { OracleUnreachableError } from './errors'
import type { SchemaColumn, SchemaMap, SchemaTable } from './types'

/**
 * Introspección de SOLO LECTURA del diccionario de datos de Oracle.
 *
 * Construye un mapa del esquema real (tablas, columnas+tipos, PK/FK, comentarios)
 * que alimenta el system prompt del agente. Se cachea en `globalThis` porque el
 * esquema es estable durante la vida del proceso; un fallo no se cachea (reintenta).
 */

const globalForSchema = globalThis as unknown as {
  __schemaMapPromise?: Promise<SchemaMap>
}

const SYSTEM_OWNERS = [
  'SYS', 'SYSTEM', 'OUTLN', 'XDB', 'MDSYS', 'CTXSYS', 'DBSNMP', 'APPQOSSYS',
  'WMSYS', 'ORDSYS', 'ORDDATA', 'OLAPSYS', 'LBACSYS', 'DVSYS', 'GSMADMIN_INTERNAL',
  'AUDSYS', 'DBSFWUSER', 'REMOTE_SCHEDULER_AGENT', 'SYSBACKUP', 'SYSDG', 'SYSKM',
  'SYSRAC', 'GGSYS', 'ANONYMOUS', 'APEX_PUBLIC_USER', 'FLOWS_FILES', 'OJVMSYS',
  'PDBADMIN', 'DIP', 'ORACLE_OCM', 'XS$NULL',
]

type Row = Record<string, unknown>
const str = (v: unknown): string => (v == null ? '' : String(v))
const num = (v: unknown): number | null => (v == null ? null : Number(v))

/** Resuelve el owner de las tablas de negocio: env explícito → usuario actual → owner con más tablas. */
async function resolveOwner(conn: oracledb.Connection): Promise<string> {
  const cfg = getOracleConfig()
  if (cfg.ok && cfg.value.schema) return cfg.value.schema.toUpperCase()

  const userRes = await conn.execute<{ U: string }>(`SELECT USER AS "U" FROM dual`)
  const currentUser = str(userRes.rows?.[0]?.U).toUpperCase()

  if (currentUser) {
    const countRes = await conn.execute<{ N: number }>(
      `SELECT COUNT(*) AS "N" FROM all_tables WHERE owner = :o`,
      { o: currentUser },
    )
    if ((num(countRes.rows?.[0]?.N) ?? 0) > 0) return currentUser
  }

  const placeholders = SYSTEM_OWNERS.map((_, i) => `:s${i}`).join(',')
  const binds = Object.fromEntries(SYSTEM_OWNERS.map((o, i) => [`s${i}`, o]))
  // ROWNUM en vez de FETCH FIRST: compatible con 11g (FETCH FIRST es 12c+).
  const fallback = await conn.execute<{ OWNER: string }>(
    `SELECT "OWNER" FROM (
       SELECT owner AS "OWNER", COUNT(*) AS "C" FROM all_tables WHERE owner NOT IN (${placeholders})
       GROUP BY owner ORDER BY COUNT(*) DESC
     ) WHERE ROWNUM = 1`,
    binds,
  )
  return str(fallback.rows?.[0]?.OWNER).toUpperCase() || currentUser
}

/** Formatea el tipo Oracle a una representación compacta legible. */
function formatType(row: Row): string {
  const type = str(row.DATA_TYPE)
  const len = num(row.DATA_LENGTH)
  const precision = num(row.DATA_PRECISION)
  const scale = num(row.DATA_SCALE)

  if (type === 'NUMBER') {
    if (precision != null && scale != null && scale > 0) return `NUMBER(${precision},${scale})`
    if (precision != null) return `NUMBER(${precision})`
    return 'NUMBER'
  }
  if (/CHAR|RAW/.test(type) && len != null) return `${type}(${len})`
  return type
}

async function introspect(): Promise<SchemaMap> {
  const pool = await getPool()

  let conn: oracledb.Connection
  try {
    conn = await pool.getConnection()
  } catch (err) {
    if (isUnreachable(err)) {
      throw new OracleUnreachableError('No pude conectar para leer el esquema.', err)
    }
    throw err
  }

  try {
    conn.callTimeout = 30_000
    const owner = await resolveOwner(conn)
    const opts = { maxRows: 100_000, outFormat: oracledb.OUT_FORMAT_OBJECT } as const

    // Versión del servidor → decide el dialecto SQL que el agente debe usar.
    const verRes = await conn
      .execute<Row>(`SELECT banner AS "B" FROM v$version WHERE ROWNUM = 1`)
      .catch(() => null)
    const version = verRes?.rows?.[0] ? str(verRes.rows[0].B) : 'desconocida'
    const verMatch = version.match(/(\d+)\.(\d+)\.\d+/)
    const major = verMatch ? Number(verMatch[1]) : 0
    const minor = verMatch ? Number(verMatch[2]) : 0
    const isLegacy = major > 0 && (major < 12 || (major === 12 && minor < 1))

    const [tablesRes, columnsRes, consRes, allConsRes, tabCommentsRes, colCommentsRes] =
      await Promise.all([
        conn.execute<Row>(
          `SELECT table_name AS "TABLE_NAME" FROM all_tables WHERE owner = :o ORDER BY table_name`,
          { o: owner }, opts,
        ),
        conn.execute<Row>(
          `SELECT table_name AS "TABLE_NAME", column_name AS "COLUMN_NAME", data_type AS "DATA_TYPE",
                  data_length AS "DATA_LENGTH", data_precision AS "DATA_PRECISION", data_scale AS "DATA_SCALE",
                  nullable AS "NULLABLE"
           FROM all_tab_columns WHERE owner = :o ORDER BY table_name, column_id`,
          { o: owner }, opts,
        ),
        conn.execute<Row>(
          `SELECT ac.table_name AS "TABLE_NAME", ac.constraint_type AS "CONSTRAINT_TYPE",
                  acc.column_name AS "COLUMN_NAME", ac.r_constraint_name AS "R_CONSTRAINT_NAME"
           FROM all_constraints ac
           JOIN all_cons_columns acc ON ac.owner = acc.owner AND ac.constraint_name = acc.constraint_name
           WHERE ac.owner = :o AND ac.constraint_type IN ('P','R')
           ORDER BY ac.table_name, ac.constraint_name, acc.position`,
          { o: owner }, opts,
        ),
        conn.execute<Row>(
          `SELECT constraint_name AS "CONSTRAINT_NAME", table_name AS "TABLE_NAME"
           FROM all_constraints WHERE owner = :o`,
          { o: owner }, opts,
        ),
        conn.execute<Row>(
          `SELECT table_name AS "TABLE_NAME", comments AS "COMMENTS"
           FROM all_tab_comments WHERE owner = :o AND comments IS NOT NULL`,
          { o: owner }, opts,
        ),
        conn.execute<Row>(
          `SELECT table_name AS "TABLE_NAME", column_name AS "COLUMN_NAME", comments AS "COMMENTS"
           FROM all_col_comments WHERE owner = :o AND comments IS NOT NULL`,
          { o: owner }, opts,
        ),
      ])

    // Mapa constraint_name -> table_name (para resolver la tabla referida por una FK).
    const consToTable = new Map<string, string>()
    for (const r of allConsRes.rows ?? []) {
      consToTable.set(str(r.CONSTRAINT_NAME), str(r.TABLE_NAME))
    }

    // Comentarios.
    const tableComments = new Map<string, string>()
    for (const r of tabCommentsRes.rows ?? []) tableComments.set(str(r.TABLE_NAME), str(r.COMMENTS))
    const colComments = new Map<string, string>()
    for (const r of colCommentsRes.rows ?? []) {
      colComments.set(`${str(r.TABLE_NAME)}.${str(r.COLUMN_NAME)}`, str(r.COMMENTS))
    }

    // PK / FK por tabla.
    const pkByTable = new Map<string, string[]>()
    const fkByTable = new Map<string, { column: string; refTable: string }[]>()
    for (const r of consRes.rows ?? []) {
      const table = str(r.TABLE_NAME)
      const column = str(r.COLUMN_NAME)
      if (str(r.CONSTRAINT_TYPE) === 'P') {
        const list = pkByTable.get(table) ?? []
        list.push(column)
        pkByTable.set(table, list)
      } else {
        const refTable = consToTable.get(str(r.R_CONSTRAINT_NAME)) ?? '?'
        const list = fkByTable.get(table) ?? []
        list.push({ column, refTable })
        fkByTable.set(table, list)
      }
    }

    // Columnas por tabla.
    const columnsByTable = new Map<string, SchemaColumn[]>()
    for (const r of columnsRes.rows ?? []) {
      const table = str(r.TABLE_NAME)
      const name = str(r.COLUMN_NAME)
      const col: SchemaColumn = {
        name,
        type: formatType(r),
        nullable: str(r.NULLABLE) === 'Y',
        comment: colComments.get(`${table}.${name}`),
      }
      const list = columnsByTable.get(table) ?? []
      list.push(col)
      columnsByTable.set(table, list)
    }

    const tables: SchemaTable[] = (tablesRes.rows ?? []).map((r) => {
      const name = str(r.TABLE_NAME)
      return {
        name,
        comment: tableComments.get(name),
        columns: columnsByTable.get(name) ?? [],
        primaryKey: pkByTable.get(name) ?? [],
        foreignKeys: fkByTable.get(name) ?? [],
      }
    })

    return { schema: owner, version, isLegacy, tables }
  } finally {
    try {
      await conn.rollback()
    } catch {
      /* read-only */
    }
    try {
      await conn.close()
    } catch {
      /* noop */
    }
  }
}

export function getSchemaMap(): Promise<SchemaMap> {
  if (!globalForSchema.__schemaMapPromise) {
    globalForSchema.__schemaMapPromise = introspect().catch((err) => {
      globalForSchema.__schemaMapPromise = undefined
      throw err
    })
  }
  return globalForSchema.__schemaMapPromise
}
