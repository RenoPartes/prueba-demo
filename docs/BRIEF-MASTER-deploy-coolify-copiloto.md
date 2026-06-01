# Brief Master: Puesta en Producción del Copiloto de Datos en Coolify

> Fecha: 2026-06-01
> **Modo de ejecucion**: `PRP unico` (todas las fases declaradas abajo se ejecutan como sub-fases de UN solo PRP monolitico — ver seccion `## Modo: PRP unico` debajo del TL;DR)

## TL;DR

Quiero llevar mi **Copiloto de Datos del Negocio** (Next.js 16 + Vercel AI SDK v6 + OpenAI + `node-oracledb`, ya terminado) a producción dentro de mi **Coolify self-hosted** en una máquina local, empaquetándolo en un contenedor Docker que incluya el **Oracle Instant Client** (mi Oracle es 11.2.0.4 y exige modo Thick). El contenedor se conecta a mi Oracle de la LAN (`10.30.1.201:1521`) y se publica en internet bajo el subdominio **`ia.renopartes.com`** mediante un **Cloudflare Tunnel** (sin abrir puertos ni IP pública), con TLS terminado en el edge de Cloudflare. Stack Praxis se mantiene íntegro (`MATCH`); solo añado los artefactos de empaquetado e infraestructura.

## Modo: PRP unico

Este brief activa explicitamente el modo "PRP unico". Significa:

- **El `prp/SKILL.md` Paso 0 al leer este brief debe generar UN unico PRP** (no N) que cubra todas las fases declaradas abajo como sub-fases del Plan de implementacion. La numeracion de fases en `## Alcance por Fases` se mantiene como mapa conceptual; el PRP unico las trata como sub-fases lineales.
- **El `bucle-agentico` ejecuta las sub-fases del PRP unico en una sola sesion** y al cerrar marca todas las fases del `## Alcance por Fases` del brief como `COMPLETADO` simultaneamente.
- **Default sigue siendo 1-PRP-por-fase** para briefs sin esta seccion.

## Mi Vision

Construí el Copiloto para que cualquiera en el negocio pregunte en español sobre la base de datos Oracle y reciba una respuesta clara, con el SQL ejecutado y la tabla de resultados, sin poder jamás escribir ni dañar nada (defensa de solo lectura en 3 capas). La app ya funciona y está verificada contra mi Oracle 11.2.0.4. Lo único que me falta es **decidir dónde vive y que sea alcanzable** de forma estable y segura desde internet.

He decidido que viva en mi propia infraestructura: una **máquina local** donde ya corre **Coolify**, mi PaaS self-hosted. No quiero depender de Vercel ni de un cloud externo, porque mi Oracle vive en la misma LAN y la latencia y el control de datos importan. La pieza que vuelve esto no trivial es que **mi Oracle es 11g (11.2.0.4)**: el driver `node-oracledb` no lo soporta en modo Thin, así que el contenedor de producción **debe** llevar dentro el Oracle Instant Client (modo Thick) — y eso me obliga a salir del Dockerfile estándar de Next.js (que usa Alpine/musl) hacia una imagen basada en Debian (glibc), que es la única donde el Instant Client funciona.

Para exponerlo a internet elegí un **Cloudflare Tunnel**: mi máquina es local y está detrás de NAT, así que no quiero abrir puertos ni depender de una IP pública. El túnel publica `ia.renopartes.com` (mi dominio ya está en Cloudflare) apuntando al proxy interno de Coolify, y Cloudflare maneja el HTTPS en su edge. Es la arquitectura más limpia y segura para un home/office server.

El norte es simple: **un solo PRP monolítico** que tome la app tal como está, la empaquete bien, la conecte a Oracle desde dentro del contenedor, y la deje viva en `https://ia.renopartes.com` — sin que yo tenga que tipear comandos ni editar archivos.

## Contexto e Investigacion

He mapeado a fondo tanto el código como la "casa" donde va a vivir. Esto es lo que sé:

