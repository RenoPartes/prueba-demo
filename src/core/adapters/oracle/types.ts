/** Contratos de datos del adaptador Oracle (introspección + ejecución read-only). */

export interface QueryResult {
  /** Nombres de columna en el orden devuelto por Oracle. */
  columns: string[]
  /** Filas ya serializadas a JSON-safe (Date→ISO, CLOB→string, Buffer→base64). */
  rows: Record<string, unknown>[]
  rowCount: number
  /** true si se alcanzó el tope de filas y hay más datos sin devolver. */
  truncated: boolean
}

export interface SchemaColumn {
  name: string
  /** Tipo Oracle ya formateado, p. ej. `VARCHAR2(120)`, `NUMBER(10,2)`, `DATE`. */
  type: string
  nullable: boolean
  comment?: string
}

export interface SchemaForeignKey {
  column: string
  refTable: string
}

export interface SchemaTable {
  name: string
  comment?: string
  columns: SchemaColumn[]
  primaryKey: string[]
  foreignKeys: SchemaForeignKey[]
}

export interface SchemaMap {
  /** Owner/schema introspectado en Oracle. */
  schema: string
  /** Banner de versión del servidor (p. ej. "Oracle Database 11g ... 11.2.0.4.0"). */
  version: string
  /** true si el servidor es < 12.1 (no soporta FETCH FIRST / OFFSET). */
  isLegacy: boolean
  tables: SchemaTable[]
}
