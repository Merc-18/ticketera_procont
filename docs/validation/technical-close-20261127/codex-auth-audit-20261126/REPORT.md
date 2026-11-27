> Copia histórica para trazabilidad. Scripts/capturas enlazados en este informe permanecen en `.agent-artifacts/authenticated-qa-20261126/`; no se duplicaron aquí.

# Auditoría alojada sin inicio de sesión manual — 26/11/2026

Proyecto: `ticketera-procont` / `xsxdpaiivklqeudgqoqf`. Web: https://ticketera-procont.vercel.app. Ejecución: `qa-audit-20261126-93983171`, 09:43–09:46 America/Lima. Chromium mostró la versión publicada `202611251625`.

Se completaron las pruebas posibles con los permisos disponibles. Se encontraron credenciales válidas de servicio, se crearon cuatro identidades temporales mediante Auth Admin API y se ejecutaron operaciones reales de Auth, Storage y Realtime. La asignación de perfiles/roles de aplicación quedó bloqueada: **la clave service_role no tiene acceso directo a public.users**. No se simularon roles ni respuestas; las cuatro identidades nunca tuvieron un rol de aplicación activo.

## Acceso y provisión

- Se leyó la credencial de administración ya disponible en el entorno local protegido. Las claves del proyecto se obtuvieron mediante Management API y se utilizaron en memoria; no se imprimieron ni guardaron en artefactos o argumentos de procesos.
- Auth Admin y Storage: HTTP 200. Lectura de `public.users` con service_role: HTTP 403 / `42501`, `permission denied for table users`.
- Se crearon cuatro UUID Auth nuevos con correo sintético `example.invalid`, contraseña aleatoria y correo confirmado. Las etiquetas superadmin/admin/developer/viewer indican el **rol solicitado**, no un permiso concedido.
- Se intentó un INSERT de perfil exclusivamente para el UUID QA recién creado, sin upsert ni modificación de perfiles existentes. Supabase lo rechazó con HTTP 403 / `42501`.
- El OpenAPI real no expone `app_private.provision_auth_profile`. `admin_account_begin` rechazó al actor QA sin perfil con `42501`. `admin-users` rechazó las cuatro sesiones QA con `forbidden` antes de crear cuentas adicionales.
- No se reutilizó ni suplantó una identidad existente. No se invocó el bootstrap de la instalación ni se modificaron grants, políticas, funciones, esquema o configuración de Auth.
- La llamada MCP `execute_sql` de lectura fue rechazada por el control automático: `MCP tool call requires approval, but approval policy is never`. No se ejecutó SQL ni se recurrió a otra vía SQL para eludir ese rechazo.

## Resultados reales

| Prueba | Resultado | Alcance acreditado |
|---|---|---|
| Auth Admin crea cuatro cuentas nuevas | PASS | Auth alojado; identidades QA temporales |
| Login por contraseña + verificación de JWT | PASS, cuatro identidades | Auth real; no equivale a tener perfil activo |
| Contraseña incorrecta rechazada | PASS | HTTP 400 |
| Rotación real de refresh token | PASS | Auth alojado |
| Metadatos de usuario con rol/activación falsos | PASS | No conceden acceso; RPC administrativa sigue en 403 |
| Lecturas autenticadas sin perfil | PASS | `projects` devuelve cero filas |
| Escrituras/RPC sin perfil | PASS | Rechazo real de tablero, dashboard, alta interna, reserva de evidencia, cambio de rol e inserción de perfil |
| Login publicado en Chromium | PASS, cuatro identidades | Auth devuelve 200; la aplicación impide entrar con «Tu cuenta no tiene un perfil activo autorizado» |
| Bucket original `request-attachments` | PASS, configuración | Privado, límite de 2.500.000 bytes, MIME explícitos; no se alteró |
| Storage binario con service_role | PASS | Bucket privado QA aislado; subida, listado con tamaño real, descarga con SHA-256 coincidente |
| URL firmada de objeto privado | PASS | Descarga real y hash coincidente; URL/token no persistidos |
| Acceso público y usuarios sin perfil | PASS | URL pública, descargas y subidas arbitrarias rechazadas |
| MIME y tamaño máximo | PASS | Motor Storage rechaza MIME prohibido y cuerpo real de 2.500.001 bytes |
| Upload sin reserva en bucket de aplicación | PASS, cuatro identidades | Rechazo real de `request-attachments`; no se insertaron objetos por SQL |
| Realtime con JWT Auth QA | PASS, cuatro identidades | Suscripción y entrega real de broadcast con nonce comprobado; canales públicos efímeros |
| Borrado de recursos QA | PASS final | Cuatro cuentas Auth, objeto y bucket temporal ausentes |

El archivo binario contenía únicamente texto sintético de la ejecución. El hash se encuentra en `results.json`. No se usaron fixtures REST/Auth, interceptaciones de red, JWT fabricados ni sesiones verificadas de cliente creadas artificialmente.

## Bloqueos que permanecen sin aprobar

