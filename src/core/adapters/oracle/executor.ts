import oracledb from 'oracledb'
import { getPool, isUnreachable } from './pool'
import { guardReadOnlySql } from './guard'
import { OracleUnreachableError, ReadOnlyViolationError } from './errors'
import type { QueryResult } from './types'

/** Tope de filas devueltas al modelo/UI (capa 3). */
export const MAX_ROWS = 200
/** Corte de consultas colgadas/lentas (capa 3). */
export const CALL_TIMEOUT_MS = 20_000

/** Convierte un valor de Oracle a algo serializable a JSON. */
function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (typeof value === 'bigint') return value.toString()
  return value
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) out[key] = sanitizeValue(value)
  return out
}

/**
 * Ejecuta una consulta de SOLO LECTURA contra Oracle aplicando la defensa en
 * profundidad de 3 capas:
 *   1. Guard de aplicación (SELECT/WITH-only) — antes de tocar la BD.
 *   2. Sesión `SET TRANSACTION READ ONLY` — Oracle rechaza escrituras (ORA-01456).
 *   3. Tope de filas + `callTimeout` — evita resultados gigantes/consultas colgadas.
 *
 * Nunca hace commit; la conexión se cierra con rollback. Lanza errores tipados.
 */
export async function runReadOnlyQuery(rawSql: string): Promise<QueryResult> {
  const guard = guardReadOnlySql(rawSql)
  if (!guard.ok) throw new ReadOnlyViolationError(guard.reason)

  const pool = await getPool()

  let connection: oracledb.Connection | undefined
  try {
    connection = await pool.getConnection()
  } catch (err) {
    if (isUnreachable(err)) {
      throw new OracleUnreachableError(
        'No pude abrir una conexión a la base de datos en este momento.',
        err,
      )
    }
    throw err
  }

  try {
    connection.callTimeout = CALL_TIMEOUT_MS
    // Capa 2: transacción de solo lectura para toda la sesión de esta consulta.
    await connection.execute('SET TRANSACTION READ ONLY')

    const result = await connection.execute<Record<string, unknown>>(guard.sql, [], {
      // Pedimos una fila extra para detectar truncamiento.
      maxRows: MAX_ROWS + 1,
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    })

    const rawRows = result.rows ?? []
    const truncated = rawRows.length > MAX_ROWS
    const rows = (truncated ? rawRows.slice(0, MAX_ROWS) : rawRows).map(sanitizeRow)
    const columns =
      result.metaData?.map((c) => c.name) ?? (rows[0] ? Object.keys(rows[0]) : [])

    return { columns, rows, rowCount: rows.length, truncated }
  } finally {
    try {
      await connection.rollback()
    } catch {
      /* sin commit jamás: ignoramos errores de rollback al cerrar */
    }
    try {
      await connection.close()
    } catch {
      /* devolver la conexión al pool no debe romper la respuesta */
    }
  }
}
