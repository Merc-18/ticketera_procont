# Despliegue web de Ticketera Procont — procedimiento preparado

19/11/2026 · Proyecto Supabase exclusivo `ticketera-procont` (`xsxdpaiivklqeudgqoqf`) ·
GitHub `Merc-18/ticketera_procont`. **Nada de este documento se ha ejecutado en servicios
remotos.** Los pasos marcados **[REMOTO]** cambian servicios externos y requieren autorización
expresa antes de ejecutarse. Nunca escribir valores reales en este repositorio.

## 1. Hosting recomendado

**Vercel**, porque el repositorio ya trae `vercel.json` (Vite estático + redirección SPA).

| Ajuste | Valor |
|---|---|
| Framework | Vite (detección automática) |
| Comando de build | `npm run build` (`tsc && vite build`) |
| Directorio de salida | `dist` |
| Redirección SPA | `vercel.json`: toda ruta sin archivo → `/index.html` (Vercel sirve primero los archivos reales) |
| Cabeceras | `vercel.json`: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; `no-referrer` y `no-store` en `/cliente/acceso/*` |
| Dominio propio | Sí: Project → Settings → Domains; registro DNS que indique Vercel (CNAME en subdominio, p. ej. `tickets.procontbusiness.com`) |

Variables **públicas** del frontend (Project → Settings → Environment Variables, entorno Production):

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://xsxdpaiivklqeudgqoqf.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clave **publicable** (`sb_publishable_…`) del proyecto |
| `VITE_CLIENT_LOGIN_ENABLED` | `0` hasta desplegar `client-login`; `1` para habilitar el ingreso de clientes |

Prohibido en el frontend: `SUPABASE_SERVICE_ROLE_KEY`, claves `sb_secret_…`, secretos de plataforma,
`VITE_CLIENT_LOGIN_DEV_ORIGIN` (solo desarrollo local). La app rechaza claves secretas en `VITE_*`.

**Costo (verificado 19/11/2026 en las páginas oficiales):**
- Vercel Hobby: $0, pero sus términos (sección 4) lo limitan a uso «personal o no comercial».
  Para atender clientes de Procont corresponde **Vercel Pro: $20 por usuario desarrollador/mes**.
- Alternativa sin costo: Cloudflare Pages (plan Free: 500 builds/mes, 100 dominios por proyecto,
  SPA por defecto). No se pudo confirmar en sus términos el uso comercial del plan Free; requeriría
  `public/_headers` equivalente a las cabeceras de `vercel.json`.
- Supabase: el plan Free pausa proyectos tras 7 días sin actividad (incluye 500 000 invocaciones de
  Edge Functions); Pro desde $25/mes. **Confirmar el plan actual del proyecto antes de abrir a clientes.**

## 2. Estado de los componentes

| Componente | Estado |
|---|---|
| Base de datos M1–M13 | Aplicadas 13/13 (verificado en solo lectura) |
| RPC de clientes, sesiones (hash SHA-256, 8 h, revocación), aislamiento por identidad | Listo (M13) |
| Adjuntos: bucket privado, reserva por sesión, 4 archivos / 2 500 000 bytes, ventana de 30 min | Listo |
| Frontend: build de producción, rutas SPA, `/cliente`, Nuevo ticket, Mis tickets, seguimiento REQ, login interno y tablero | Listo (build y rutas verificados con `vite preview`) |
| Edge Function `admin-users` | Desplegada (v2); falta `PROCONT_INVITE_REDIRECT_URL` para invitar por correo |
| Edge Function `client-login` | **No desplegada** |
| Límite de intentos de login | **Código en main (rama `claude/client-login-throttle`); M14 sin aplicar** |
| CORS | Lista blanca `PROCONT_ALLOWED_ORIGINS` (compartida por `client-login` y `admin-users`); falta el dominio público |
| Acceso desde plataformas Quipu/QuipuFac | Implementado; requiere secretos y al integrador externo |
| Asociación RUC → estudio | `set_client_company_studio` (admin/superadmin, sesión interna); sin pantalla |

## 3. Entorno de pruebas frente a clientes reales

**Desplegable como entorno de pruebas** (tras M14 y `client-login`): APIs de desarrollo
`api-gestion-test.quipufac.com` y `dev.quipufac.com`, con los contratos de respuesta verificados
19/11/2026 (`supabase/functions/_shared/client-provider-contracts.mjs`). Esos contratos por defecto
solo se aplican a esas dos URL exactas.

