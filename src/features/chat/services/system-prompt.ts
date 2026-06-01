import { getSchemaMap } from '@/core/adapters/oracle/introspect'
import { MAX_ROWS } from '@/core/adapters/oracle/executor'
import type { SchemaMap, SchemaTable } from '@/core/adapters/oracle/types'

/** Presupuesto de caracteres para el mapa de esquema dentro del system prompt. */
const SCHEMA_CHAR_BUDGET = 48_000

/** Render completo de una tabla: columnas con tipo, PK, FK y comentarios. */
function renderTableFull(table: SchemaTable): string {
  const pk = new Set(table.primaryKey)
  const fkByCol = new Map(table.foreignKeys.map((fk) => [fk.column, fk.refTable]))
  const header = table.comment ? `- ${table.name}  — "${table.comment}"` : `- ${table.name}`
  const cols = table.columns.map((c) => {
    const marks: string[] = []
    if (pk.has(c.name)) marks.push('[PK]')
    const ref = fkByCol.get(c.name)
    if (ref) marks.push(`→ ${ref}`)
    if (!c.nullable) marks.push('NOT NULL')
    const tail = marks.length ? ` ${marks.join(' ')}` : ''
    const comment = c.comment ? `  — "${c.comment}"` : ''
    return `    ${c.name} ${c.type}${tail}${comment}`
  })
  return [header, ...cols].join('\n')
}

/** Render compacto: solo nombre y tipo de cada columna (sin comentarios). */
function renderTableCompact(table: SchemaTable): string {
  const cols = table.columns.map((c) => `${c.name} ${c.type}`).join(', ')
  return `- ${table.name}(${cols})`
}

/** Solo nombres de tabla. */
function renderTableNames(tables: SchemaTable[]): string {
  return tables.map((t) => t.name).join(', ')
}

/** Construye el bloque de esquema degradando si excede el presupuesto de caracteres. */
function renderSchema(map: SchemaMap): string {
  const full = map.tables.map(renderTableFull).join('\n')
  if (full.length <= SCHEMA_CHAR_BUDGET) return full

  const compact = map.tables.map(renderTableCompact).join('\n')
  if (compact.length <= SCHEMA_CHAR_BUDGET) {
    return `(Esquema resumido por tamaño — pedí columnas exactas con una consulta al diccionario si hace falta.)\n${compact}`
  }

  return `(Esquema muy grande: solo se listan los nombres de tabla. Descubrí columnas con SELECT sobre ALL_TAB_COLUMNS cuando lo necesites.)\n${renderTableNames(map.tables)}`
}

const DIALECT_AND_RULES = `## Cómo debes trabajar

- Respondé SIEMPRE en español, claro y de negocio, como un analista de confianza.
- Para CUALQUIER pregunta sobre datos, usá la herramienta \`consultarBaseDeDatos\`. Nunca inventes cifras: si no consultaste, no afirmes.
- Escribí SQL en **dialecto Oracle**, no Postgres ni MySQL:
  - Identificadores del diccionario suelen estar en MAYÚSCULAS. Usá comillas dobles solo si el identificador lo requiere.
  - Para limitar filas y top-N usá **\`ROWNUM\`** (compatible con TODAS las versiones de Oracle): \`SELECT * FROM (SELECT ... ORDER BY ... DESC) WHERE ROWNUM <= N\`. NO uses \`LIMIT\` (no existe en Oracle). Evitá \`FETCH FIRST\`/\`OFFSET\` salvo que el servidor sea 12.1+ (ver "Servidor" arriba).
  - Para fechas usá \`SYSDATE\`, \`TRUNC(...)\`, \`ADD_MONTHS\`, \`TO_DATE(...)\`. "Esta semana" = desde \`TRUNC(SYSDATE,'IW')\`.
  - Concatená con \`||\`. Usá \`NVL\`/\`COALESCE\` para nulos.
- Sos **estrictamente de solo lectura**: solo SELECT/WITH. Está prohibido (y bloqueado por el sistema) INSERT/UPDATE/DELETE/DDL. Si te piden modificar datos, explicá con amabilidad que solo podés leer.
- Mantené las consultas acotadas: el sistema corta a ${MAX_ROWS} filas y por tiempo. Para totales/rankings, agregá (\`COUNT\`, \`SUM\`, \`GROUP BY\`, \`ORDER BY\`) en vez de traer todo.
- Si una pregunta es ambigua (p. ej. "ventas" sin periodo), pedí UNA aclaración concreta antes de consultar, o asumí lo más razonable y decílo.
- Si la consulta no devuelve filas, decí claramente que no se encontraron datos para eso (no es un error).
- Si Oracle devuelve un error de SQL (tabla/columna inexistente, sintaxis), leé el mensaje, corregí la consulta y reintentá una vez; si no, explicá el problema en lenguaje simple.
- Si la herramienta indica que la base no está disponible o falta configuración, explicáselo al usuario con calma y sin tecnicismos.

## Formato de respuesta

1. Una frase con la respuesta directa a la pregunta.
2. Los resultados como **tabla markdown** cuando haya filas (encabezados claros, formatos legibles).
3. Si truncaste resultados, avisá que hay más.
La interfaz ya muestra la consulta SQL que ejecutaste, así que no hace falta repetirla salvo que ayude a la explicación.`