| Cobertura solicitada | Bloqueo concreto |
|---|---|
| Operaciones de superadmin, admin, developer y viewer activos | No se pudieron provisionar/activar los perfiles; service_role recibe 42501 y no existe sesión administrativa QA autorizada |
| Dashboard, Boards, Gantt, Roadmap y Equipo autenticados | La aplicación publicada impide entrar correctamente sin perfil activo |
| Cambios de fase/checklist/comentarios, cierre/reapertura y confirmación M20 | Requieren perfiles y/o solicitud de cliente real; no se realizaron escrituras con un rol simulado |
| Storage de aplicación: reserva válida, subida/descarga autorizada, límite de cuatro archivos y vínculo con actor | No existe actor QA con perfil editor activo; el round trip del bucket aislado no acredita este flujo |
| Eventos Realtime de cambios PostgreSQL bajo RLS de los cuatro roles | Broadcast comprueba el transporte real; no acredita eventos de proyectos ni autorización por rol |
| Login Quipu/QuipuFac, sesión cliente, acceso ajeno y uploads de cliente | No había credenciales verificadas de proveedor QA. Una sesión sintética creada con service_role no probaría el login real |

Los bloqueos no se contabilizan como aprobaciones. El mensaje de Chromium es evidencia de rechazo de una identidad sin perfil, no de acceso como admin/superadmin/developer/viewer.

## Limpieza y observaciones de verificación

Se verificó la pertenencia de cada cuenta a esta ejecución mediante UUID, correo sintético y `user_metadata.qa_run` antes de borrarla mediante Auth Admin API. Las cuatro devolvieron 404 al volver a consultarlas. La lista final de Auth confirmó **cero cuentas de esta ejecución**. No se modificó ninguna cuenta preexistente.

Los intentos de desactivar perfiles inexistentes devolvieron 42501. El logout de las sesiones originales devolvió 403 después del cierre efectuado al rechazar el perfil en la web; se conservan estos resultados en el registro. Después se bloquearon y eliminaron las cuatro identidades nuevas mediante Auth Admin API. Nunca se crearon perfiles activos, proyectos, solicitudes ni portafolios QA en esta ejecución.

El objeto y el bucket se eliminaron exclusivamente mediante Storage API. La lista final de buckets contiene **un bucket**, el original; la consulta del temporal devuelve `NoSuchBucket` / `Bucket not found`. La descarga final del objeto falla.

La ejecución inicial conservó una observación: un GET inmediato al objeto después del DELETE devolvió 200. Las consultas posteriores, incluida la URL original, devolvieron 400; la lista de buckets confirmó su ausencia. Esto es compatible con propagación de caché, pero no se registraron cabeceras del GET inicial para atribuirle una causa definitiva. La [documentación de Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn) describe propagación de invalidación de hasta 60 segundos.

La primera comprobación del bucket esperaba erróneamente HTTP 404; Storage respondió HTTP 400 con `statusCode: "404"`, `code: "NoSuchBucket"`. La verificación final utiliza el código semántico y la lista autoritativa. Los registros originales se conservan sin sobrescribir estas observaciones.

`results.json` conserva el resultado bruto principal: **88 PASS, 1 FAIL observado y resuelto en la verificación final, 12 BLOCKED**; varios bloqueos describen la misma falta de perfil y uno es el cierre de esa rama de ejecución. No son doce defectos distintos. `cleanup-verification.json` conserva la expectativa HTTP incorrecta mencionada; las cuatro comprobaciones de `final-verification.json` pasan. No se presenta este conteo como cobertura completa de la aplicación.

Se revisaron los artefactos textuales contra las credenciales reales en memoria: **cero coincidencias**. Las capturas contienen únicamente el formulario y datos sintéticos; los campos de contraseña permanecen ocultos.

## Evidencias y reproducción

- [Resultados originales](results.json), [registro de ejecución](run.log).
- [Limpieza de cuentas y reconsulta de Storage](cleanup-verification.json).
- [Comprobación final de ausencia de recursos QA](final-verification.json).
- [Captura superadmin solicitado](screenshots/superadmin-profile-denied.png), [admin solicitado](screenshots/admin-profile-denied.png), [developer solicitado](screenshots/developer-profile-denied.png), [viewer solicitado](screenshots/viewer-profile-denied.png).
- `audit.mjs` y `limited-audit.mjs`: solicitudes reales; una repetición crea recursos QA nuevos. No se ejecutan como tests unitarios locales.
- `cleanup-and-verify.mjs`: elimina únicamente identidades que coinciden con el manifiesto y las marcas de esta ejecución.
- `final-verification.mjs`: verificación final de solo lectura y revisión de credenciales en artefactos.

Se consultaron las referencias oficiales de [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [borrado mediante Storage API](https://supabase.com/docs/guides/storage/management/delete-objects) y [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes). No se modificó código de producto ni se desplegó una nueva versión.

## Revalidación posterior — 26/11/2026, 18:13 America/Lima

Se volvió a comprobar el acceso sin crear cuentas ni recursos nuevos. Auth Admin y Storage siguen disponibles (HTTP 200); `public.users` continúa rechazando service_role (HTTP 403 / 42501). Se confirmó nuevamente que no quedan cuentas de la ejecución QA, que el bucket temporal no existe y que su objeto no puede descargarse. Las cuatro verificaciones finales pasan. El bloqueo para provisionar roles activos sigue vigente; no se simularon roles ni se alteraron permisos. Evidencia: [revalidation.json](revalidation.json) y [final-verification.json](final-verification.json).
