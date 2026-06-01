import { tool } from 'ai'
import { runReadOnlyQuery } from '@/core/adapters/oracle/executor'
import {
  OracleConfigError,
  OracleUnreachableError,
  ReadOnlyViolationError,
} from '@/core/adapters/oracle/errors'
import { isUnreachable } from '@/core/adapters/oracle/pool'
import { consultaInputSchema, type ConsultaErrorCode, type ConsultaResult } from '../types/contracts'

/** Mapea un error a un código estable + mensaje legible para el modelo. */
function classifyError(err: unknown): { code: ConsultaErrorCode; error: string } {
  if (err instanceof ReadOnlyViolationError) return { code: 'read_only', error: err.message }
  if (err instanceof OracleConfigError) return { code: 'not_configured', error: err.message }
  if (err instanceof OracleUnreachableError) return { code: 'unreachable', error: err.message }

  const msg = err instanceof Error ? err.message : String(err)
  if (/NJS-138/i.test(msg)) {
    return {
      code: 'unreachable',
      error:
        'La base de datos es una versión anterior a 12.1, que el modo directo no soporta. Para leerla hay que activar el modo Thick con Oracle Instant Client (ORACLE_CLIENT_LIB_DIR).',
    }
  }
  if (/ORA-01013/i.test(msg)) {
    return { code: 'timeout', error: 'La consulta tardó demasiado y se canceló. Probá una versión más acotada.' }
  }
  if (isUnreachable(err)) {
    return { code: 'unreachable', error: 'No pude conectar a la base de datos (red/VPN o credenciales).' }
  }
  if (/ORA-00942|ORA-00904|ORA-00936|ORA-00933|ORA-00911|ORA-01756|ORA-00923|ORA-00979/i.test(msg)) {
    // Error de SQL recuperable: devolver el mensaje de Oracle para que el modelo se autocorrija.
    return { code: 'sql_error', error: msg }
  }
  return { code: 'unknown', error: msg }
}

/**
 * Herramienta que el agente invoca para responder preguntas de datos.
 * Ejecuta SELECTs de solo lectura (con guard + sesión read-only + límites) y
 * devuelve filas, o un resultado de error tipado que el modelo puede explicar
 * o usar para autocorregirse.
 */
export const consultarBaseDeDatos = tool({
  description:
    'Ejecuta una consulta SQL de SOLO LECTURA (SELECT/WITH) en dialecto Oracle contra la base de datos del negocio y devuelve las filas. Usala para responder cualquier pregunta sobre los datos. No puede modificar la base de datos.',
  inputSchema: consultaInputSchema,
  execute: async ({ sql }): Promise<ConsultaResult> => {
    try {
      const result = await runReadOnlyQuery(sql)
      return {
        ok: true,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
      }
    } catch (err) {
      return { ok: false, ...classifyError(err) }
    }
  },
})
