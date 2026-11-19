# Login de desarrollo — 19/11/2026

Base `940191a`. Adaptador de autenticación, conexión local de esa función,
pruebas y documentación asociada.
Sin despliegue, push, merge, cambios de migraciones ni tickets reales.

## Nueva dirección QuipuFac — comprobación 11:39 Perú

`https://dev.quipufac.com/` resuelve desde un terminal normal de Ubuntu WSL y
responde GET HTTP 200 con TLS verificado y `Content-Type: text/html`. La página
se presenta como «API QUIPUFAC (Modo Pruebas)»; es una bienvenida HTML sin enlaces,
scripts, formularios ni rutas documentadas. HEAD a la misma raíz devuelve 405 y
`Allow: GET`; ese resultado solo describe la raíz, no una ruta de autenticación.

No se confirmó ningún endpoint de login. No se trasladó `/auth/login` al nuevo
dominio ni se probaron rutas alternativas. Cero autenticaciones y cero entradas
de contraseña en esta comprobación. El contrato y la URL de Quipu permanecen intactos;
el adaptador de QuipuFac sigue cerrado hasta confirmar su endpoint y respuesta.

**Único bloqueo de esta comprobación:** solicitar al responsable la **URL HTTPS
completa del endpoint POST de autenticación de QuipuFac en desarrollo**, con ruta
y prefijo exactos, respaldada por documentación o un ejemplo confirmado para
`{username: RUC, password}`. El DNS de la nueva dirección ya funciona.

Evidencia: [quipufac-dev-discovery.json](validation/quipufac-dev-discovery.json).

## Respuestas reales observadas

| Proveedor | Resultado | Campos observados y utilizados |
|---|---|---|
| Quipu | Un POST, HTTP 200 | `username`: string no vacío, igual al usuario enviado. `token`: string no vacío; valor descartado. |
| QuipuFac | Un intento; falla DNS antes de enviar HTTP | Sin código HTTP, cuerpo ni contrato confirmado. |

Quipu: raíz JSON objeto, campos `username` y `token`. La salida omitió otros
cuatro campos por su filtro de privacidad: no constituye un esquema exhaustivo.
No se confirmó ID estable, RUC devuelto ni nombre verificado. No se afirma que
esos campos no existan. Se conserva el fallback explícito existente
**RUC + username exacto**; no se fusionan identidades. El RUC proviene del cuerpo
autenticado por el proveedor. No se copia `username` a nombre verificado.

No se probaron credenciales inválidas para respetar un máximo de una autenticación
por proveedor. Campos y cuerpos reales de error siguen sin confirmar. Los códigos
401/403 y los errores locales se cubren con simulaciones, sin documentarlos como
respuestas reales de las API.

QuipuFac: `socket.gaierror`, código -2, en el entorno del agente. Se comprobó
también desde un terminal normal de Ubuntu WSL mediante la habilidad
[`orca-cli`](/home/procont/.agents/skills/orca-cli/SKILL.md):

```bash
getent ahosts api-dev.quipufac.com
```

Sin direcciones; salida 2. No se solicitaron contraseñas ni se enviaron POST en
esa comprobación externa. Pendiente que el responsable de QuipuFac confirme el
DNS de **https://api-dev.quipufac.com/auth/login**. No se probaron otras URLs.

## Cambio aplicado

`client-provider-contracts.mjs` contiene el contrato mínimo de Quipu. El adaptador
exige HTTP satisfactorio, JSON, `username` exactamente igual a la entrada y token
no vacío antes de llamar `client_open_session`. Descarta el token del proveedor;
la sesión de Ticketera sigue siendo independiente, con SHA-256 en la base.

`equalsInput:'username'` es exclusivo de Quipu; no acepta otras propiedades ni
combinaciones ambiguas con `equals`. No se codifica un usuario de prueba fijo.
El contrato predeterminado solo se aplica a la URL de desarrollo comprobada;
otro endpoint requiere un contrato explícito. Un override JSON malformado sigue
bloqueando el ingreso. QuipuFac conserva su método RUC + contraseña y el bloqueo
por contrato pendiente. Los cuatro filtros de productos permanecen intactos.

