# Administración de cuentas — activa en Supabase

**Estado 18/11/2026:** primer superadmin: ver [procedimiento Dashboard](#primer-superadministrador--procedimiento-recomendado-dashboard).  migración `20261118000100` aplicada y verificada con
`scripts/apply_account_administration.py` (historial 5/5, RLS y permisos, 0 cuentas)
y Edge Function `admin-users` desplegada (v1, ACTIVE) en ticketera-procont
(`xsxdpaiivklqeudgqoqf`). `verify_jwt=false` según el diseño: el handler valida
el bearer con `getUser`. Pruebas negativas sin cuentas: sin token, token inválido,
JWT forjado y clave publicable → 401; origen no permitido → 403; RPC administrativas
por anon → 42501; `bootstrap_superadmin` no expuesta. Evidencia:
[`account-administration-remote.json`](validation/account-administration-remote.json).
**Panel habilitado:** `PROCONT_ALLOWED_ORIGINS=http://localhost:5173` (solo ese origen;
otros → 403). En **Equipo → Usuarios** un admin/superadmin puede crear cuentas
(contraseña 12–128, correo confirmado, perfil activo), editar rol/estado y desactivar.
El borrado sigue deshabilitado por diseño. Al desplegar el frontend, añadir su origen
HTTPS separado por comas: `supabase secrets set PROCONT_ALLOWED_ORIGINS=http://localhost:5173,https://<dominio>`.
Pendiente: invitaciones (callback + SMTP). Los pasos 1–2 de «Activación
pendiente» quedan completados; el texto siguiente se conserva como diseño.

Base `968eb5c`. Las cuatro migraciones aplicadas y las pantallas de Claude se
conservan. No se ejecutó SQL remoto, no se crearon cuentas reales ni se desplegó
la función. La migración nueva es
[`20261118000100_account_administration.sql`](../supabase/migrations/20261118000100_account_administration.sql).

## Backend y permisos

- `admin-users` valida cada bearer con Auth `getUser`. El actor procede de esa
  respuesta verificada; nunca del cuerpo o de roles en user_metadata.
- PostgreSQL comprueba administrador activo en cada reserva y finalización.
  Admin gestiona developer/viewer; superadmin gestiona también admin/superadmin.
  El mismo bloqueo transaccional serializa bootstrap y cambios de permisos.
- Las RPC `admin_account_begin`, `admin_account_record`, `admin_account_finish`
  solo tienen EXECUTE para service_role. Usuarios autenticados y anónimos no
  pueden suplantar un actor llamándolas directamente. Las dos tablas privadas
  tienen RLS y carecen de acceso directo para esos roles, incluso service_role.
- `admin_update_user(uuid,text,boolean)` mantiene su contrato con el frontend.
  Comprueba permisos después de tomar el bloqueo, protege al último superadmin
  activo y exige correo Auth confirmado para activar.
- La creación por contraseña confirma el correo administrativamente y activa
  el perfil tras verificar al actor. El administrador debe haber comprobado la
  identidad y entregar la contraseña por un canal aprobado. Mínimo 12 caracteres.
- La invitación envía el correo mediante Auth y crea un perfil **inactivo**.
  Después de aceptar y confirmar el correo, un administrador debe activarlo.
  Los JWT anteriores no eluden la desactivación: las políticas leen el perfil
  activo en PostgreSQL. No se incorpora bloqueo/borrado de identidades Auth.

El hook `useUsers` conecta la creación de la pantalla existente a la función y
conserva la sesión del administrador. No se cambiaron componentes ni formularios.
El cliente `administerAccount` también prepara `invite` y `resume`, sin añadir
botones o pantallas. No se añadieron áreas: no son necesarias para autenticar o
asignar roles y su catálogo continúa pendiente de definición con el propietario.

## Fallos entre Auth y PostgreSQL

Son dos servicios y no hay una transacción distribuida. Cada alta exige un
`request_id` UUID estable. La reserva guarda actor, operación y datos del perfil
en una tabla privada; **nunca contraseña, token ni clave**. Se registra el UUID
Auth antes de finalizar el perfil. Finalizaciones repetidas devuelven el mismo
resultado; no vuelven a crear Auth ni sobrescriben perfiles existentes.

Si se revocan permisos después de crear Auth, la finalización se rechaza y el
perfil no queda activo. Un job `auth_created` puede finalizarse con `resume` por
el mismo actor aún autorizado. Un job `reserved` con resultado Auth desconocido
requiere revisión administrativa por UUID de solicitud; no buscar/borrar cuentas
automáticamente ni usar otro identificador para reintentar. Un correo ya enviado
no se puede deshacer, y una cuenta sin perfil activo no entra en la aplicación.

## Activación pendiente en Supabase

Requiere autorización posterior; ninguna de estas operaciones se ejecutó:

1. Aplicar exclusivamente la migración 5 en una ventana controlada, con nueva
   captura de recuperación específica. Los bundles y scripts congelados de las
   primeras cuatro migraciones no cubren esta quinta. Si ya hay cuentas/jobs,
   no retirar tablas ni restaurar funciones con compensaciones antiguas.
2. Activar/desplegar únicamente `admin-users` tras aprobar ese paso. El TOML local
   lleva `verify_jwt=false` porque el handler verifica explícitamente el JWT con
   `getUser` antes de cualquier RPC/Auth Admin; no deja un endpoint de bootstrap.
3. Configurar `PROCONT_ALLOWED_ORIGINS` con los orígenes aprobados del frontend.
   `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables exclusivas del
   servidor. Ninguna clave privilegiada se configura con prefijo `VITE_`.
4. Antes de usar invitaciones: aprobar un callback HTTPS, configurarlo como
   `PROCONT_INVITE_REDIRECT_URL` y en la lista de redirecciones de Auth, y verificar
   el envío SMTP. El frontend actual no tiene pantalla de aceptación/contraseña:
   esa integración queda para autorización posterior, sin diseñarla aquí. Sin
   redirect explícito la operación de invitación se rechaza, sin enviar correo.

## Primer superadministrador — procedimiento recomendado (Dashboard)

Sin contraseñas en terminal ni claves privilegiadas. Proyecto **ticketera-procont**
(`xsxdpaiivklqeudgqoqf`); no usar otro proyecto de la organización.

1. **Authentication → Users**: comprobar que la lista está vacía. **Add user →
   Create new user** con el correo aprobado y una contraseña nueva, marcando
   **Auto Confirm User**. No crear ningún otro usuario.
2. **SQL Editor → New query**: pegar y ejecutar
   [`supabase/bootstrap/superadmin_dashboard.sql`](../supabase/bootstrap/superadmin_dashboard.sql).
   La última tabla debe mostrar `superadmin_ok = true`, `bootstrap_bloqueado = true`,
   `usuarios_auth = 1` y `superadmins_activos = 1`.

Seguridad: el bloque es atómico y solo acepta exactamente un usuario Auth, con
ese correo y confirmado. La función privada `app_private.bootstrap_superadmin`
(solo ejecutable por el propietario de la base, no por API ni navegador) rechaza
cualquier ejecución si ya hay perfiles o si el bootstrap se usó alguna vez; la
marca es permanente. Ningún otro usuario Auth recibe perfil ni rol por este medio.
El esquema no tiene nombre de usuario independiente: el acceso es por correo
(`milton.rios` queda como requisito pendiente).

Un intento anterior con `bootstrap_superadmin.py --execute` terminó en «Credenciales
inválidas»: es una validación local previa a cualquier conexión (entrada oculta
vacía —p. ej. Ctrl+V no pega en la terminal—, clave publicable, contraseña < 12
caracteres o confirmación distinta). No se creó nada en Supabase.

## Primer superadministrador — alternativa por script (entorno confiable)

El comando por defecto muestra el plan **sin red ni creación de cuentas**:

```bash
python3 scripts/bootstrap_superadmin.py
```

Después de aplicar la migración 5 y autorizar la identidad real, un único operador
desde Ubuntu confiable ejecutará:

```bash
python3 scripts/bootstrap_superadmin.py --execute
```

Solicita nombre/correo aprobados y entradas ocultas para contraseña del propietario
PostgreSQL, clave privilegiada y contraseña nueva confirmada. Fija el destino al
proyecto independiente; no acepta otra URL ni claves por argumentos. Comprueba
instalación vacía y migración 5, crea una única identidad Auth confirmada mediante
Admin API y llama por conexión de propietario a la función **privada** existente
`app_private.bootstrap_superadmin(uuid)`, reforzada con un marcador irreversible
desde la aplicación. No se concede acceso a esa función a service_role ni al
navegador. Ni desactivar ni eliminar después esa cuenta reabre el bootstrap.

Si falla tras crear Auth, conserva el UUID y los SQL privados en `.supabase-local/`
para revisión del propietario; no borra la identidad ni reintenta automáticamente.
La clave y las contraseñas viajan solo por memoria/entorno del proceso hijo o
stdin; no se guardan. La confirmación final consulta un booleano del perfil y
marcador. No ejecutar `--execute` durante esta preparación.

## Validación y cierre

Se ejecutaron solo 19 comprobaciones nuevas en PostgreSQL **17.12** aislado y
10 del endpoint con adaptadores falsos, sin cuentas Auth reales. El servidor
temporal se detuvo. Evidencia:
[`account-administration-local.json`](validation/account-administration-local.json).
No se repitieron las suites SQL, consumidor o frontend anteriores. La provisión
Auth real, SMTP, callback y funcionamiento alojado requieren activación posterior.
Las APIs oficiales de [creación](https://supabase.com/docs/reference/javascript/auth-admin-createuser),
[invitación](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
y [validación del usuario](https://supabase.com/docs/reference/javascript/auth-getuser)
se usan exclusivamente en sus límites de servidor.

El entorno del agente monta `.git` en solo lectura. El cierre preparado se ejecuta
en una terminal Ubuntu normal, sin SQL, suites ni red:

```bash
python3 /home/procont/projects/ticketera-procont/scripts/close_account_admin.py
```

Solo admite los archivos revisados de esta entrega, no añade evidencia privada,
crea commit sin Co-Authored-By y exige Git limpio. No hace push.
