# Brief Master: Copiloto de Datos del Negocio

> Fecha: 2026-06-01
> **Modo de ejecucion**: `PRP unico` (todas las fases declaradas abajo se ejecutan como sub-fases de UN solo PRP monolitico — ver seccion `## Modo: PRP unico` debajo del TL;DR)

## TL;DR

Quiero un **copiloto conversacional sobre la base de datos de mi negocio**: una sola pantalla de chat donde le pregunto en lenguaje natural ("¿cuáles son los productos más vendidos esta semana?") y un agente de IA traduce mi pregunta a SQL, la corre **solo-lectura** contra mi Oracle de producción, y me responde en texto claro + tablas. Stack: Next.js 16 + React 19 + AI Elements (UI de chat sobre shadcn/ui) + Vercel AI SDK v5 con OpenAI (gpt-5.5) + `oracledb` en modo Thin contra mi Oracle existente. El diferenciador no es la UI — es que el agente **conoce mi esquema como su propia casa** (tablas, columnas, relaciones y comentarios introspectados del diccionario de datos) y nunca puede escribir ni dañar la BD.

## Modo: PRP unico

Este brief activa explicitamente el modo "PRP unico". Significa:

- **El `prp/SKILL.md` Paso 0 al leer este brief debe generar UN unico PRP** (no N) que cubra las 4 fases declaradas abajo como sub-fases lineales del Plan de implementacion. La numeracion de fases en `## Alcance por Fases` se mantiene como mapa conceptual; el PRP unico las trata como sub-fases.
- **El `bucle-agentico` ejecuta las sub-fases del PRP unico en una sola sesion** y al cerrar marca las 4 fases del `## Alcance por Fases` como `COMPLETADO` simultaneamente.
- Lo pedí explícitamente: *"este brief debe derivar en un prp monolitico"*.

## Mi Vision

Tengo toda la operación de mi negocio viviendo en una base de datos Oracle — productos, clientes, ventas, inventario, compras, facturación. El problema es que para *entender* lo que pasa hoy tengo que pedir reportes, abrir herramientas técnicas o saber SQL. Quiero borrar esa fricción por completo: abrir un chat, preguntar como le preguntaría a un analista de confianza, y obtener la respuesta al instante. Claridad absoluta del negocio a un mensaje de distancia.

El producto es deliberadamente de **una sola función**: el agente es el **puente entre mi base de datos y yo**. No es un CRUD, no es un ERP, no escribe nada. Solo lee, entiende y explica. Por eso el peso del proyecto no está en el frontend — la interfaz es un chat, y para eso ya existen piezas open-source pulidas y listas. El peso está en hacer que el agente **conozca mi esquema de verdad**: que sepa qué tabla guarda las ventas, cómo se relaciona con productos y clientes, qué significa cada columna, y cómo armar la consulta correcta para una pregunta de negocio en español.

He decidido apoyarme en el patrón ya probado de "chat con tu base de datos" (text-to-SQL con tool-use), pero adaptado a Oracle y endurecido para que sea **imposible** que el agente modifique datos. La fuente de datos ya existe y está poblada; yo solo me conecto a leerla. El entregable de esta primera entrega es el servidor corriendo en mi máquina (localhost), listo para que yo lo abra y empiece a preguntar — con una fase final de QA end-to-end exhaustivo que verifique que todo el flujo funciona contra datos reales.

## Contexto e Investigacion

He investigado a fondo las tres decisiones que definen este producto:

**1. La interfaz de chat (lo que pedí buscar — algo ya funcional y pulido).** Comparé las opciones open-source serias del ecosistema Next.js + Vercel AI SDK: el template completo *Vercel AI Chatbot* (20k+ estrellas, pero viene empaquetado con auth + Postgres + AI Gateway que tendría que desmontar), *assistant-ui* (potente y componible, con su propio runtime), y **AI Elements** — la librería de componentes oficial de Vercel construida **sobre shadcn/ui**. Elegí **AI Elements** porque mi scaffold ya tiene shadcn configurado, sus componentes se **copian a mi repo** (los poseo y los puedo refinar), y trae justo lo que un agente de datos necesita: `Conversation`, `Message`, `PromptInput`, `Response` (markdown con tablas), `Tool` (para mostrar la consulta que ejecutó y sus resultados), `Reasoning` y `Loader`, con streaming y type-safety integrados con el AI SDK. Se instala con el registry de shadcn. Es la opción más simple e inteligente para mi caso: UI lista, sin backend ni auth empaquetados que estorben.

**2. Cómo el agente conoce la BD (lo pesado).** El patrón canónico es **text-to-SQL con herramientas (tool-use)** del Vercel AI SDK v5: el modelo recibe el esquema y dispone de una función `consultarBaseDeDatos` que ejecuta SQL y le devuelve los resultados para que los interprete. Para que "conozca mi casa", al arrancar **introspecto el diccionario de datos de Oracle** — `ALL_TABLES` (tablas), `ALL_TAB_COLUMNS` (columnas y tipos), `ALL_CONSTRAINTS` + `ALL_CONS_COLUMNS` (llaves primarias y foráneas → relaciones), y `ALL_COL_COMMENTS`/`ALL_TAB_COMMENTS` (descripciones humanas si existen) — y construyo con eso un **mapa compacto del esquema** que inyecto en el system prompt, acompañado de un pequeño glosario de negocio y ejemplos de preguntas frecuentes resueltas (few-shot). Si el esquema fuese demasiado grande para el contexto, el agente lo descubre dinámicamente con llamadas a herramientas (listar tablas → pedir columnas de las relevantes), al estilo del *OSS Data Analyst Agent* de referencia de Vercel. La generación de SQL se ancla con Zod para que el modelo devuelva una consulta válida.

**3. La conexión a Oracle (lo que decide si el QA final funciona).** Confirmé que **`node-oracledb` v6 corre en modo Thin (JavaScript puro)** y conecta directo a Oracle **sin necesidad de instalar Oracle Instant Client** — esto simplifica enormemente la puesta en marcha en localhost. El modo Thin soporta Oracle Database 12.1 en adelante (si el servidor fuese 11g, habría que pasar a modo Thick con Instant Client; lo verifico empíricamente al ejecutar). En Next.js solo hay que declarar `oracledb` como paquete externo del servidor (`serverExternalPackages`) para que el bundler no interfiera, inicializar **un pool de conexiones una sola vez** (singleton) y correr las rutas que tocan Oracle en runtime Node (no Edge).

**4. Seguridad — solo-lectura, no negociable.** Como esto apunta a mi BD real, blindo la escritura en **tres capas** (defensa en profundidad): (a) **guard en la aplicación** — normalizo cada consulta generada, exijo que empiece por `SELECT`/`WITH` y rechazo cualquiera que contenga `drop/delete/insert/update/alter/truncate/create/grant/revoke/merge/exec`, devolviendo error sin tocar la BD (patrón del template *natural-language-postgres* de Vercel); (b) **sesión Oracle en modo read-only** (`SET TRANSACTION READ ONLY`), que hace que Oracle rechace a nivel de motor cualquier intento de escritura (ORA-01456); (c) **límite de filas + `callTimeout`** para evitar resultados gigantes o consultas que se cuelguen. La credencial de conexión debería además tener idealmente solo privilegios de lectura.

## Directiva de Stack Tecnico

> **Esta es la directiva inicial.** El PRP, al planear, puede refinarla con la realidad del codebase. Los ajustes se documentan en el campo `Ajustes a la Directiva de Stack` de cada fase y se propagan aqui al cerrar. Es un starting point evolutivo, no un contrato fijo.