**Impide recibir clientes reales:**
1. **APIs de producción de Quipu y QuipuFac.** Las de pruebas no son aptas para producción. Al
   cambiar `QUIPU_AUTH_URL`/`QUIPUFAC_AUTH_URL` el ingreso queda cerrado (`provider_contract_pending`)
   hasta configurar `QUIPU_AUTH_RESPONSE_CONTRACT`/`QUIPUFAC_AUTH_RESPONSE_CONTRACT` con respuestas
   reales revisadas (válida y fallida).
2. **Límite de intentos** (M14 `20261119000200_client_login_throttle.sql`, ya en main): sin él, el
   ingreso permitiría probar contraseñas de Quipu/QuipuFac sin freno a través de Ticketera (CORS no
   protege frente a scripts). M14 debe **aplicarse antes** de desplegar `client-login`; si se
   desplegara antes, el ingreso falla cerrado (503) sin contactar a los proveedores.
3. **Planes de servicio**: Vercel con uso comercial y Supabase sin pausas por inactividad.
4. Quipu no expone identificador estable: la identidad es RUC + usuario exacto (aceptado en desarrollo;
   confirmar con el dueño de la API para producción).

**No bloquea el acceso directo, pero queda pendiente:**
- Acceso desde plataformas: secretos `QUIPU_PLATFORM_ENTRY_SECRET`/`QUIPUFAC_PLATFORM_ENTRY_SECRET`
  y que el integrador abra `https://<dominio>/cliente/acceso/{quipu|quipufac}#code=<código>`.
- RUC ambiguos: sin asociación, el cliente ve «Tu empresa aún no está habilitada». Resolver con
  `set_client_company_studio(p_ruc, p_studio_id)` desde una sesión interna admin/superadmin.
- Formulario anónimo `/request`: sigue activo (decisión de negocio pendiente).

## 4. Procedimiento

### Paso 1 — Supabase

```bash
SB=/home/procont/.local/lib/supabase-cli/3.2.0/supabase   # CLI autenticada; destino único xsxdpaiivklqeudgqoqf
cd /home/procont/projects/ticketera-procont                 # checkout de main actualizado

# Verificación (solo lectura)
$SB migration list --remote          # esperado: 13 aplicadas y solo M14 pendiente

# [REMOTO] Aplicar M14 (límite de intentos)
$SB db push --remote --dry-run       # debe mostrar solo 20261119000200_client_login_throttle.sql
$SB db push --remote --yes
$SB db query --remote --read-only "select count(*) from pg_proc where proname='client_login_throttle'"
```

[REMOTO] Dashboard → Authentication → URL Configuration: **Site URL** `https://<dominio>` y
**Redirect URLs** `https://<dominio>/**` (invitaciones del personal interno).

### Paso 2 — Configuración segura de las funciones

Crear el archivo de secretos **fuera del repositorio**, con permisos 600, y borrarlo después:

```bash
umask 077; cat > ~/ticketera-edge.env <<'EOF'
PROCONT_ALLOWED_ORIGINS=https://<dominio>
PROCONT_INVITE_REDIRECT_URL=https://<dominio>/login
QUIPU_AUTH_URL=https://api-gestion-test.quipufac.com/api/users/auth
QUIPUFAC_AUTH_URL=https://dev.quipufac.com/auth/login
EOF
# Solo cuando el integrador esté listo (entregar por canal seguro, nunca por chat/correo en claro):
#   QUIPU_PLATFORM_ENTRY_SECRET=$(openssl rand -hex 32)
#   QUIPUFAC_PLATFORM_ENTRY_SECRET=$(openssl rand -hex 32)

# [REMOTO]
$SB secrets set --remote=xsxdpaiivklqeudgqoqf --env-file ~/ticketera-edge.env
$SB functions deploy client-login --remote=xsxdpaiivklqeudgqoqf --use-api --no-verify-jwt   # el handler valida origen, sesión y secretos; sin Docker
shred -u ~/ticketera-edge.env
$SB secrets list --remote=xsxdpaiivklqeudgqoqf                       # solo nombres; sin valores
```

- `PROCONT_ALLOWED_ORIGINS` es una lista separada por comas y la usa también `admin-users`: incluir
  todos los orígenes reales (dominio propio y, si se usa, `https://<proyecto>.vercel.app`). Para
  pruebas locales se puede añadir `http://localhost:5173`; quitarlo en producción.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase en la función; no configurarlos
  manualmente ni copiarlos a ningún otro lugar.
