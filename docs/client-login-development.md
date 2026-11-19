# Login de desarrollo — 19/11/2026

Continuación de `940191a`, `e584f11` y `704102c`, rama `codex/client-login-dev-contracts`.
La copia aislada está en `.supabase-local/workspaces/client-login-dev-20261119`.
El checkout original queda intacto: su `.git` está en solo lectura para el agente.
Sin despliegues, push, merge, cambios de migraciones ni tickets reales.

Actualización QA autorizada: la asociación RUC → estudio ya está resuelta y se
crearon exactamente dos tickets ficticios mediante el formulario real. Esta es
la evidencia vigente: [prueba E2E](client-login-e2e.md). Las comprobaciones de
asociación pendiente descritas más abajo corresponden al cierre anterior.

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

En la entrega `ae26716`, los tests de sesión/portal usaron RPC simuladas y todavía
no se verificó el navegador con la función real. La integración siguiente completa
esa comprobación sin cambiar las reglas de productos ni la separación de identidades.

## Integración localhost completada

Se recuperó `main` directamente del repositorio local, todavía `940191a`, y se
creó `integration/client-login-local` desde esa referencia. La integración hasta
`ae26716` fue un avance directo: conserva los commits y el historial de ambos agentes.
No se modificó `main` ni el checkout original.

El arranque ahora usa `scripts/run_client_login_local.py`, reutilizando la misma
función Deno, el mismo Vite y los mismos contratos. Fija el proyecto
`xsxdpaiivklqeudgqoqf`, exige entrada oculta para la clave y la pasa únicamente al
entorno del proceso Deno. No guarda archivos con ella ni la pasa en argumentos.
Vite recibe solo la configuración publicable seleccionada y los flags de desarrollo;
el modo ficticio está desactivado. Rechaza claves de servidor anon o de otro proyecto
cuando su JWT permite comprobarlo. No modifica variables privadas existentes.

Vite quedó iniciado en `http://localhost:5173/cliente`. Chromium local verificó
la selección, ambos formularios, contraseñas ocultas, vista móvil sin desbordamiento
y redirección de Nuevo ticket/Mis tickets al ingreso sin sesión. El navegador de
Orca no estaba disponible; se usó Chromium local como alternativa. No se hicieron
POST de autenticación ni escrituras de tickets en esas comprobaciones.

La clave no estaba en la configuración disponible. El usuario arrancó el servidor
mediante entrada oculta; OPTIONS local confirmó HTTP 204 y CORS para localhost:5173.
No fue necesario pegarla en el chat ni guardarla. La función queda en el puerto 8000
y Vite en 5173, ambos corriendo al finalizar.

Chromium verificó una autenticación real por proveedor desde localhost:

| Comprobación | Quipu | QuipuFac |
|---|---|---|
| `client-login` local | HTTP 200, sesión opaca válida | HTTP 200, sesión opaca válida |
| Identidad/contexto | Usuario individual, directa | Cuenta empresarial, directa |
| Selector del servidor | Los siete productos activos | Los seis activos excepto Quipu |
| Mis tickets | Carga correcta; cero tickets | Carga correcta; cero tickets |
| Nuevo ticket | Aviso de asociación pendiente | Aviso de asociación pendiente |
| Cierre de sesión | Regreso al ingreso tras logout del servidor | Logout del servidor y token local eliminado |

En ambos casos M13 devolvió `studio_mapping:'required'`: el RUC de prueba no tiene
estudio asociado. Se observó el aviso existente y se bloqueó la creación sin inventar
asociaciones. No se envió ningún ticket, no se modificaron solicitudes ni REQ26-001.
La autenticación y consulta funcionan; solo queda la asociación administrativa si se
quiere habilitar la creación en otro momento.

Esta continuación añadió solo cuatro pruebas de arranque/aislamiento, todas correctas,
y ejecutó el build. No repitió las pruebas de contratos ni las auditorías anteriores.
Evidencia actual: [client-login-local-integration.json](validation/client-login-local-integration.json).

No hace falta ejecutar más comandos ahora: abrir `http://localhost:5173/cliente`.
Para otra sesión, cuando ambos servicios estén detenidos, un único comando arranca
los mismos procesos y solicita la clave oculta:

```bash
python3 -B /home/procont/projects/ticketera-procont/.supabase-local/workspaces/client-login-dev-20261119/scripts/run_client_login_local.py
```

Si solo se detuvo la función, el mismo comando con `--server-only` conserva Vite.
El arranque comprueba puertos sin detener procesos ajenos. Ctrl+C termina los procesos
iniciados por ese comando y descarta la clave al terminar Deno.
