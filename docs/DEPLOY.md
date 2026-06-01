# Runbook de despliegue — Copiloto de Datos en Coolify + Cloudflare Tunnel

> Objetivo: la app vive en un contenedor en Coolify (máquina local) y se publica en
> `https://ia.renopartes.com` por un Cloudflare Tunnel. TLS lo termina Cloudflare.
> Origen del plan: `PRP-002-deploy-coolify-copiloto`.

## Resumen de la arquitectura

```
Internet ──TLS──> Cloudflare (edge) ──Cloudflare Tunnel──> cloudflared (host Coolify)
                                                              │  http://localhost:80
                                                              ▼
                                                   Coolify / Traefik (proxy)
                                                              │  enruta por Host: ia.renopartes.com
                                                              ▼
                                                   Contenedor de la app  (puerto interno 3000)
                                                              │  node-oracledb Thick (Instant Client 19)
                                                              ▼
                                                   Oracle 11.2.0.4  @ 10.30.1.201:1521  (LAN)
```

- **Puerto interno de la app**: `3000` (fijado en la imagen: `PORT=3000`, `EXPOSE 3000`).
- **Puerto al que apunta el túnel**: `80` (el proxy de Coolify), enrutando por el dominio.
- **DNS**: lo crea automáticamente Cloudflare al añadir el *Public Hostname* en el túnel (un CNAME a `<tunnel>.cfargotunnel.com`). No hay que crear un registro A con puerto.

## 1. La imagen (ya preparado en el repo)

- `Dockerfile` — multi-stage Debian + Oracle Instant Client 19 (modo Thick). `next.config.ts` con `output: 'standalone'`.
- `oracle/sqlnet.ora` — `ALLOWED_LOGON_VERSION_CLIENT=11` (evita `ORA-28040` con el 11g).
- `.dockerignore` y `.gitignore` — los secretos (`.env.local`) nunca entran ni al repo ni a la imagen.

## 2. Crear la app en Coolify

1. **New Resource → Application**.
2. **Source**: el repositorio Git donde vive este código (privado).
3. **Build Pack**: `Dockerfile` (NO Nixpacks — no incluiría el Instant Client).
4. **Port (Ports Exposes)**: `3000`.
5. **Environment Variables** (pestaña *Environment Variables* — se guardan cifradas, no en el repo):

   ```
   DB_USER=<usuario oracle de solo lectura>
   DB_PASSWORD=<password>
   DB_CONNECT_STRING=10.30.1.201:1521/<servicio>
   DB_SCHEMA=<opcional>
   OPENAI_API_KEY=<sk-...>
   OPENAI_MODEL=gpt-5.5
   ```

   > `ORACLE_CLIENT_LIB_DIR` y `ORACLE_CLIENT_CONFIG_DIR` ya vienen fijados en la imagen
   > (apuntan al Instant Client y al `sqlnet.ora` embebidos). No hace falta declararlos en Coolify.

6. **Domains**: `http://ia.renopartes.com`  ← **HTTP, no HTTPS** (Cloudflare termina el TLS; poner `https://` aquí causa `TOO_MANY_REDIRECTS`).
7. **Deploy**. Coolify clona, construye la imagen (descarga el Instant Client) y levanta el contenedor.

## 3. Verificar la conexión a Oracle (desde dentro del contenedor)

En la consola del contenedor (Coolify → la app → *Terminal/Execute Command*):

```bash
# ¿hay ruta de red al Oracle?
node -e "require('net').createConnection(1521,'10.30.1.201').on('connect',()=>{console.log('TCP OK');process.exit(0)}).on('error',e=>{console.log('TCP FAIL',e.message);process.exit(1)})"
```

Si da `TCP FAIL`, es problema de red entre el contenedor y la LAN (ver §6). Si da `TCP OK`,
abrir la app y hacer una consulta real; si aparece `ORA-28040`, el `sqlnet.ora` embebido ya
lo cubre (rebuild si se editó).

## 4. Exponer por Cloudflare Tunnel

> Ya usas Cloudflare Tunnel en tu infra. Reutiliza tu túnel o crea uno nuevo en
> **Cloudflare → Zero Trust → Networks → Tunnels**.

1. Asegúrate de que `cloudflared` corre **en el host de Coolify** (lo más simple: añadirlo como
   servicio en Coolify con el token del túnel). Así `localhost:80` = proxy de Coolify.
2. En el túnel → **Public Hostnames → Add a public hostname**:
   - **Subdomain**: `ia`  · **Domain**: `renopartes.com`
   - **Type**: `HTTP`
   - **URL**: `localhost:80`  *(si `cloudflared` NO corre en el host de Coolify, usa `<IP-LAN-del-host-Coolify>:80`)*
3. Guardar. Cloudflare **crea solo el registro DNS** (CNAME) — no hay que añadirlo a mano.
4. **Cloudflare → SSL/TLS → Overview**: modo **Full**.

## 5. Validar end-to-end

- `https://ia.renopartes.com` carga la pantalla de chat con candado válido.
- Una pregunta real devuelve respuesta en streaming con el SQL y la tabla.
- Un intento de escritura es rechazado (guard de solo lectura intacto).
- Reiniciar el host: el contenedor vuelve solo (restart policy `unless-stopped` en Coolify).

## 6. Si el contenedor no alcanza el Oracle (10.30.1.201)

El contenedor usa la red bridge de Docker; normalmente rutea a la LAN vía el host. Si no:
- Confirmar que el **host de Coolify** sí alcanza `10.30.1.201:1521` (`nc -vz 10.30.1.201 1521`).
- Si el host la alcanza pero el contenedor no, revisar reglas de red/firewall de Docker en Coolify
  (o, como último recurso, correr la app con `network_mode: host`).

## Releases futuras

Cada `git push` a la rama conectada dispara un redeploy en Coolify (si el auto-deploy está activo).
La imagen se reconstruye con el Instant Client; las envs persisten.
