# Login de desarrollo — 19/11/2026

Continuación de `940191a`, `e584f11` y `704102c`, rama `codex/client-login-dev-contracts`.
La copia aislada está en `.supabase-local/workspaces/client-login-dev-20261119`.
El checkout original queda intacto: su `.git` está en solo lectura para el agente.
Sin despliegues, push, merge, cambios de migraciones ni tickets reales.

## Contratos confirmados

| Proveedor | POST de desarrollo | Validación | Identidad |
|---|---|---|---|
| Quipu, sin cambios | `https://api-gestion-test.quipufac.com/api/users/auth` | HTTP satisfactorio, JSON, `username` igual al usuario enviado, `token` no vacío | RUC + username exacto; fallback existente |
| QuipuFac | `https://dev.quipufac.com/auth/login` | HTTP satisfactorio, JSON, `username` y `businessRuc` iguales al RUC enviado, `token` no vacío | Cuenta empresarial por RUC; subject/source `company`, username interno nulo |

QuipuFac se probó una sola vez tras confirmar la ruta con el responsable. Recibió
solo `{username: RUC, password}`, con contraseña introducida sin eco en Ubuntu WSL.
Respondió HTTP 200. Contrato mínimo depurado:

```text
{
  username: string,     // Igual al RUC autenticado.
  businessRuc: string,  // Igual a ese mismo RUC.
  businessName: string, // Nombre empresarial verificado, no vacío.
  token: string        // No vacío; su valor se descarta.
}
```

Se descartan los demás campos. No aparecen marcadores `success` o `error` en la
raíz observada. No se probaron credenciales incorrectas: los cuerpos reales de
error siguen sin confirmar; las pruebas de error son simulaciones. La misma respuesta
real fue aceptada por el adaptador actualizado en memoria, confirmando la coincidencia
exacta de `businessRuc`. Después se descartó, sin repetir la llamada al proveedor.
No se guardaron contraseñas, tokens ni cuerpos completos sensibles.

`businessName` se usa como nombre empresarial verificado. No se importan roles ni
identificadores individuales. La sesión de Ticketera sigue siendo independiente del
token externo; PostgreSQL guarda su SHA-256. Quipu conserva íntegro su contrato,
sin otra autenticación. Su esquema depurado anterior no fue exhaustivo ni confirmó
ID estable, RUC devuelto o nombre verificado.

Evidencias: [Quipu original](validation/client-login-dev-api.json),
[QuipuFac actual](validation/quipufac-login-dev-api.json). La comprobación anterior
de la raíz, sin ruta confirmada, queda como historial en
[quipufac-dev-discovery.json](validation/quipufac-dev-discovery.json).
El bloqueo de endpoint QuipuFac quedó resuelto.

## Cambio y validación de esta continuación

Se añadió el contrato QuipuFac y su URL confirmada. `equalsInput:'ruc'` solo se
admite para QuipuFac; Quipu conserva `equalsInput:'username'`. Los defaults están
limitados a las URLs comprobadas; un override malformado sigue bloqueando el ingreso.
Frontend, M13, productos y separación de identidades sin modificaciones.

- Siete pruebas nuevas de QuipuFac: cuerpo, identidad/nombre, hash de sesión,
  RUC discordante, token ausente, errores seguros y conexión al portal.
- Cuatro pruebas específicas existentes del adaptador y seis de productos/Mis tickets.
  Total Node de esta continuación: 17/17.
- Cinco pruebas Python del script depurado: correctas, sin red.
- Deno `check` y `npm run build` (incluye TypeScript): correctos.
- No se repitieron suites generales ni auditorías SQL.

Los tests de sesión/portal usan RPC simuladas. No se creó una sesión remota ni se
verificó el navegador con la función real. Las cuatro reglas de productos y la
separación de identidades permanecen intactas.

## Único procedimiento para probar ambos ingresos desde el navegador local

Falta configurar `SUPABASE_SERVICE_ROLE_KEY`, que no estaba disponible. La clave
de servidor corresponde al proyecto `ticketera-procont` y solo se usa en la función.
Las contraseñas de proveedores se introducen después en los formularios existentes.
La configuración pública de Supabase ya existe en `.env.local` del checkout original.

1. En un terminal normal de Ubuntu, preparar los archivos privados. La clave se
   introduce oculta; el historial no contiene su valor:

   ```bash
   cd /home/procont/projects/ticketera-procont/.supabase-local/workspaces/client-login-dev-20261119
   set +x
   umask 077
   mkdir -p .supabase-local
   read -rsp 'SUPABASE_SERVICE_ROLE_KEY de ticketera-procont (oculta): ' ticketera_dev_key
   printf '\n'
   printf '%s\n' 'SUPABASE_URL=https://xsxdpaiivklqeudgqoqf.supabase.co' "SUPABASE_SERVICE_ROLE_KEY=$ticketera_dev_key" 'PROCONT_ALLOWED_ORIGINS=http://localhost:5173' 'QUIPUFAC_AUTH_URL=https://dev.quipufac.com/auth/login' > .supabase-local/client-login.env
   unset ticketera_dev_key
   cp /home/procont/projects/ticketera-procont/.env.local .env.local
   printf '\nVITE_CLIENT_LOGIN_ENABLED=1\nVITE_CLIENT_PORTAL_MOCK=0\nVITE_CLIENT_LOGIN_DEV_ORIGIN=http://localhost:8000\n' >> .env.local
   chmod 600 .env.local .supabase-local/client-login.env
   ```

2. Arrancar la misma función con el Deno ya disponible en esta máquina:

   ```bash
   DENO_DIR=/tmp/procont-m13-deno /tmp/procont-m13-npm-cache/_npx/05b6ef7b13673c57/node_modules/deno/deno run --cached-only --allow-env --allow-net --env-file=.supabase-local/client-login.env supabase/functions/client-login/index.ts
   ```

3. En otro terminal, desde esa misma copia, ejecutar
   `npm run dev -- --host localhost --port 5173 --strictPort` y abrir
   `http://localhost:5173/cliente`. Ambos formularios usan la función local y las RPC
   siguen contra M13 del proyecto configurado. No hace falta desplegar.
   Si aparece `studio_mapping:'required'`, Mis tickets está disponible; un administrador
   debe completar la asociación existente RUC → estudio para permitir crear en Nuevo ticket.
   No se comprobó ni modificó esa asociación durante esta entrega.

No ejecutar otra vez el diagnóstico en este cierre: ambas respuestas ya están
verificadas. `scripts/probe_client_login.py` queda para otra prueba autorizada.