**El proyecto (descifrado del codebase):**
- Next.js 16 (App Router) con una sola pantalla de chat y un endpoint `/api/chat` que corre en `runtime = 'nodejs'` con `maxDuration = 60`, hace streaming con AI SDK v6 y usa OpenAI (`gpt-5.5` por defecto).
- `next.config.ts` ya declara `serverExternalPackages: ['oracledb']` (el bundler no debe empaquetar el binario nativo). **Falta** `output: 'standalone'`, que es lo que hace viable una imagen Docker chica.
- El adaptador Oracle (`src/core/adapters/oracle/pool.ts`) ya soporta modo Thick: si existe `ORACLE_CLIENT_LIB_DIR`, llama `initOracleClient({ libDir, configDir })`. Acepta `ORACLE_CLIENT_CONFIG_DIR`/`TNS_ADMIN` para un `sqlnet.ora` (necesario si el 11g diera `ORA-28040`).
- La configuración degrada con gracia: si faltan envs, la app levanta igual y responde un aviso claro en vez de crashear (`src/core/config/env.ts`). Esto me da un arranque seguro en Coolify.
- Seguridad de datos ya resuelta: guard de aplicación (solo `SELECT`/`WITH`, una sentencia, sin DDL/DML) + sesión `SET TRANSACTION READ ONLY` + límites de filas/timeout.
- Detalle que tengo que cerrar antes de publicar: el `.gitignore` actual solo ignora `.claude/` y `*.node` — **`.env.local` NO está ignorado**. Antes de empujar el repo a cualquier lado debo endurecer el `.gitignore` para no filtrar secretos.

**La casa (Coolify + Cloudflare, investigado en la web):**
- Coolify usa **Traefik** como reverse proxy y normalmente emite SSL Let's Encrypt automático. Pero cuando el tráfico entra por **Cloudflare Tunnel**, el SSL lo maneja Cloudflare en el edge: el dominio de la app en Coolify se configura como **`http://ia.renopartes.com`** (no `https://`, eso causa `TOO_MANY_REDIRECTS`), con el modo SSL de Cloudflare en **Full**. Let's Encrypt no aplica aquí porque el desafío HTTP-01 no puede validar un puerto 80 que no es público.
- El **Cloudflare Tunnel** se monta como un servicio `cloudflared` dentro de Coolify (con el token del túnel). En el dashboard de Cloudflare se crea un *public hostname* `ia.renopartes.com` de tipo HTTP apuntando a `localhost:80` (el proxy de Coolify). Un solo túnel enruta todos los recursos por host header; no hace falta port-forwarding ni IP pública. Es gratis.
- Para `node-oracledb` en Linux el Instant Client requiere **glibc + `libaio`**, por lo que **Alpine no sirve** (usa musl). La práctica establecida es una imagen Debian (`bookworm-slim`): descargar el Instant Client `basiclite`, descomprimir en `/opt/oracle`, instalar `libaio1`, correr `ldconfig`, y apuntar `ORACLE_CLIENT_LIB_DIR` a esa carpeta. El cliente Linux 19c soporta de sobra a Oracle 11.2.
- El patrón Docker correcto para Next standalone es multi-stage (deps → builder → runner) copiando `.next/standalone`, `.next/static` y `public` al runner. Lo combino con la base Debian + Instant Client.
- Coolify despliega desde un repositorio Git (vía deploy key o GitHub App) usando build pack **Dockerfile**; Nixpacks no me sirve porque no incluiría el Instant Client. Como el proyecto hoy no es un repo Git, el plan incluye inicializarlo y conectarlo a una fuente que Coolify pueda leer.

**Decisiones que ya tomé** (confirmadas contigo): exposición por **Cloudflare Tunnel**, DNS **en Cloudflare**, subdominio **`ia.renopartes.com`**, y Oracle alcanzable en la **misma LAN** que Coolify.

## Directiva de Stack Tecnico