`VITE_CLIENT_LOGIN_DEV_ORIGIN` permite usar la misma función en localhost durante
`vite`, manteniendo las RPC contra el proyecto M13 configurado. Solo admite un
origen loopback sin credenciales, rutas ni query. Usa el SDK Supabase existente,
una clave publicable y persistencia de Auth desactivada. Se elimina del build y
no cambia los formularios ni crea un sistema de autenticación.

El script único, sin dependencias adicionales, permite una comprobación posterior
desde Ubuntu cuando cambie el bloqueo o se autorice otra prueba:

```bash
python3 -B scripts/probe_client_login.py --provider quipufac
# Sin --provider prueba ambos, una vez cada uno.
```

Solicita una contraseña oculta por proveedor seleccionado, sin reintentos ni
redirecciones. Requiere terminal para evitar entrada visible. Imprime únicamente
tipos, rutas permitidas, presencia de token y coincidencias de identidad; omite
valores privados, claves desconocidas y cuerpos completos. No guarda archivos.
Un HTTP 200 en esa salida requiere revisar los campos antes de definir un contrato.

## Validación y límites

- 42 pruebas Node de login/portal: incluyen el contrato observado, rechazo sin token
  o usuario coincidente y conexión del handler al portal con RPC simuladas.
- Esa conexión abre una sesión individual Quipu directa, consulta los productos
  de Nuevo ticket y lee Mis tickets vacío; no invoca creación de tickets.
- Los cuatro contextos de productos se verifican con las pruebas existentes del portal.
- Cinco pruebas Python del script: sin red; depuración, cuerpos, DNS, rechazo HTTP
  y bloqueo de redirecciones.
- Contrato TypeScript, comprobación Deno de la Edge Function y `npm run build`: correctos.
- El build se ejecutó con un origen local de prueba; dicho origen no queda incluido.
- M13 y migraciones anteriores sin modificaciones. No se repitieron auditorías SQL.

La llamada real de Quipu confirma su respuesta de autenticación; **no se creó una
sesión remota de Ticketera ni se verificó el navegador contra una función real**.
Las comprobaciones de sesión y acceso al portal de esta entrega son simuladas.

## Qué falta para entrar desde la interfaz local

1. Ejecutar el checkout que contiene M13 y estos cambios. El checkout inicial está
   en `integration/board-operations`; su `.git` está en solo lectura para el agente.
   La entrega y el commit se conservan en la copia aislada indicada en el informe.
2. Ejecutar `client-login` localmente con las variables privadas de servidor
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y
   `PROCONT_ALLOWED_ORIGINS=http://localhost:5173` (o el origen local usado).
   La clave privilegiada solo pertenece al servidor; no estaba disponible en
   la configuración privada revisada. Por ejemplo, con Deno instalado y ese archivo
   privado fuera del control de versiones:

   ```bash
   deno run --allow-env --allow-net --env-file=/ruta/privada/client-login.env supabase/functions/client-login/index.ts
   ```

   Ese mismo handler escucha en el puerto 8000. Las RPC M13 permanecen en el proyecto
   indicado por las variables Supabase del servidor y del navegador; deben coincidir.
3. En configuración local, `VITE_CLIENT_LOGIN_ENABLED=1` y
   `VITE_CLIENT_PORTAL_MOCK=0`, más `VITE_CLIENT_LOGIN_DEV_ORIGIN=http://localhost:8000`;
   reiniciar Vite y abrir `/cliente`. Quipu puede habilitarse independientemente
   de QuipuFac una vez disponible la función. No se cambió la configuración actual.
4. Comprobar la asociación RUC → estudio. Si la sesión indica `studio_mapping:'required'`,
   Mis tickets sigue disponible pero Nuevo ticket no permite crear hasta que un
   administrador complete la asociación existente.

La URL anterior de QuipuFac no resolvía por DNS. La nueva dirección ya responde;
falta confirmar la ruta POST de autenticación para poder verificar su respuesta real.
No hace falta desplegar para probar en local. El arranque/conexión del servidor
local y la verificación completa de navegador siguen pendientes; no se agregaron
sistemas de autenticación. El transporte solo selecciona el origen de la función existente.