- Para producción, además: `QUIPU_AUTH_URL`, `QUIPUFAC_AUTH_URL` de producción y sus
  `*_AUTH_RESPONSE_CONTRACT` verificados (ver §3).

### Paso 3 — Frontend

[REMOTO] Vercel → Add New Project → importar `Merc-18/ticketera_procont` (rama `main`) → variables
de §1 con `VITE_CLIENT_LOGIN_ENABLED=0` → Deploy. Alternativa CLI (requiere `vercel login`):

```bash
npx vercel@latest link
npx vercel@latest env add VITE_SUPABASE_URL production
npx vercel@latest env add VITE_SUPABASE_PUBLISHABLE_KEY production
npx vercel@latest env add VITE_CLIENT_LOGIN_ENABLED production   # 0 al inicio
npx vercel@latest --prod
```

### Paso 4 — URL pública

[REMOTO] Asociar el dominio en Vercel y crear el registro DNS indicado. Confirmar que el origen
exacto (`https://<dominio>`, sin barra final) está en `PROCONT_ALLOWED_ORIGINS` y en la Site URL.
Después cambiar `VITE_CLIENT_LOGIN_ENABLED=1` y volver a desplegar el frontend.

### Paso 5 — Pruebas por Internet

```bash
D=https://<dominio>; F=https://xsxdpaiivklqeudgqoqf.supabase.co/functions/v1/client-login
curl -sI $D/cliente | grep -iE '^HTTP|x-frame-options|x-content-type|referrer-policy'   # 200 + cabeceras
curl -sI $D/cliente/tickets/cualquier-ruta | head -1                                     # 200 (SPA)
curl -si -X OPTIONS $F -H "Origin: $D" -H 'Access-Control-Request-Method: POST' | grep -iE '^HTTP|access-control-allow-origin'   # 204 + origen
curl -si -X OPTIONS $F -H 'Origin: https://no-autorizado.example' | head -1             # 403 origin_denied
```

En el navegador, con las cuentas de prueba ya usadas (un intento por proveedor): ingreso Quipu
(7 productos) e ingreso QuipuFac (6 productos, sin Quipu); Salir.

### Paso 6 — Tickets y permisos

Sin crear tickets nuevos: con REQ26-002 (Quipu) y REQ26-003 (QuipuFac) comprobar Mis tickets por
identidad, detalle ajeno → «no encontrado», búsqueda pública solo número y estado, y Requests →
Pendientes en el tablero interno (sesión superadmin). No modificar REQ26-001.

### Paso 7 — Habilitación gradual

1. Entorno de pruebas: personal de Procont con las APIs de desarrollo.
2. Piloto: pocas empresas; antes, resolver su RUC → estudio (`set_client_company_studio`).
3. Seguimiento: registros de la función (`Dashboard → Edge Functions → client-login → Logs`) y
   respuestas 429; contadores en `app_private.client_login_attempts` (solo hashes).
4. Clientes reales: APIs y contratos de producción (§3), planes de servicio y comunicación del enlace.
5. Retroceso inmediato: `VITE_CLIENT_LOGIN_ENABLED=0` + redeploy del frontend, o retirar el dominio
   de `PROCONT_ALLOWED_ORIGINS`.

## 5. Verificaciones realizadas para esta preparación (sin despliegue)

- `npm run build` con las variables públicas reales y `VITE_CLIENT_LOGIN_ENABLED=1`: correcto; el
  bundle no contiene claves secretas ni el simulador de desarrollo.
- `vite preview` + Chromium: `/cliente`, formulario QuipuFac (solo RUC y contraseña), `/tracking`,
  `/login`, `/portal`, `/request`, `/cliente/acceso/quipu` sin código → «enlace no válido», detalle sin
  sesión → `/cliente`; sin errores de consola ni escrituras.
- Supabase (solo lectura): 13/13 migraciones; funciones desplegadas: `admin-users`; secretos
  existentes (solo nombres): `PROCONT_ALLOWED_ORIGINS` y los inyectados por Supabase.
- Límite de intentos (`claude/client-login-throttle`, integrado en main): 13 pruebas Node nuevas más
  las suites de login y portal, 7 comprobaciones de M14 en PostgreSQL 17 aislado, `tsc`, build y
  dry-run remoto (M14 única pendiente; no aplicada).