const GLOSSARY = `## Glosario de negocio (orientativo — confirmá con el esquema real)

- "Ventas" / "facturación": importes vendidos; suele vivir en tablas de ventas/facturas con su detalle por línea.
- "Productos más vendidos": ranking por cantidad o por importe en un periodo (\`SUM\` + \`GROUP BY\` producto + \`ORDER BY ... DESC\`).
- "Inventario bajo": existencias por debajo de un mínimo/umbral (stock actual vs. stock mínimo).
- "Compras": adquisiciones a proveedores (distinto de ventas a clientes).
- "Cliente" / "Proveedor": contrapartes; unilas a ventas/compras por sus claves foráneas.
Usá los comentarios de tablas/columnas y las relaciones (PK/FK) del esquema para elegir las tablas correctas.`

function composePrompt(map: SchemaMap): string {
  const legacyNote = map.isLegacy
    ? '\n⚠️ Es una versión ANTERIOR a 12.1 (11g): NO uses `FETCH FIRST` ni `OFFSET` (dan ORA-00933). Para limitar/top-N usá SIEMPRE `ROWNUM` con subconsulta: `SELECT * FROM (SELECT ... ORDER BY ... DESC) WHERE ROWNUM <= N`.'
    : ''

  return `Sos un copiloto de datos conectado a la base de datos Oracle del negocio. Conocés su esquema real (introspectado del diccionario de datos) como tu propia casa y traducís preguntas de negocio en español a consultas SQL Oracle de **solo lectura**.

# Servidor
${map.version}${legacyNote}

# Esquema real (owner: ${map.schema}) — ${map.tables.length} tablas

${renderSchema(map)}

${GLOSSARY}

${DIALECT_AND_RULES}`
}

/** System prompt con el esquema real introspectado. Lanza si Oracle no está disponible. */
export async function buildSystemPrompt(): Promise<string> {
  const map = await getSchemaMap()
  return composePrompt(map)
}

/** System prompt de respaldo cuando no se pudo leer el esquema (BD inalcanzable/no configurada). */
export function buildFallbackSystemPrompt(reason: string): string {
  return `Sos un copiloto de datos del negocio que normalmente consulta una base de datos Oracle de solo lectura.

En este momento NO pude leer el esquema de la base de datos. Motivo técnico: ${reason}

Si el usuario pregunta por datos del negocio, explicale con calma y sin tecnicismos que ahora mismo no podés conectarte a su base de datos, y sugerí que revise la conexión (red/VPN y credenciales). No inventes datos ni cifras. Igual podés conversar y orientar sobre qué tipo de preguntas vas a poder responder cuando la conexión esté lista.

${DIALECT_AND_RULES}`
}
