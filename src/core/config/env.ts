/**
 * Acceso tipado y validado a las variables de entorno del servidor.
 *
 * No lanza al importar: cada getter devuelve un resultado discriminado para que
 * las rutas decidan cómo degradar con gracia (mensaje claro al usuario en vez de
 * crash) cuando falta configuración. Solo se usa en código de servidor.
 */

const PLACEHOLDER = /^<.*>$/

/** Normaliza un valor de entorno: vacío o placeholder (`<...>`) cuenta como ausente. */
function clean(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed || PLACEHOLDER.test(trimmed)) return ''
  return trimmed
}

export interface OracleConfig {
  user: string
  password: string
  connectString: string
  /** Owner/schema de las tablas de negocio. Si se omite, se descubre por introspección. */
  schema?: string
}

export type OracleConfigResult =
  | { ok: true; value: OracleConfig }
  | { ok: false; missing: string[] }

export function getOracleConfig(): OracleConfigResult {
  const user = clean(process.env.DB_USER)
  const password = clean(process.env.DB_PASSWORD)
  const connectStringRaw = clean(process.env.DB_CONNECT_STRING)
  const schema = clean(process.env.DB_SCHEMA)

  const missing: string[] = []
  if (!user) missing.push('DB_USER')
  if (!password) missing.push('DB_PASSWORD')
  // La cadena debe incluir un servicio tras la barra (host:puerto/servicio).
  if (!connectStringRaw || /\/\s*$/.test(connectStringRaw)) missing.push('DB_CONNECT_STRING')

  if (missing.length > 0) return { ok: false, missing }
  return {
    ok: true,
    value: { user, password, connectString: connectStringRaw, schema: schema || undefined },
  }
}

export type OpenAIConfigResult =
  | { ok: true; model: string }
  | { ok: false; missing: string[] }

export function getOpenAIConfig(): OpenAIConfigResult {
  const apiKey = clean(process.env.OPENAI_API_KEY)
  const model = clean(process.env.OPENAI_MODEL) || 'gpt-5.5'
  if (!apiKey) return { ok: false, missing: ['OPENAI_API_KEY'] }
  return { ok: true, model }
}