### Clasificacion
- **Tipo**: `ai-chatbot` con naturaleza agéntica de `ai-agent` (híbrido genuino: la superficie es un chat conversacional con streaming; el motor es tool-use sobre una base de datos = "chat con tu BD" / text-to-SQL). Documento la ambigüedad por la Regla 6(a): el surface y tu petición explícita de "buscar una UI de chat" mandan, por eso clasifico como `ai-chatbot` primario y tomo de `ai-agent` el patrón de tool-use seguro.
- **Plataforma objetivo**: Web (entrega en localhost para v1; responsive).
- **Compatibilidad con Praxis**: `PARTIAL` — el stack de chat es `MATCH` con el Trust Stack, pero la **capa de datos se reemplaza** (Supabase → Oracle externa, read-only) y el **proveedor de IA** pasa de OpenRouter a OpenAI directo.

### KEEP
- Next.js 16 + React 19 + TypeScript (scaffold actual).
- Tailwind CSS 3.4 + shadcn/ui (ya configurado — `components.json` presente).
- **Vercel AI SDK v5** (streaming nativo + tool-use) — el corazón del agente.
- Zod (schema del tool de consulta + validación de toda entrada).
- Zustand (estado de UI ligero, si hace falta más allá de `useChat`).
- Playwright (QA E2E de la fase final).

### ADD
- `oracledb` (node-oracledb v6.x, **modo Thin** — JS puro, NO requiere Oracle Instant Client) — driver de conexión a Oracle.
- `@ai-sdk/openai` — proveedor OpenAI directo (modelo gpt-5.5).
- `@ai-sdk/react` (`useChat`) — hook de chat con streaming.
- **AI Elements** (vía registry de shadcn) — componentes de chat: `Conversation`, `Message`, `PromptInput`, `Response`, `Tool`, `Reasoning`, `Loader`. Se copian al repo.
- `react-markdown` + `remark-gfm` (render de respuestas con tablas) — entran con `Response` de AI Elements.

### REPLACE
- **Supabase (capa de datos del Trust Stack) → Oracle DB externa, read-only** vía `oracledb`. La BD ya existe y está poblada (productos, clientes, ventas, inventario, compras, facturación). No se crean tablas; solo se lee.
- **OpenRouter (proveedor IA del Trust Stack) → OpenAI directo** (`@ai-sdk/openai`, modelo gpt-5.5, API key provista por mí).

### REMOVE
- `@supabase/supabase-js` + `@supabase/ssr` (no se usan — la fuente de datos es Oracle; sin auth ni persistencia para el MVP localhost).
- Adaptadores Supabase del scaffold.
- Rutas placeholder de auth (login/signup) y dashboard vacío — el producto es una sola pantalla de chat.

### CONFIG
- Variables de entorno en `.env.local` (NUNCA en código fuente ni en este documento): credenciales Oracle (`DB_USER`, `DB_PASSWORD`, `DB_CONNECT_STRING`), `OPENAI_API_KEY` y `OPENAI_MODEL` (= gpt-5.5). **Credenciales provistas por mí; las configura el agente en la ejecución.**
- `next.config.ts`: agregar `serverExternalPackages: ['oracledb']`.
- Pool de conexiones Oracle como singleton de módulo server, reutilizado entre requests.
- Sesión Oracle read-only + guard SELECT-only en la app (defensa en profundidad) + cap de filas + `callTimeout`.
- Las rutas que tocan Oracle corren en runtime **Node** (no Edge).

### Archivos Praxis a eliminar
- `src/core/adapters/supabase/` (browser.ts, server.ts).
- Rutas placeholder: `src/app/(public)/login/`, `src/app/(public)/signup/`, `src/app/(app)/dashboard/` (o quedar fuera del routing — el entry es el chat).

### Archivos nuevos a crear
> Mapa conceptual; el PRP detalla la estructura exacta siguiendo la convención feature-first del scaffold.
- Adaptador Oracle: `src/core/adapters/oracle/` — pool singleton, introspección de esquema, ejecutor read-only con guard.
- Feature `chat`: `src/features/chat/` — componentes (AI Elements), endpoint de chat (streaming), contracts/Zod, definición del tool de consulta, constructor del system prompt con el esquema.
- Pantalla principal de chat (entry de la app).
- Componentes de AI Elements copiados por el registry (`src/components/ai-elements/`).
- `.env.local` (variables) y ajuste de `next.config.ts`.

