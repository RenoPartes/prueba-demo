import { z } from 'zod'

/** Entrada del tool `consultarBaseDeDatos`, validada por el AI SDK contra el modelo. */
export const consultaInputSchema = z.object({
  sql: z
    .string()
    .min(1)
    .describe(
      'La consulta SQL en dialecto Oracle. DEBE ser de solo lectura (SELECT o WITH). Usá FETCH FIRST N ROWS ONLY para limitar, SYSDATE/TRUNC para fechas y comillas dobles solo si el identificador lo requiere.',
    ),
  explicacion: z
    .string()
    .min(1)
    .describe('Una frase breve en español que explique qué busca esta consulta.'),
})

export type ConsultaInput = z.infer<typeof consultaInputSchema>

export type ConsultaErrorCode =
  | 'read_only'
  | 'not_configured'
  | 'unreachable'
  | 'timeout'
  | 'sql_error'
  | 'unknown'

/** Resultado del tool, serializado al modelo y renderizado en la UI. */
export type ConsultaResult =
  | {
      ok: true
      columns: string[]
      rows: Record<string, unknown>[]
      rowCount: number
      truncated: boolean
    }
  | {
      ok: false
      code: ConsultaErrorCode
      error: string
    }