> **Esta es la directiva inicial.** Cada fase, al ser planeada por el PRP, puede refinarla con realidad actual del codebase. Los ajustes acumulados se documentan en el campo `Ajustes a la Directiva de Stack` de cada fase del `## Alcance por Fases`. Al cerrar cada PRP, los ajustes se propagan aqui automaticamente. Esta directiva es un **starting point evolutivo**, no un contrato fijo.

### Clasificacion
- **Tipo**: `ai-agent` (en fase de despliegue / DevOps — no se construyen features nuevas)
- **Plataforma objetivo**: Web pública servida desde contenedor Docker en Coolify self-hosted (máquina local), expuesta vía Cloudflare Tunnel
- **Compatibilidad con Praxis**: `MATCH` — el stack de la app se conserva entero; solo se añaden artefactos de empaquetado e infraestructura

### KEEP
- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 3.4 + shadcn/ui
- Vercel AI SDK v6 (`ai@6`, `@ai-sdk/openai@3`, `@ai-sdk/react@3`) + OpenAI (`gpt-5.5`)
- `node-oracledb@7` (modo Thick ya soportado por el adaptador)
- Zod (validación de entrada y schemas de tool) + Zustand
- Defensa de solo lectura en 3 capas (guard + sesión read-only + límites) — intacta
- Degradación elegante ante envs faltantes — intacta

### ADD
- **Dockerfile multi-stage** (deps → builder → runner) con runner basado en **Debian `bookworm-slim`** (glibc), NO Alpine
- **Oracle Instant Client `basiclite` para Linux** (arquitectura igual a la del host Coolify: x64 o ARM64/aarch64) embebido en la imagen + paquete `libaio1`
- **`.dockerignore`** (excluye `node_modules`, `.next`, `.git`, `.env*`, `.claude`, `qa-screens`, etc.)
- **Servicio `cloudflared`** en Coolify (no es dependencia del repo; se despliega como recurso aparte con el token del túnel)
- **Repositorio Git** del proyecto conectado a Coolify (deploy key o GitHub App) — el proyecto hoy no es un repo

### REPLACE
- Ninguno (no se reemplaza ninguna capa del stack de la app)

### REMOVE
- Ninguno

### CONFIG
- **`next.config.ts`**: añadir `output: 'standalone'` (manteniendo `serverExternalPackages: ['oracledb']` y `experimental.mcpServer`; evaluar si `mcpServer` debe quedar fuera de producción)
- **`.gitignore`**: endurecer antes de cualquier push — añadir `node_modules/`, `.next/`, `.env*` (excepto `.env.local.example`), `*.tsbuildinfo`, `qa-screens/`. **Crítico de seguridad** para no filtrar `.env.local`
- **Variables de entorno en la UI de Coolify** (nunca commiteadas): `DB_USER`, `DB_PASSWORD`, `DB_CONNECT_STRING=10.30.1.201:1521/<servicio>`, `DB_SCHEMA` (opcional), `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5.5`, `ORACLE_CLIENT_LIB_DIR=<ruta del Instant Client dentro de la imagen, ej. /opt/oracle/instantclient_19_x>`, y opcional `ORACLE_CLIENT_CONFIG_DIR` si hace falta `sqlnet.ora` por `ORA-28040`
- **Puerto interno** expuesto por el contenedor: `3000` (configurar en Coolify como puerto de la app)
- **Dominio en Coolify**: `http://ia.renopartes.com` (HTTP, no HTTPS — Cloudflare termina TLS)
- **Cloudflare**: SSL/TLS en modo **Full**; public hostname `ia.renopartes.com` (HTTP) → `localhost:80`
- **Política de reinicio** del contenedor: `unless-stopped` / restart automático en Coolify

### Archivos Praxis a eliminar
- Ninguno

### Archivos nuevos a crear
- `Dockerfile` (raíz)
- `.dockerignore` (raíz)
- (opcional) `oracle/sqlnet.ora` solo si el 11g exige `SQLNET.ALLOWED_LOGON_VERSION_CLIENT=11`
- (posible) `docs/DEPLOY.md` con el runbook de despliegue para futuras releases