### IDE / Toolchain externo requerido
- **Acceso de red a la BD Oracle** (`10.30.1.201:1521`) desde la máquina que corre localhost (misma LAN o VPN). **Riesgo clave para el QA E2E.**
- Cuenta OpenAI con la API key provista (ya disponible).
- Node.js (ya disponible). Modo Thin → **NO requiere Oracle Instant Client**.

## Alcance por Fases

> **Modo PRP unico activo**: las 4 fases son el mapa conceptual; el PRP las ejecuta como sub-fases lineales en una sola sesión.

### Fase 1: Cimientos — conexion Oracle read-only + proveedor OpenAI
- **Estado**: COMPLETADO
- **PRP**: PRP-001-copiloto-datos-negocio.md
- **Objetivo high-level**: Capa de datos viva — pool `oracledb` Thin, sesión read-only, guard SELECT-only, cap de filas y timeout — verificada con una consulta real a la BD; y proveedor OpenAI (gpt-5.5) configurado vía variables de entorno.
- **Depende de**: —
- **Aprendizajes heredados**: —
- **Aprendizajes para fases siguientes**: El supuesto "Oracle ≥ 12.1" resultó **falso**: el servidor es 11.2.0.4, que Thin no soporta (NJS-138). Se añadió **modo Thick** opt-in vía `ORACLE_CLIENT_LIB_DIR`. Contra la matriz de certificación de Oracle, el **Instant Client nativo macOS ARM64 (23.3) SÍ conecta a 11.2.0.4** — verificado empíricamente; **sin Docker ni Rosetta**. El 11g no soporta `FETCH FIRST` (12c+): se detecta la versión y se instruye `ROWNUM`. gpt-5.5 verificado disponible.
- **Ajustes a la Directiva de Stack**: ADD opcional `ORACLE_CLIENT_LIB_DIR` (modo Thick). Añadir el paquete core `ai` (no solo los providers). `oracledb` resolvió a v7 (Thick exige IC 19c+).
- **Iniciada**: 2026-06-01
- **Completada**: 2026-06-01

### Fase 2: El cerebro — agente que conoce la BD
- **Estado**: COMPLETADO
- **PRP**: PRP-001-copiloto-datos-negocio.md
- **Objetivo high-level**: Introspección del esquema (tablas, columnas, PK/FK, comentarios) → mapa compacto inyectado en el system prompt + glosario y few-shot; tool `consultarBaseDeDatos` (Zod) que el agente invoca para ejecutar SELECTs read-only y razonar sobre los resultados. **Esta es la fase pesada del proyecto.**
- **Depende de**: Fase 1.
- **Aprendizajes heredados**: La introspección y el tool usan el adaptador Oracle de Fase 1; heredan la dependencia del modo Thick para 11g.
- **Aprendizajes para fases siguientes**: Stack real = Vercel AI SDK **v6** (no v5): `tool({ inputSchema })`, `convertToModelMessages` async, `useChat` sin input propio (`sendMessage({text})`). La introspección degrada el mapa de esquema por presupuesto de caracteres; si la BD no responde, el route usa un system prompt de respaldo. El agente respeta read-only también a nivel conversacional (rechaza pedidos de escritura).
- **Ajustes a la Directiva de Stack**: `@ai-sdk/openai` v3 + `@ai-sdk/react` v3 + `zod` v4 (compatibles con `ai@6`). El endpoint vive en `src/app/api/chat/route.ts` (runtime Node); la lógica del agente en `src/features/chat/services/`.
- **Iniciada**: 2026-06-01
- **Completada**: 2026-06-01

