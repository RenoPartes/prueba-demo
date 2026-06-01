/** Errores tipados del adaptador Oracle, para que las capas superiores degraden con gracia. */

/** Faltan variables de entorno de Oracle (la app levanta igual y avisa al usuario). */
export class OracleConfigError extends Error {
  readonly code = 'not_configured' as const
  constructor(public readonly missing: string[]) {
    super(`Faltan variables de entorno de Oracle: ${missing.join(', ')}`)
    this.name = 'OracleConfigError'
  }
}

/** El guard de aplicación (capa 1) rechazó una consulta que no es de solo lectura. */
export class ReadOnlyViolationError extends Error {
  readonly code = 'read_only' as const
  constructor(public readonly reason: string) {
    super(reason)
    this.name = 'ReadOnlyViolationError'
  }
}

/** No se pudo alcanzar/abrir la base de datos (red, VPN, credenciales, servicio caído). */
export class OracleUnreachableError extends Error {
  readonly code = 'unreachable' as const
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'OracleUnreachableError'
  }
}