### IDE / Toolchain externo requerido
- Instancia de **Coolify** operativa en la máquina local (ya existe)
- Cuenta de **Cloudflare** con `renopartes.com` gestionado (ya existe) + permiso para crear un túnel
- Una fuente Git que Coolify pueda leer (GitHub/Gitea/repo privado) — el agente ejecuta los comandos git por ti
- Credencial Oracle de **solo lectura** válida + clave **OpenAI** válida con acceso a `gpt-5.5`

## Alcance por Fases

> **Modo PRP unico activado**: las fases de abajo son el **mapa conceptual** que el PRP único tratará como sub-fases lineales en un solo plan. El `bucle-agentico` las ejecuta en una sola sesión y, al cerrar, marca todas como `COMPLETADO` simultáneamente. Todas comparten el mismo número de PRP.

### Fase 1: Empaquetar la app para contenedor (Dockerfile + Instant Client + standalone)
- **Estado**: PENDIENTE
- **PRP**: —
- **Objetivo high-level**: La app construye una imagen Docker Debian-slim con `output: 'standalone'`, el Oracle Instant Client embebido y `libaio`, lista para correr modo Thick localmente
- **Depende de**: —
- **Aprendizajes heredados**: —
- **Aprendizajes para fases siguientes**: —
- **Ajustes a la Directiva de Stack**: —
- **Iniciada**: —
- **Completada**: —

### Fase 2: Endurecer el repositorio y conectarlo a Coolify
- **Estado**: PENDIENTE
- **PRP**: —
- **Objetivo high-level**: El proyecto es un repo Git con `.gitignore` seguro (sin `.env.local`) y `.dockerignore`, conectado como fuente en Coolify con build pack Dockerfile
- **Depende de**: Fase 1
- **Aprendizajes heredados**: —
- **Aprendizajes para fases siguientes**: —
- **Ajustes a la Directiva de Stack**: —
- **Iniciada**: —
- **Completada**: —

### Fase 3: Configurar el servicio en Coolify y verificar la conexión a Oracle
- **Estado**: PENDIENTE
- **PRP**: —
- **Objetivo high-level**: Las variables de entorno están cargadas en Coolify, el contenedor levanta y se confirma que alcanza y consulta el Oracle `10.30.1.201:1521` en modo Thick desde dentro del contenedor
- **Depende de**: Fase 2
- **Aprendizajes heredados**: —
- **Aprendizajes para fases siguientes**: —
- **Ajustes a la Directiva de Stack**: —
- **Iniciada**: —
- **Completada**: —

### Fase 4: Exponer por Cloudflare Tunnel bajo `ia.renopartes.com`
- **Estado**: PENDIENTE
- **PRP**: —
- **Objetivo high-level**: El servicio `cloudflared` corre en Coolify, el public hostname `ia.renopartes.com` enruta a `localhost:80`, el dominio de la app en Coolify es `http://ia.renopartes.com` y Cloudflare SSL está en Full
- **Depende de**: Fase 3
- **Aprendizajes heredados**: —
- **Aprendizajes para fases siguientes**: —
- **Ajustes a la Directiva de Stack**: —
- **Iniciada**: —
- **Completada**: —

### Fase 5: Validación end-to-end y blindaje de producción
- **Estado**: PENDIENTE
- **PRP**: —
- **Objetivo high-level**: Desde internet, `https://ia.renopartes.com` carga, responde una consulta real sobre la BD con SQL + tabla, el guard read-only se sostiene, y quedan verificados tsc/lint/build + política de reinicio y runbook
- **Depende de**: Fase 4
- **Aprendizajes heredados**: —
- **Aprendizajes para fases siguientes**: —
- **Ajustes a la Directiva de Stack**: —
- **Iniciada**: —
- **Completada**: —

## Supuestos (deben ser verdad)