### Fase 3: La interfaz — chat pulido con streaming
- **Estado**: COMPLETADO
- **PRP**: PRP-001-copiloto-datos-negocio.md
- **Objetivo high-level**: Pantalla de chat con AI Elements (`Conversation`/`Message`/`PromptInput`/`Response`/`Tool`/`Reasoning`/`Loader`) conectada vía `useChat` al endpoint de streaming; render de la consulta ejecutada y de los resultados como tabla; estados de carga y error claros.
- **Depende de**: Fase 2.
- **Aprendizajes heredados**: Usa el endpoint y los tipos del tool de Fase 2.
- **Aprendizajes para fases siguientes**: En vez del registry de AI Elements (instalación interactiva + red), se implementaron componentes equivalentes autocontenidos sobre shadcn/Tailwind con control total: `ChatScreen`/`ChatMessage`/`MarkdownResponse`/`ToolCallCard`/`ResultsTable`. El `ToolCallCard` muestra el SQL generado + resultados/errores; markdown con `react-markdown`+`remark-gfm`. Tema oscuro por defecto.
- **Ajustes a la Directiva de Stack**: AI Elements → componentes propios estilo AI Elements (mismo resultado funcional). `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority` añadidos para los componentes.
- **Iniciada**: 2026-06-01
- **Completada**: 2026-06-01

### Fase 4: QA end-to-end exhaustivo + entrega en localhost
- **Estado**: COMPLETADO
- **PRP**: PRP-001-copiloto-datos-negocio.md
- **Objetivo high-level**: Levantar el server en localhost y QA E2E exhaustivo con Playwright contra datos reales — flujo feliz (varias preguntas de negocio: top productos de la semana, ventas por cliente, inventario bajo, etc.) y flujos de error (pregunta ambigua, BD inalcanzable, consulta sin resultados, intento de escritura bloqueado); más `tsc --noEmit`, `lint` y `build` de producción. **Entregable: la URL de localhost lista para probar.**
- **Depende de**: Fase 3.
- **Aprendizajes heredados**: Validación con Playwright + el guard con tests de unidad.
- **Aprendizajes para fases siguientes**: `tsc`/`lint`/`build` limpios; guard 20/20. QA E2E con gpt-5.5 **real y datos reales**: UI, streaming, tool-use, SQL Oracle, render del `ToolCallCard`, rechazo de escritura, y **consultas de negocio reales** (`¿cuántos clientes?` → 7.523) — todo validado en vivo (screenshots en `qa-screens/`, incl. `R1-clientes.png`). El server corre en `http://localhost:3000` con el Instant Client nativo ARM64 (Thick).
- **Ajustes a la Directiva de Stack**: Playwright instalado en esta fase (`@playwright/test` + Chromium). `next lint` fue removido en Next 16 → ESLint flat config (`eslint.config.mjs`, script `eslint .`).
- **Iniciada**: 2026-06-01
- **Completada**: 2026-06-01

## Supuestos (deben ser verdad)

- [ ] La máquina local puede alcanzar por red el host Oracle `10.30.1.201:1521` (misma LAN o VPN). Sin esto, el QA E2E contra datos reales no es posible.
- [ ] Las credenciales `renopartes_dev` tienen privilegios de lectura (SELECT/READ) sobre las tablas de negocio **y** sobre las vistas del diccionario de datos (`ALL_TABLES`, `ALL_TAB_COLUMNS`, etc.) para la introspección.
- [x] ~~El servidor Oracle es versión **12.1 o superior**~~ **FALSO (verificado 2026-06-01)**: es 11.2.0.4 (NJS-138 en Thin). **Resuelto**: modo Thick con el Instant Client **nativo macOS ARM64 (23.3)**, que conecta a 11.2.0.4 sin Docker ni Rosetta (`ORACLE_CLIENT_LIB_DIR=~/oracle-ic-arm64`). Ajuste adicional: SQL compatible 11g (`ROWNUM`, no `FETCH FIRST`). Ver PRP-001 `## Aprendizajes`.
- [ ] El modelo `gpt-5.5` existe y la API key provista tiene acceso a él. Si el identificador difiere, es un cambio de una sola variable de entorno.
- [ ] La BD ya está poblada con datos reales de negocio (productos, clientes, ventas, inventario, compras, facturación).

