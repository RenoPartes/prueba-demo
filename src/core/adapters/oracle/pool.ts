import oracledb from 'oracledb'
import { getOracleConfig } from '@/core/config/env'
import { OracleConfigError, OracleUnreachableError } from './errors'

/**
 * Pool de conexiones Oracle (modo Thin — JS puro, sin Instant Client).
 *
 * Se crea UNA sola vez y se cachea en `globalThis` para sobrevivir al HMR de
 * Turbopack en desarrollo (evita el error "pool already exists" por doble init).
 * Solo debe importarse desde código de servidor (runtime Node).
 */

// Formato de salida por objeto + CLOB como string para serialización JSON segura.
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT
oracledb.fetchAsString = [oracledb.CLOB]

const globalForOracle = globalThis as unknown as {
  __oraclePoolPromise?: Promise<oracledb.Pool>
  __thickInitialized?: boolean
}

/**
 * Modo Thick (Oracle Instant Client) — necesario para servidores Oracle < 12.1
 * (p. ej. 11g), que el modo Thin no soporta. Se activa SOLO si se define
 * `ORACLE_CLIENT_LIB_DIR` apuntando al directorio del Instant Client (19c+, de
 * arquitectura compatible con el proceso Node). Si no, se usa Thin (JS puro).
 */
function ensureThickModeIfConfigured(): void {
  const libDir = (process.env.ORACLE_CLIENT_LIB_DIR ?? '').trim()
  if (!libDir || globalForOracle.__thickInitialized) return
  // Directorio con sqlnet.ora (p. ej. SQLNET.ALLOWED_LOGON_VERSION_CLIENT=11 para 11g).
  const configDir = (process.env.ORACLE_CLIENT_CONFIG_DIR ?? process.env.TNS_ADMIN ?? '').trim()
  const opts: { libDir: string; configDir?: string } = { libDir }
  if (configDir) opts.configDir = configDir
  try {
    oracledb.initOracleClient(opts)
  } catch (err) {
    // Si ya estaba inicializado en este proceso, no es un error real.
    if (!/already.*initialized/i.test(err instanceof Error ? err.message : String(err))) throw err
  }
  globalForOracle.__thickInitialized = true
}

/** Mensajes de Oracle/driver que significan "no se pudo conectar". */
function isUnreachable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /ORA-12541|ORA-12514|ORA-12545|ORA-12170|ORA-01017|NJS-501|NJS-503|NJS-510|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENOTFOUND|getaddrinfo/i.test(
    msg,
  )
}

async function createPool(): Promise<oracledb.Pool> {
  const cfg = getOracleConfig()
  if (!cfg.ok) throw new OracleConfigError(cfg.missing)

  ensureThickModeIfConfigured()

  try {
    return await oracledb.createPool({
      user: cfg.value.user,
      password: cfg.value.password,
      connectString: cfg.value.connectString,
      poolMin: 0,
      poolMax: 4,
      poolIncrement: 1,
      poolTimeout: 60,
    })
  } catch (err) {
    if (isUnreachable(err)) {
      throw new OracleUnreachableError(
        'No pude conectar a la base de datos. Revisá la red/VPN al host y las credenciales.',
        err,
      )
    }
    throw err
  }
}

export async function getPool(): Promise<oracledb.Pool> {
  if (!globalForOracle.__oraclePoolPromise) {
    globalForOracle.__oraclePoolPromise = createPool().catch((err) => {
      // No cachear el fallo: permitir reintento en la siguiente petición.
      globalForOracle.__oraclePoolPromise = undefined
      throw err
    })
  }
  return globalForOracle.__oraclePoolPromise
}

export { isUnreachable }
