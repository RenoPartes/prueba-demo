# Copiloto de Datos del Negocio

Un chat donde preguntás en español sobre tu base de datos Oracle —*"¿cuáles son los productos más vendidos esta semana?"*— y un agente de IA traduce tu pregunta a SQL, la corre en **solo lectura** contra tu Oracle, y te responde en texto claro con la consulta que ejecutó y una tabla de resultados. El agente conoce tu esquema real (lo introspecta del diccionario de datos) y **nunca** puede escribir ni dañar la base de datos.

Construido con Praxis sobre Next.js 16 + Vercel AI SDK + OpenAI (gpt-5.5) + node-oracledb.

---

## Cómo funciona

1. Escribís una pregunta de negocio en la pantalla de chat.
2. El agente (gpt-5.5) recibe en su contexto el **mapa real de tu esquema** (tablas, columnas, relaciones PK/FK y comentarios) y genera una consulta **SQL Oracle**.
3. La consulta pasa por una **defensa de solo lectura en 3 capas** y, si es segura, se ejecuta.
4. El modelo interpreta las filas y responde en lenguaje natural, en streaming, mostrando además el SQL ejecutado y la tabla de resultados.

### Seguridad: solo lectura, no negociable

| Capa | Qué hace |
|------|----------|
| 1. Guard de aplicación | Exige que la consulta empiece por `SELECT`/`WITH`, sea una sola sentencia y no contenga ninguna palabra de escritura/DDL/PLSQL. Rechaza antes de tocar la BD. (`src/core/adapters/oracle/guard.ts`, 20 tests) |
| 2. Sesión Oracle read-only | `SET TRANSACTION READ ONLY` — Oracle rechaza cualquier escritura a nivel de motor (ORA-01456). |
| 3. Límites | Tope de filas + `callTimeout` para evitar resultados gigantes o consultas colgadas. |

El agente **jamás** ejecuta INSERT/UPDATE/DELETE/DDL.

---

## Configuración

Copiá `.env.local.example` a `.env.local` y completá los valores (este archivo está gitignored: nunca pongas secretos en el código):

```
DB_USER=...                 # usuario Oracle con permisos de LECTURA
DB_PASSWORD=...
DB_CONNECT_STRING=host:1521/servicio   # formato EZConnect: host:puerto/servicio
DB_SCHEMA=                  # opcional; si se omite, se descubre solo
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5        # cambialo si tu cuenta usa otro id
ORACLE_CLIENT_LIB_DIR=      # opcional; ver "Versión de Oracle" abajo
```

### Versión de Oracle (importante)

- **Oracle ≥ 12.1**: funciona directo en **modo Thin** (JavaScript puro, sin instalar nada). Dejá `ORACLE_CLIENT_LIB_DIR` vacío.
- **Oracle < 12.1 (p. ej. 11g)**: el modo Thin no lo soporta (error `NJS-138`). Se usa **modo Thick** con **Oracle Instant Client**: descargalo y apuntá `ORACLE_CLIENT_LIB_DIR` a su carpeta. El Instant Client debe ser de la **misma arquitectura que Node**.

  **En macOS Apple Silicon (ARM64) funciona de forma nativa** — verificado contra un servidor 11.2.0.4. No hace falta Rosetta ni Docker. Pasos (una vez):

  ```bash
  # Descargar e instalar el Instant Client nativo ARM64 (basiclite)
  curl -L -o /tmp/ic.dmg https://download.oracle.com/otn_software/mac/instantclient/instantclient-basiclite-macos-arm64.dmg
  hdiutil attach /tmp/ic.dmg -nobrowse -mountpoint /tmp/icmnt
  mkdir -p ~/oracle-ic-arm64 && cp -R /tmp/icmnt/. ~/oracle-ic-arm64/
  hdiutil detach /tmp/icmnt
  xattr -dr com.apple.quarantine ~/oracle-ic-arm64   # quita la cuarentena de macOS
  ```

  Luego en `.env.local`: `ORACLE_CLIENT_LIB_DIR=/Users/<vos>/oracle-ic-arm64`. Listo, `npm run dev` ya lee tu 11g.

  > Nota: la *matriz de certificación* de Oracle dice que el cliente 23ai no soporta 11.2, pero en la práctica el cliente nativo ARM64 23.x **sí conecta** a 11.2.0.4 (lo verificamos). Si tu 11g tuviera verificadores de contraseña muy viejos y diera `ORA-28040`, agregá un `sqlnet.ora` con `SQLNET.ALLOWED_LOGON_VERSION_CLIENT=11` y apuntá `ORACLE_CLIENT_CONFIG_DIR` a su carpeta.

  En Linux/Windows/Intel usá el Instant Client de esa plataforma (19c+ también sirve).

---

## Comandos

```bash
npm install          # instalar dependencias
npm run dev          # servidor de desarrollo (Turbopack) en http://localhost:3000
npm run build        # build de producción
npm run start        # servir el build de producción
npm run lint         # ESLint (flat config)
npm run typecheck    # tsc --noEmit
npm run test:guard   # tests del guard de solo lectura
```

Abrí la URL que imprime el server y empezá a preguntar.

---

## Estructura

```
src/
├── app/
│   ├── api/chat/route.ts        # endpoint de streaming (runtime Node) — ata agente + tool + UI
│   ├── layout.tsx · page.tsx    # entry: la pantalla de chat
│   └── globals.css              # tokens de diseño (shadcn/ui, dark)
├── core/
│   ├── adapters/oracle/         # pool (Thin/Thick), guard, ejecutor read-only, introspección
│   ├── config/env.ts            # acceso tipado y validado a variables de entorno
│   ├── lib/utils.ts             # cn()
│   └── ui/button.tsx            # primitivo shadcn
└── features/chat/
    ├── components/              # ChatScreen, ChatMessage, MarkdownResponse, ToolCallCard, ResultsTable
    ├── services/                # system-prompt (esquema + glosario), consultar-tool (Zod + ejecutor)
    └── types/contracts.ts       # schemas Zod + tipos del tool
```

Convención **feature-first**: el contexto de cada feature vive en su carpeta. Detalles y reglas en `CLAUDE.md`.

---

## Stack

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 16 + React 19 + TypeScript |
| Estilos | Tailwind CSS 3.4 + shadcn/ui (tema oscuro) |
| Agente IA | Vercel AI SDK v6 (`streamText` + tool-use) + OpenAI (gpt-5.5) |
| Base de datos | Oracle (solo lectura) vía `node-oracledb` (Thin/Thick) |
| UI de chat | Componentes estilo AI Elements + `react-markdown` + `remark-gfm` |
| Validación | Zod |
| Testing | Playwright + tests de unidad del guard |

> Este proyecto fue planificado y ejecutado con la metodología Praxis (`brief → prp → bucle-agentico`). El plan y los aprendizajes viven en `.claude/PRPs/PRP-001-copiloto-datos-negocio.md`.