## Fuera de Alcance (NO construir en este brief)

- Autenticación / login / multiusuario (herramienta personal en localhost para el MVP).
- **Cualquier escritura en la BD** — el agente es estrictamente read-only (jamás INSERT/UPDATE/DELETE/DDL).
- Persistencia del historial de chat entre sesiones (la conversación vive en la sesión; persistir es mejora futura).
- Despliegue a producción / hosting público (el entregable es localhost; producción requeriría auth, gestión de secretos y red al Oracle — fase futura).
- Gráficos/dashboards avanzados (el MVP responde texto + tablas; visualización con charts es mejora futura).
- Modificar el esquema Oracle o crear tablas.

## Evaluacion

| Dimension | Nivel | Nota |
|-----------|-------|------|
| Complejidad tecnica | Media-Alta | Lo pesado es el grounding del esquema y el tool-use seguro; la UI es estándar (AI Elements lista). |
| Riesgo / dependencias externas | Alto | Depende de alcanzar la red Oracle interna y de que gpt-5.5 esté disponible con la key provista. |
| Esfuerzo estimado | 4 fases (1 PRP monolitico) | Ejecutadas como sub-fases lineales en una sola sesión. |
| Costos externos recurrentes | Variable (tokens OpenAI por consulta) | Sin infraestructura nueva; la BD Oracle ya existe. |

## Fuentes Consultadas

- https://vercel.com/templates/next.js/natural-language-postgres — template canónico "chat con tu BD" (text-to-SQL): genera SQL desde lenguaje natural, lo corre y muestra tabla + gráfico; base del patrón de guard read-only.
- https://github.com/vercel-labs/natural-language-postgres — repo del anterior: estructura (app/components/lib), acciones `generateQuery`/`runGenerateSQLQuery`/`explainQuery`/`generateChartConfig`.
- https://vercel.com/templates/ai/oss-data-analyst-agent-reference-architecture — patrón de agente analista que descubre el esquema dinámicamente (semantic layer) en vez de hardcodearlo.
- https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk — guía oficial de agentes con tool-use y loop (`stopWhen`) en AI SDK v5.
- https://ai-sdk.dev/providers/ai-sdk-providers/openai — proveedor `@ai-sdk/openai`: uso con `streamText` + tools.
- https://vercel.com/blog/ai-sdk-5 — AI SDK 5: mejoras de tool-use (dynamic tools, type-safety, lifecycle hooks).
- https://elements.ai-sdk.dev/ y https://github.com/vercel/ai-elements — AI Elements: componentes de chat sobre shadcn/ui, integración con `useChat`, instalación por registry (`npx shadcn@latest add https://elements.ai-sdk.dev/api/registry/all.json`).
- https://github.com/assistant-ui/assistant-ui — alternativa de UI componible con runtime propio y generative UI (evaluada, no elegida).
- https://node-oracledb.readthedocs.io/en/latest/user_guide/connection_handling.html — conexión y pools de `oracledb`; modo Thin por defecto.
- https://node-oracledb.readthedocs.io/en/latest/user_guide/appendix_a.html — modos Thin vs Thick: Thin no requiere Oracle Client; requisitos de versión.
- https://cjones-oracle.medium.com/using-node-oracledb-thick-mode-in-next-js-d74a40421a7e — `oracledb` en Next.js: Thin funciona sin setup; `serverExternalPackages: ['oracledb']` para el bundler.
- https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/ALL_TAB_COLUMNS.html — vista de diccionario para introspección de columnas.
- https://oracle-base.com/articles/12c/read-object-privilege-12cr1 — privilegio READ (solo-lectura sin lock) para usuarios de consulta.