- [ ] Coolify ya está instalado y operativo en la máquina local, con su proxy (Traefik) disponible.
- [ ] La máquina de Coolify alcanza el Oracle `10.30.1.201:1521` en la misma LAN (confirmado) — y el **contenedor** también lo alcanzará por la red bridge de Docker (a verificar desde dentro del contenedor en Fase 3).
- [ ] El Oracle es 11.2.0.4 y requiere modo Thick; el Instant Client Linux 19c (basiclite) conecta a esa versión.
- [ ] La arquitectura del host de Coolify (x64 o ARM64) se conocerá en Fase 1 para descargar el Instant Client correcto; la imagen se construye sobre el host, así que coincide.
- [ ] `renopartes.com` tiene su DNS gestionado por Cloudflare (confirmado) y tengo permiso para crear un Cloudflare Tunnel.
- [ ] Existe una credencial Oracle de solo lectura con acceso a las tablas de negocio y al diccionario (`ALL_TABLES`, etc.).
- [ ] Tengo una clave OpenAI válida con acceso al modelo `gpt-5.5` (o un id de modelo alternativo que configuraré en `OPENAI_MODEL`).
- [ ] Si el 11g rechaza el login por verificadores viejos (`ORA-28040`), puedo añadir un `sqlnet.ora` con `SQLNET.ALLOWED_LOGON_VERSION_CLIENT=11`.

## Fuera de Alcance (NO construir en este brief)

- Autenticación/login de usuarios: la app hoy es chat abierto; no se añade control de acceso en este PRP (si se quiere, será un brief aparte; mientras tanto, el acceso se restringe a nivel red/Cloudflare si hace falta).
- Cambios funcionales al agente, al guard de solo lectura, al system prompt o a la UI de chat.
- Migración de Oracle, cambios de esquema o nuevas tablas.
- CI/CD avanzado (pipelines, tests automáticos en cada push), observabilidad (Langfuse/LangSmith), métricas y alertas.
- Escalado horizontal, réplicas o balanceo — un solo contenedor es suficiente para este uso.
- Cualquier reescritura del stack o de la arquitectura feature-first.

## Evaluacion

| Dimension | Nivel | Nota |
|-----------|-------|------|
| Complejidad tecnica | Media | La app está lista; la complejidad está en el Dockerfile con Instant Client (glibc, no Alpine) y el wiring del túnel |
| Riesgo / dependencias externas | Medio | Conectividad contenedor→Oracle 11g en modo Thick y la terminación TLS por Cloudflare son los puntos a verificar empíricamente |
| Esfuerzo estimado | 5 fases (1 PRP monolítico) | Una sola sesión de ejecución del bucle-agentico |
| Costos externos recurrentes | ~$0/mes infra + consumo OpenAI | Coolify y Cloudflare Tunnel son gratis; el costo variable es el uso de la API de OpenAI |

## Fuentes Consultadas

- https://coolify.io/docs/integrations/cloudflare/tunnels/all-resource — config exacta del túnel: dominio en Coolify como `http://`, SSL Cloudflare en Full, public hostname → `localhost:80`, sin port-forwarding.
- https://coolify.io/docs/knowledge-base/proxy/traefik/overview — Traefik como proxy por defecto de Coolify y manejo de dominios/SSL.
- https://lumadock.com/tutorials/deploy-nextjs-on-coolify — flujo de despliegue de Next.js en Coolify (build packs, pestaña Domains).
- https://github.com/oracle/node-oracledb/blob/main/doc/src/user_guide/installation.rst — requisitos del Instant Client en Linux: `libaio`, glibc ≥ 2.14, pasos de Dockerfile, `ldconfig`.
- https://github.com/oracle/docker-images/blob/main/OracleInstantClient/README.md — imágenes/pasos oficiales de Instant Client en contenedores Debian.
- https://nextjs.org/docs/app/getting-started/deploying — `output: 'standalone'` y despliegue self-hosted de Next.js.
- https://www.buildwithmatija.com/blog/nextjs-standalone-dockerfile-guide — patrón multi-stage (deps/builder/runner) y qué copiar (`standalone`, `static`, `public`).
- https://coolify.io/docs/integrations/cloudflare/tunnels/overview — Cloudflare Tunnel para servidores sin IP pública / detrás de CGNAT.
