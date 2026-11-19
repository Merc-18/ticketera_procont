# Acceso de clientes: M13 activa, historial 13/13

Base `main@35b9726`; rama aislada `codex/client-access-m13`. Migración nueva
`20261119000100_client_access.sql`. Las doce migraciones anteriores permanecen
intactas. M13 se aplicó una sola vez bajo autorización de activación. Historial, RPC
y permisos verificados: [evidencia vigente](validation/client-m13-activation.json).
`client-login` y el frontend no se desplegaron; el ingreso real sigue deshabilitado.

## Distinción de errores antes de activar

M13 usa `PT401` para sesión inválida/vencida, `PT403` para producto no permitido
y `PT404` para ticket ajeno/inexistente. El contrato traduce respectivamente a
`client_authentication_required`, `client_product_unavailable` y
`client_ticket_unavailable`. `42501` se conserva como `client_request_forbidden`
para otros permisos/ventana de adjuntos; no indica expiración de sesión.
Los códigos HTTP personalizados siguen el [contrato oficial de PostgREST](https://docs.postgrest.org/en/stable/references/errors.html).

El ingreso está deshabilitado por defecto también en frontend
(`VITE_CLIENT_LOGIN_ENABLED=0`). El build conserva el seguimiento público por REQ;
la función `client-login` no se despliega en esta activación.

## Entrega para Claude

Contrato TypeScript: [`client-access-client.d.mts`](../contracts/client-access-client.d.mts).
Adaptador ejecutable: [`client-access-client.mjs`](../contracts/client-access-client.mjs).
Usar `createClientAccess(client)` con un cliente Supabase anónimo independiente del
cliente de las cuentas internas. No usar `auth.signIn`, roles internos, metadatos de
Auth ni `setSession` de Supabase para la sesión del cliente.

La sesión es una capacidad aleatoria de 256 bits (`session_token`), independiente
de un JWT de Supabase. Conservarla en memoria durante la sesión de la interfaz,
enviarla solamente por HTTPS en el cuerpo RPC y descartarla al cerrar/expirar.
No colocar sesiones, contraseñas ni tokens de seguimiento en URL, logs o analítica.
La base guarda únicamente SHA-256 de la capacidad; el token del proveedor se descarta.
Duración: ocho horas, sin renovación automática; `client_logout` revoca de forma idempotente.

| Método del adaptador | Transporte | Resultado |
|---|---|---|
| `login(input)` | Edge `client-login`, `action: login` | `ClientSessionReceipt` |
| `exchange(provider, code)` | Edge `client-login`, `action: exchange` | `ClientSessionReceipt` |
| `session(token)` | `client_session_info` | Identidad, empresa, expiración y asociación de estudio |
| `products(token)` | `client_products` | Productos activos permitidos por el servidor |
| `submit(token, payload, key)` | `client_submit_request` | `{id, request_number, tracking_token}` |
| `tickets(token, {limit, offset})` | `client_list_tickets` | Lista filtrada por identidad en PostgreSQL |
| `detail(token, requestId)` | `client_ticket_detail` | Detalle y cronología pública autorizada |
| `reserveAttachments(token, requestId, files)` | `client_reserve_attachments` | Reservas privadas existentes |
| `logout(token)` | `client_logout` | Revocación; luego descartar token local |

Los nombres de parámetros RPC y tipos exactos están en el adaptador y `.d.mts`.
El error `studio_mapping_required` exige asociación administrativa; la interfaz no
debe elegir un estudio arbitrario ni mandar `studio_id`. `client_authentication_required`
exige descartar la sesión y volver al acceso. `provider_contract_pending` significa
que falta validar/configurar la respuesta real del proveedor, no credenciales inválidas.

## Login de servidor y contratos de desarrollo

`POST /functions/v1/client-login`, JSON:

- Quipu: `{action:'login', provider:'quipu', ruc:string, username:string, password:string}`.
- QuipuFac: `{action:'login', provider:'quipufac', ruc:string, password:string}`.

Quipu envía al proveedor `{ruc, username, password}` por POST a
`https://api-gestion-test.quipufac.com/api/users/auth`.
QuipuFac envía `{username:ruc, password}` por POST a
`https://dev.quipufac.com/auth/login`, ruta confirmada por el responsable de su API.
Se pueden cambiar mediante `QUIPU_AUTH_URL` y `QUIPUFAC_AUTH_URL`, solo en servidor.
HTTPS obligatorio, sin redirecciones, timeout de diez segundos, entrada de 16 KiB
y respuesta de 64 KiB. No se registran cuerpos, contraseñas, tokens o errores crudos.

El 19/11/2026 se hizo una sola autenticación real de Quipu: HTTP 200,
`username` coincidente y `token` no vacío. Ese contrato mínimo de desarrollo está
incluido solo para su URL confirmada. QuipuFac ya respondió HTTP 200 en la nueva
URL confirmada: `username` y `businessRuc` coinciden con el RUC enviado,
`businessName` es un nombre empresarial no vacío y `token` es no vacío. Su
contrato predeterminado queda limitado a esa URL. No se hicieron intentos con contraseñas incorrectas:
los cuerpos de error reales siguen sin confirmar. Véanse
[la entrega de desarrollo](client-login-development.md) y
[la evidencia depurada](validation/client-login-dev-api.json).
Los fixtures de las pruebas usan una estructura deliberadamente inventada para
simular al proveedor; no son valores predeterminados ni documentación de sus API.

El adaptador acepta un manifiesto privado por proveedor, en
`QUIPU_AUTH_RESPONSE_CONTRACT` o `QUIPUFAC_AUTH_RESPONSE_CONTRACT`, con este tipo:

```ts
interface ProviderResponseContract {
  version: 1
  provider: 'quipu' | 'quipufac'
  verifiedReference: string // Referencia a la evidencia revisada; sin secretos.
  success: { path: string[]; equals: boolean | string | number }
    | { path: string[]; equalsInput: 'username' | 'ruc' } // username: Quipu; ruc: QuipuFac.
  tokenPath: string[]
  rucPath?: string[]
  subjectPath?: string[]
  namePath?: string[]
  allowUsernameFallback?: boolean
}
```

Las rutas se deben obtener de las respuestas auténticas. El marcador de éxito
debe coincidir exactamente (Quipu compara `username` con el usuario enviado;
QuipuFac compara `username` con el RUC enviado), el token debe
ser una cadena no vacía y, si hay `rucPath`, debe coincidir con el RUC autenticado.
Si el proveedor no devuelve RUC, la revisión debe confirmar que la autenticación
vincula las credenciales al RUC enviado. Un HTTP 200 por sí solo nunca crea sesión.

Quipu usa `subjectPath` como identificador estable si el proveedor lo tiene. Si
no existe, se requiere `allowUsernameFallback:true` explícito; la identidad queda
separada por **RUC + username exacto**, sin minúsculas ni fusiones automáticas.
Si luego el usuario cambia de nombre o se habilita un identificador estable, no
se migra ni fusiona su historia automáticamente. QuipuFac usa una sola identidad
empresarial por RUC. Un nombre declarado al crear un ticket sigue siendo declarado
(`requester_name_verified:false`), separado de `identity.verified_name` procedente
del contrato del proveedor o del servidor de plataforma autorizado.

## Productos y estudios

| Entrada autenticada | Selector y creación permitidos |
|---|---|
| Directa Quipu | Todos los productos activos |
| Directa QuipuFac | Todos los activos excepto Quipu |
| Plataforma Quipu | Solo Quipu activo |
| Plataforma QuipuFac | Solo QuipuFac activo |

La sesión guarda el contexto; el navegador no puede escogerlo. PostgreSQL filtra
el selector y vuelve a validar `system_id` antes de crear. Se usan dos asociaciones
globales con UUID del catálogo existente (`Quipu`, `Quipu_Fac`), conservadas aunque
cambie el nombre. No existe una matriz producto/empresa. Negmin puede aparecer como
producto activo por la regla general, pero no tiene proveedor ni integración de entrada.

El RUC identifica empresa; se reutiliza `public.studios`. Si existe exactamente un
estudio activo con ese RUC, se usa su UUID. Cero o varios candidatos dejan
`company.studio_mapping:'required'` y bloquean la creación, sin elegir al azar.
Un superadmin/admin existente puede asociar explícitamente mediante
`set_client_company_studio(p_ruc text,p_studio_id uuid)`: el estudio debe estar activo
y tener el mismo RUC o no tenerlo registrado. No se cambia el catálogo ni se
reescriben estudios de tickets existentes.

## Solicitudes, aislamiento y adjuntos

`client_submit_request` recibe nombre declarado obligatorio, producto, tipo, título,
descripción y urgencia; el estudio, empresa, identidad y método se fijan en servidor.
Reutiliza `submit_client_request`: validación M11, número REQ, eventos y capacidad
de seguimiento. La asociación privada se inserta en la misma transacción. Reintentos
usan una UUID estable por identidad y payload; no comparten el caché anónimo de otras
identidades. Incluso al reintentar se comprueba que la sesión sigue vigente.

Quipu lista únicamente los tickets de ese usuario; otro usuario del mismo RUC no
los ve. Todas las sesiones QuipuFac del RUC comparten la identidad empresarial y
sus tickets QuipuFac, sin absorber solicitudes de usuarios individuales Quipu.
Detalle, lista y reserva de adjuntos comparan la identidad del token con la asociación
del ticket. Cambiar el UUID de la solicitud no concede acceso. Los tickets anteriores
sin asociación no se reasignan ni se incorporan al historial de un cliente.

El detalle muestra título, descripción, urgencia, estado general y cronología pública.
No devuelve comentarios internos, identidad de empleados, clasificación interna,
tokens ni motivos de rechazo administrativos; solo `public_rejection_reason`.
Se conserva el seguimiento público existente por REQ y el contrato anterior con token.

Para adjuntos, comprimir imágenes con la lógica actual; conservar documentos sin
alterar. Preparar metadatos con `attachmentMetadata` del adaptador existente,
llamar `reserveAttachments` y subir con `uploadReservedTicketAttachment` usando las
reservas devueltas. Se mantienen 4 archivos / 2.500.000 bytes combinados, bucket
privado, claves por archivo, verificación de bytes/MIME y ventana original de treinta
minutos para solicitudes pendientes. Las capacidades ya emitidas conservan su
caducidad original; la reserva nueva exige sesión vigente y titularidad del ticket.
El recibo de creación sigue siendo compatible con los adaptadores públicos anteriores.

## Entrada automática: contrato para el integrador de plataformas

Cada servidor de plataforma debe autenticar a su usuario antes de solicitar un
código. Se configura un secreto aleatorio independiente, de al menos 32 caracteres,
en `QUIPU_PLATFORM_ENTRY_SECRET` o `QUIPUFAC_PLATFORM_ENTRY_SECRET`. Es exclusivo
de los dos servidores; no se incorpora al frontend ni al enlace. Rotarlo invalida
futuras emisiones, sin modificar el producto externo desde esta tarea.

1. Servidor de plataforma → `POST client-login`, header `Authorization: Bearer` con
   su secreto y JSON `{action:'issue_code', provider, ruc, verified_name?}`.
   Quipu añade `subject`, `subject_source:'provider_id'|'username'` y `username`;
   usar la misma política de identidad validada que el acceso directo. Para fallback,
   `subject` debe ser exactamente `username`. QuipuFac no manda datos individuales.
2. Ticketera devuelve `{code, provider, expires_at}`. Código aleatorio de 256 bits,
   sesenta segundos, hash únicamente en base de datos, un solo canje atómico.
3. Abrir Ticketera por su ruta de cliente con el código en el **fragmento** del enlace
   (`#code=...`), nunca una contraseña, secreto de integración o token del proveedor.
   La ruta concreta la elige Claude; quitar inmediatamente el fragmento tras leerlo.
4. Interfaz → `exchange(provider,code)`. Solo después del canje se recibe sesión
   `entry_context:'platform'`; no se permite elevarla a directa ni cambiar de proveedor.

El productor rechaza peticiones con Origin de navegador y secretos de otra plataforma.
El canje comprueba proveedor, vencimiento y consumo; dos canjes concurrentes tienen
un único ganador. La integración del enlace en Quipu/QuipuFac queda a cargo de la
otra persona; aquí no se modificó ninguno de esos sistemas.

## Verificación local y límites de la entrega

- Node: pruebas nuevas de ambos adaptadores de login con respuestas simuladas,
  fallo cerrado, errores sin secretos, productores/canje y transporte del frontend.
- PostgreSQL 17.12 aislado: M1–M12 solo como preparación del fixture; pruebas nuevas
  de M13 con identidades, solicitudes y Storage ficticios. No se repitieron las suites anteriores.
- Contrato TypeScript compilado con un consumidor de prueba sin contraseñas literales.
- Evidencia: [client-access-local.json](validation/client-access-local.json).

Comandos de estas pruebas, sin acceso remoto:

```bash
node --test tests/client-login.test.mjs
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --lib ES2022,DOM tests/client-access-contract.types.mts
python3 -B supabase/tests/client_access_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib
```

Quipu y QuipuFac tienen contratos mínimos verificados en desarrollo. Sigue
pendiente ejecutar la función localmente o un
despliegue autorizado y comprobar una sesión real desde la interfaz. La asociación de RUC ambiguos se realiza
explícitamente cuando proceda. La aplicación de M13 ya está verificada. La integración frontend se conserva desde
`19a10a8`, con la corrección puntual de errores en `8fd637e`; el cierre de Git permite
fast-forward sin reescribir los commits de ambos agentes. No se realizó despliegue.

## M15 preparada: cierre de creación heredada — 19/11/2026

Base `main@44cebebca91c0424762c3dd640c0a1f8ae4deaff`; rama
`fix/ticketera-security-m15`, worktree independiente. El checkout compartido y
los worktrees anteriores no se modifican. M1–M14 conservan sus bytes e historial.
Migración nueva: `20261119000300_security_request_creation.sql`.
**Solo implementación y pruebas locales; M15 no está aplicada en Supabase.**

La auditoría de esa fecha confirmó en lectura que `submit_client_request(jsonb,uuid)`
seguía ejecutable por anon/authenticated sin sesión Quipu/QuipuFac. M15 retira
EXECUTE de PUBLIC, anon, authenticated y service_role. La función propietaria de
M13 `client_submit_request` conserva su llamada interna SECURITY DEFINER; las
firmas, propietarios y cuerpos M13 no cambian. No se añaden sesiones, roles ni
sistemas de autenticación alternativos.

Consumidores revisados antes de elegir los roles:

- `PlannerImportModal` → `useRequests.createRequest` → `operations.submitRequest`
  → `submit_request`. Planner conserva su interfaz admin/superadmin.
- `operations.submitRequest(..., classification)` selecciona
  `submit_classified_request`; se preserva ese contrato del adaptador aunque no
  se encontró una llamada activa de interfaz que proporcione la clasificación.
- Antes de integrar la rama frontend, `PublicRequestForm` sin adaptador utilizaba
  `submit_client_request`. En el árbol integrado ese modo y su adaptador están
  retirados; `/request` redirige a `/cliente`. El formulario de `/cliente/nuevo`
  conserva `client_submit_request`; M15 también impide el acceso directo a la RPC antigua.

Las dos RPC internas usan ahora `app_private.require_role` con los mismos
editores activos de `canEdit`: superadmin/admin/developer. La comprobación es
la primera instrucción, antes de validar payload o consultar idempotencia.
Viewer, perfil inactivo, perfil inexistente o UID ausente reciben 42501.
Las funciones mantienen EXECUTE solo para authenticated y su propietario;
authenticated por sí solo no autoriza. No se amplían permisos de Planner.

Precisión del diagnóstico reproducido en PostgreSQL: viewer e inactivo sí
podían crear y recuperar recibos con las RPC antiguas; un usuario Auth sin
perfil fallaba al insertar por la FK de actor de auditoría (23503), no por una
verificación explícita. M15 lo rechaza antes, con 42501. La desactivación o
degradación posterior también impide recuperar recibos antes autorizados.

Regresión ejecutable, sin red ni credenciales, con PostgreSQL 17:

```bash
python3 -B supabase/tests/security_request_creation_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib --baseline-migrations 13
python3 -B supabase/tests/security_request_creation_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib --baseline-migrations 14
node --experimental-strip-types --test tests/consumers.test.mjs tests/client-portal.test.mjs tests/client-login.test.mjs tests/quipufac-login.test.mjs
npm run build
```

Resultados: 18/18 grupos SQL por cada base, 69/69 pruebas Node y build correcto.
Las pruebas SQL ejecutan los cuerpos reales y permisos efectivos de PostgreSQL,
incluido un grant previo a PUBLIC para detectar permisos heredados. Auth y Storage
son stubs locales; los proveedores Node son simulados. No son un E2E remoto.
Las bases son desechables bajo `/tmp`, con socket Unix y TCP deshabilitado, y se
detienen y eliminan al finalizar. Las suites históricas no se vuelven a ejecutar.

Se comparan todas las filas antes/después de M15: 34 tablas con base M1–M13 y
35 con M1–M14, incluyendo Auth y Storage ficticios. Solo cambian los ACL de las
tres RPC y las dos comprobaciones de autorización. También se verifican creación
M13 de ambos proveedores y contextos, productos, sesiones inválidas/vencidas/revocadas,
reintentos concurrentes con una única fila, aislamiento y seguimiento público mínimo.
Evidencias: [base M13](validation/security-request-creation-m13-baseline-local.json)
y [base M14](validation/security-request-creation-local.json), con hashes M1–M15,
permisos efectivos y resultados sin credenciales ni tokens.

Pendientes registrados de la auditoría, sin activarlos en esta entrega:

- M14 pendiente en remoto y `client-login` todavía no desplegada.
- El CORS de `admin-users` rechazó el dominio Vercel publicado; falta su ajuste.
- Site URL/redirects de Auth e invitaciones siguen pendientes de configuración.
- La asociación RUC → estudio es correcta actualmente, pero el resolvedor no
  revalida el RUC si luego cambia el del estudio explícitamente asociado.
- Revisión cruzada, eventual aplicación remota y E2E posterior requieren otra
  autorización. No se ejecutó SQL remoto, no hubo tickets remotos ni despliegues.

M15 no depende técnicamente de M14, como demuestra la base M13 aislada; esto no
autoriza alterar el orden del historial remoto. No cambiar M1–M14 ni ejecutar
`db push` como parte de esta revisión: podría aplicar también M14 pendiente.

## Integración local controlada — 19/11/2026

Rama `integration/ticketera-security-client-flow`, base común
`44cebebca91c0424762c3dd640c0a1f8ae4deaff`. Repositorio y worktree propios en
`/tmp/ticketera-integration-security-client-flow-20261119/`; ningún worktree previo
ni main se actualiza. Importación Git exclusivamente local, conservando los commits:

- Backend `c4e7252788b131264e0f209e4d5d872c551f6875`.
- Frontend `b21c91c666b1677914489078236777407fdc95cc`.
- Corrección de exportación `e528bc77fb4b42609e1344056786e41083dd56cb`.

No hubo conflictos de merge. Se resolvieron dos incompatibilidades de pruebas:
las suites históricas M13/M14 contaban todos los archivos de migración y fallaban
con M15 presente. Ahora seleccionan su prefijo histórico, conservando sus
comprobaciones; las pruebas integradas ejecutan por separado la cadena completa.
No se modificó ninguna migración ni código de producto adicional al ya revisado.

Prueba integrada nueva: `supabase/tests/integrated_security_client_flow_local.py`
ejecuta los adaptadores reales de cliente, operaciones/Planner, tablero y métricas
del árbol integrado contra los cuerpos RPC de PostgreSQL por socket Unix.
`tests/integration/database-client-flows.mjs` implementa el puente de pruebas.
La aserción externa de identidad y los esquemas Auth/Storage son ficticios: esto
no equivale a autenticación Quipu/QuipuFac ni Storage HTTP reales.

- A: M1–M15 antes de los fixtures; después se verifican roles, sesiones, creación,
  REQ, reintentos, adjuntos, bandeja, clasificación/aprobación/rechazo, Planner sin
  estudio, ocho fases, checklist, bloqueo, cierre/reapertura, auditoría y métricas.
- B: historia Administrative creada antes de M12; base M13 con usuarios, estudio,
  asociación, identidades, sesiones, ticket, reserva, objeto Storage y comentario
  ficticios existentes. M14 preserva las 34 tablas previas; M15 preserva las 35.
  Se ejecuta el mismo circuito y se opera el histórico sin convertir su flujo.
- Las suites SQL históricas siguen identificadas como M9/M11/M12/M13/M14; sus
  resultados no se presentan como si hubieran usado M15. La suite de seguridad
  M15 y los escenarios A/B sí ejecutan M15.
- React/Chromium recorre el portal y crea tickets solo en memoria del simulador,
  incluido adjunto, aislamiento y logout; Planner procesa un Excel sintético.
  Las pruebas de exportación incluyen 3.201 terminados y proyectos por lotes de 100.

Ejecución sin servicios remotos (requiere PostgreSQL 17 y Chromium locales):

```bash
python3 -B supabase/tests/integrated_security_client_flow_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib --scenario clean
python3 -B supabase/tests/integrated_security_client_flow_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib --scenario upgrade
node --test tests/*.test.mjs
CHROMIUM_EXECUTABLE=/ruta/chrome npm run test:ui
npm run build
```

Resultados exactos, matriz de requisitos, hashes, comandos y fallos iniciales del
arnés: [informe de integración](validation/integration-security-client-flow.json).
Las evidencias actuales se guardan bajo `validation/integration-security-client-flow/`;
no reemplazan las evidencias históricas de activaciones anteriores.

Aceptación local con observaciones: la exportación usa peticiones separadas,
no una fotografía transaccional. Un cambio concurrente que conserve el total
puede no detectarse. Se acepta la corrección del límite de filas con datos estables;
no se promete una fotografía coherente bajo cambios simultáneos. No se cambia SQL
para resolverlo aquí. Tampoco se activan M14/M15, client-login, CORS ni redirects.
No hubo SQL, tickets, configuración, push o despliegues remotos. La siguiente
verificación independiente debe partir de esta rama, antes de autorizar main o servicios.
