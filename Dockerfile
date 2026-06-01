# syntax=docker/dockerfile:1

# ============================================================================
# Copiloto de Datos del Negocio — imagen de produccion
# Next.js 16 (output: standalone) + node-oracledb modo Thick (Oracle Instant
# Client 19, que soporta Oracle Database 11.2).
# El runner es Debian (glibc): el Instant Client NO funciona en Alpine (musl).
# ============================================================================

# ---- Stage 1: deps — todas las dependencias (incluye dev, necesarias para build) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: builder — compila Next.js en modo standalone ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Stage 3: runner — imagen final con Oracle Instant Client ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_19_24 \
    ORACLE_CLIENT_CONFIG_DIR=/opt/oracle/network/admin

# Oracle Instant Client 19 (Basic Lite). Se elige x64 o arm64 segun la
# arquitectura del host que construye la imagen (Coolify la construye en su host).
ARG IC_X64_URL="https://download.oracle.com/otn_software/linux/instantclient/1924000/instantclient-basiclite-linux.x64-19.24.0.0.0dbru.zip"
ARG IC_ARM64_URL="https://download.oracle.com/otn_software/linux/instantclient/1924000/instantclient-basiclite-linux.arm64-19.24.0.0.0dbru.zip"
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget unzip libaio1 libnsl2 \
  && case "$(dpkg --print-architecture)" in \
       amd64) IC_URL="$IC_X64_URL" ;; \
       arm64) IC_URL="$IC_ARM64_URL" ;; \
       *) echo "Arquitectura no soportada: $(dpkg --print-architecture)" >&2; exit 1 ;; \
     esac \
  && mkdir -p /opt/oracle \
  && wget -q -O /tmp/ic.zip "$IC_URL" \
  && unzip -q /tmp/ic.zip -d /opt/oracle \
  && rm -f /tmp/ic.zip \
  && echo "/opt/oracle/instantclient_19_24" > /etc/ld.so.conf.d/oracle-instantclient.conf \
  && ldconfig \
  && apt-get purge -y --auto-remove wget unzip \
  && rm -rf /var/lib/apt/lists/*

# sqlnet.ora: permite el handshake con servidores Oracle 11g antiguos (evita ORA-28040).
COPY oracle/sqlnet.ora /opt/oracle/network/admin/sqlnet.ora

# Usuario no-root para correr el server.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Artefactos del build standalone. (Este proyecto no tiene carpeta public/.)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Garantiza el binario nativo de oracledb (Linux) en el runner: serverExternalPackages
# lo deja fuera del bundle, asi que lo copiamos explicitamente. oracledb no tiene deps.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/oracledb ./node_modules/oracledb

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
