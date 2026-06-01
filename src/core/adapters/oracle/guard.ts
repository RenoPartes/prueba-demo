/**
 * Capa 1 de la defensa en profundidad: guard de aplicación SELECT-only.
 *
 * Patrón del template `natural-language-postgres` de Vercel, endurecido para Oracle:
 * la consulta debe empezar por SELECT o WITH, ser una sola sentencia, y no contener
 * ninguna palabra clave de mutación/DDL/PLSQL. Antes de escanear, se eliminan
 * literales de texto, identificadores entre comillas y comentarios para no producir
 * falsos positivos por el contenido de un string (p. ej. WHERE estado = 'set').
 *
 * Es la primera de tres capas. Las otras dos (sesión `SET TRANSACTION READ ONLY` y
 * tope de filas + `callTimeout`) viven en el ejecutor. El guard puede tener algún
 * falso positivo y eso es aceptable: ante un puntero a producción, preferimos
 * rechazar una consulta rara antes que arriesgar una escritura.
 */

/** Palabras prohibidas en una consulta de solo lectura (escaneadas como palabra completa). */
const FORBIDDEN = new RegExp(
  '\\b(' +
    [
      'insert', 'update', 'delete', 'merge', 'upsert',
      'drop', 'alter', 'create', 'truncate', 'rename', 'comment',
      'grant', 'revoke', 'audit', 'noaudit',
      'exec', 'execute', 'call', 'begin', 'declare',
      'commit', 'rollback', 'savepoint', 'lock',
      'flashback', 'purge', 'into',
      'dbms_', 'utl_',
    ].join('|') +
    ')\\b',
  'i',
)

/** Elimina comentarios, literales de texto y los identificadores entre comillas dobles. */
function stripLiteralsAndComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // comentarios de bloque
    .replace(/--[^\n]*/g, ' ') // comentarios de línea
    .replace(/'(?:''|[^'])*'/g, " '' ") // literales de texto (con '' escapado)
    .replace(/"(?:[^"])*"/g, ' "id" ') // identificadores entre comillas dobles
}

export type GuardResult =
  | { ok: true; sql: string }
  | { ok: false; reason: string }

/**
 * Valida que `rawSql` sea una consulta Oracle de solo lectura.
 * Devuelve la consulta normalizada (sin `;` final) si pasa, o un motivo legible si no.
 */
export function guardReadOnlySql(rawSql: string): GuardResult {
  const sql = (rawSql ?? '').trim()
  if (!sql) {
    return { ok: false, reason: 'La consulta está vacía.' }
  }

  // Una sola sentencia: se permite un único `;` final, ninguno en medio.
  const withoutTrailing = sql.replace(/;\s*$/, '')
  if (withoutTrailing.includes(';')) {
    return { ok: false, reason: 'Solo se permite una sentencia SQL a la vez.' }
  }

  const scrubbed = stripLiteralsAndComments(withoutTrailing).trim()

  if (!/^(select|with)\b/i.test(scrubbed)) {
    return { ok: false, reason: 'La consulta debe empezar por SELECT o WITH (solo lectura).' }
  }

  const forbidden = scrubbed.match(FORBIDDEN)
  if (forbidden) {
    return {
      ok: false,
      reason: `La consulta contiene una operación no permitida ("${forbidden[0].toUpperCase()}"). Solo puedo leer datos.`,
    }
  }

  return { ok: true, sql: withoutTrailing }
}
