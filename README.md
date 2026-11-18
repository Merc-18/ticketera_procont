# Ticketera Procont

**Administración de cuentas activa:** migración `20261118000100` aplicada (5/5) y Edge Function `admin-users` desplegada y verificada contra accesos no autorizados; aún sin cuentas ni superadmin. Ver [administración de cuentas](docs/account-administration.md).

**Aplicación remota verificada:** las versiones `20261117000100`, `20261117000200`, `20261117000300` y `20261117000400` quedaron registradas en ticketera-procont. Se comprobaron las cuatro transiciones con el alcance de recuperación, 13 tablas propias con RLS y 35 pasos genéricos de checklist. No se crearon cuentas ni superadmin. Las compensaciones se generaron solo en privado, sin ejecutarlas. La evidencia vigente está en `docs/validation/continuacion-af3259f-baseline.json`. Los estados NO APTO anteriores de estos informes son antecedentes, superados para este conjunto. Siguiente paso: definir con el propietario las áreas y la provisión inicial de acceso, bajo autorización separada.

Sistema de gestión de tickets y proyectos para un entorno laboral independiente.

La [administración de cuentas](docs/account-administration.md) está preparada
localmente: migración 5, backend de creación/invitación, activación y roles, y
bootstrap privado del primer superadministrador. Falta autorizar su activación
en Supabase; no se crearon cuentas reales y no se modificaron las pantallas.
Reutiliza la arquitectura y las funcionalidades de la ticketera original; las
áreas, personas y políticas de Procont se definirán con el propietario del proyecto.
Permite administrar solicitudes internas y externas, proyectos y flujos de trabajo,
checklists, tableros, comentarios, notificaciones y seguimiento de SLA.

La revisión organizacional está en
[FASE 2B.3C: adaptación a Procont](docs/fase-2b3c-adaptacion-procont.md).
Las cuatro migraciones no contienen áreas, cuentas ni datos empresariales de
Gilat. El frontend ya usa la identidad visual de Procont Business y no contiene
el catálogo de áreas ni los textos heredados; los parámetros SLA heredados siguen
pendientes de definición. Paleta y cambios en
[Frontend: identidad Procont](docs/frontend-identidad-procont.md).

---

## Tabla de contenidos

- [Funcionalidades](#funcionalidades)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Roles y permisos](#roles-y-permisos)
- [Instalación local](#instalación-local)
- [Variables de entorno](#variables-de-entorno)
- [Base de datos](#base-de-datos)
- [Despliegue](#despliegue)

---

## Funcionalidades

### Gestión de solicitudes
- Portal público para envío de solicitudes (`/request`)
- Página de seguimiento para solicitantes (`/tracking`)
- Cálculo automático de fechas SLA según tipo, prioridad y días hábiles
- Bandeja de entrada para revisar, aprobar o rechazar solicitudes
- Importación masiva desde planificadores externos (Excel)

### Tableros de proyectos
- **Kanban** con drag-and-drop por fases
- **Tabla** con filtros, ordenamiento y exportación CSV
- **Gantt** para visualización de cronograma
- **Roadmap** para planificación de alto nivel
- Doble flujo: Desarrollo (Backlog → Deploy) y Administrativo (Backlog → UAT)

### SLA y trazabilidad
- Fechas SLA calculadas en días hábiles (sin fines de semana)
- Alertas y notificaciones cuando un proyecto se acerca al vencimiento
- Log de actividad con historial completo de cambios
- Bloqueos con motivo registrado
- Papelera con recuperación por admins

### Dashboard y analítica
- Conteo de proyectos por estado y prioridad
- Vista de carga de trabajo por miembro del equipo
- Métricas por área; el catálogo organizacional de Procont está pendiente de definición

### Administración
- Gestión completa de usuarios (CRUD)
- Activación / desactivación de cuentas
- Reloj del servidor en zona horaria America/Lima
- Control de acceso por rol

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript 5 |
| Build | Vite 5 |
| Estilos | Tailwind CSS 3 (paleta corporativa en `src/theme/brand.ts`) |
| Routing | React Router DOM 6 |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime) |
| Drag & Drop | @hello-pangea/dnd |
| Gráficas | Recharts |
| Fechas | date-fns (locale es-PE) |
| Excel | xlsx |
| Despliegue | Vercel |

---

## Arquitectura

```
src/
├── components/
│   ├── admin/          # Gestión de usuarios, carga de trabajo, papelera
│   ├── auth/           # Login y rutas protegidas
│   ├── boards/         # Kanban, tabla, Gantt, roadmap
│   ├── dashboard/      # Estadísticas y analítica
│   ├── projects/       # Modal de proyecto, comentarios, checklists
│   ├── requests/       # Formulario público, tracking, bandeja
│   ├── notifications/  # Centro de notificaciones
│   ├── layout/         # Estructura de página
│   └── ui/             # Toast, logotipo, campo de área y componentes compartidos
├── hooks/              # Custom hooks (useProjects, useAuth, useRequests…)
├── lib/                # Supabase client, constantes, SLA config, utilidades
├── theme/              # brand.ts: paleta y textos corporativos (fuente única)
├── types/              # Interfaces TypeScript generadas desde Supabase
└── App.tsx             # Enrutamiento principal
```

---

## Roles y permisos

| Rol | Acceso |
|---|---|
| **Superadmin** | Control total: usuarios, todos los proyectos, papelera |
| **Admin** | CRUD de usuarios, gestión completa de proyectos, papelera, reloj |
| **Developer** | Crear y editar proyectos, ver carga de trabajo y solicitudes |
| **Viewer** | Solo lectura en tableros y proyectos |

---

## Instalación local

### Requisitos
- Node.js 20+ (el lockfile actual de Supabase requiere Node 20 como mínimo)
- npm 9+
- Para ejecutar la aplicación: un proyecto Supabase independiente de pruebas

### Pasos

```bash
# 1. Usar esta copia independiente en WSL
cd /home/procont/projects/ticketera-procont

# 2. Instalar exactamente las dependencias del lockfile
npm ci

# 3. Validar TypeScript y generar la compilación de Vite
npm run build
```

La compilación no requiere credenciales ni ejecuta la aplicación. Para iniciar
`npm run dev`, configurar primero `.env.local` con un backend independiente de
pruebas; no reutilizar la configuración del proyecto original. La aplicación
estará disponible en `http://localhost:5173`.

Los resultados del saneamiento y los pendientes están en
[FASE 1: saneamiento y entorno local](docs/fase-1-saneamiento.md).

El esquema nuevo, las políticas y las operaciones transaccionales están en
[FASE 2A: PostgreSQL y Supabase](docs/fase-2a-supabase.md). La secuencia válida
está en `supabase/migrations/`; los SQL históricos de la raíz no forman parte
de ella. Las migraciones todavía no se han aplicado al proyecto remoto.

Los consumidores de la aplicación ya están adaptados localmente a esas RPC.
La configuración, las pruebas y los pasos de conexión autorizada están en
[FASE 2B1: integración local](docs/fase-2b1-integracion.md).

El procedimiento actualizado para CLI 3.2.0, la captura local de configuración
y el plan de aplicación/reversión están en
[FASE 2B.2: preparación de Supabase](docs/fase-2b2-preparacion.md).

La aplicación remota sigue pendiente. El procedimiento vigente por pasos y los
scripts de compensación están en
[FASE 2B.3B: recuperación de migraciones](docs/fase-2b3b-recovery-plan.md).
El manifiesto vigente es el de 2B.3D, que revisa M3 para evitar triggers propios
en Auth; 1/2/4 conservan sus hashes. Las compensaciones están fuera de
`supabase/migrations/` y solo se usan mediante un bundle generado desde
inventarios privados del destino. Se probaron 26 casos locales de recuperación,
sin repetir suites anteriores ni crear cuentas. **NO APTO todavía para aplicar
en Supabase** hasta obtener el baseline real y confirmar privilegios de conexión
CLI/fuente Auth bajo autorización separada. PostgreSQL 17.12 ya fue reportado
por el usuario. El plan Free confirmado no
ofrece backups automáticos/PITR.

La [FASE 2B.3D](docs/fase-2b3d-resolucion-bloqueos.md) corrige los bloqueos de
Auth e historial: provisión privada explícita, ledger inicializado por CLI y
repair separado después de compensar. Siete comprobaciones locales nuevas
pasaron sin cuentas ni suites anteriores. La conexión CLI real y permisos
pendientes mantienen el **NO APTO remoto**. Los seis event triggers administrados
se conservan; no se conceden privilegios ni se modificó Supabase.

**Estado posterior:** conexión nativa y baseline privado completados por el
usuario; integridad, identidad y hashes comprobados localmente. La aplicación
remota sigue pendiente: la contraseña anterior no se guardó. El
[procedimiento vigente](docs/conexion-cli-baseline.md) proporciona el comando
`python3 scripts/apply_supabase_migrations.py`, que solicita entrada oculta,
comprueba el estado remoto y aplica solo las cuatro migraciones por pasos si
todos los controles pasan. Verifica resultados y cierra Git local sin publicar.

La revisión 2B.3C conserva las cuatro migraciones y la recuperación 2B.3B sin
cambios. El área se almacena como texto sin lista empresarial en SQL; todavía
no existe un catálogo administrable de áreas. Su definición y la adaptación de
los selectores/importador del frontend se decidirán posteriormente, sin importar
áreas ni usuarios de la organización original.

El [preflight de catálogos](docs/fase-2b3-catalog-preflight.md) ya fue ejecutado
por el usuario. No repetir ese inventario. La
[continuación desde af3259f](docs/conexion-cli-baseline.md) explica cómo descargar
la exportación existente de ChatGPT y copiarla a una carpeta privada ignorada
por Git. El importador offline valida su estructura y genera un recibo; ese
catálogo no reemplaza el baseline operativo. La identidad CLI real y dicho
baseline siguen pendientes: **NO APTO para aplicar las migraciones**. La
exportación ya se importó (3382 filas; hash del recibo confirmado). El 18/11 se
autorizó avanzar con conexión, baseline y aplicación condicionada de los cuatro
archivos. El enlace CLI ya fue confirmado y las cuatro versiones siguen sin
aplicar según `migration list` reportado por el usuario; no se repite esa lectura.
Ejecutar en la terminal local
`python3 scripts/connect_supabase_cli.py --use-saved-link`
para reutilizar el endpoint guardado, introducir solo la contraseña oculta y
obtener identidad/primer baseline, según la guía. Ese comando no aplica migraciones ni guarda la
contraseña. Se conservan todos los cambios locales.

Se corrigió un fallo de confianza TLS del comando: ahora `verify-full` utiliza
la CA oficial de CLI 3.2.0 y los errores distinguen etapa y categoría sin mostrar
secretos. La cadena y el hostname se verificaron sin autenticación ni SQL.
El [diagnóstico vigente](docs/conexion-cli-baseline.md) explica la corrección y
por qué la lectura mediante Management API no sustituye la identidad nativa.

---

## Variables de entorno

Crear un archivo `.env.local` en la raíz con:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Completar ambos valores desde Connect / Settings → API Keys del proyecto nuevo.
Se admite `VITE_SUPABASE_ANON_KEY` como compatibilidad con una clave JWT `anon`.
Usar exclusivamente la URL y la clave publicable del proyecto independiente de
pruebas. Las variables `VITE_*` se incluyen en el frontend: nunca colocar claves
secretas o `service_role` en ellas. Solo `.env.example` debe estar versionado;
los demás archivos `.env*` están ignorados. El usuario ya preparó `.env.local`
en FASE 2B.2; las migraciones remotas siguen pendientes de autorización. No
iniciar la aplicación contra ese destino hasta completar el procedimiento y
los requisitos de [FASE 2B.2](docs/fase-2b2-preparacion.md). Sin configuración
válida, la aplicación muestra «Configuración pendiente» y no inicializa Supabase.

---

## Base de datos

Los siguientes archivos son scripts históricos, no una cadena completa y
validada de migraciones. Falta el esquema inicial de las tablas principales y
la creación del trigger de numeración. No ejecutarlos para preparar esta copia:
su revisión y corrección corresponde a la FASE 2.

| Archivo | Descripción |
|---|---|
| `admin_setup.sql` | Cambios de usuarios y cuentas demo con contraseñas conocidas |
| `sla_migration.sql` | Campos y lógica de SLA |
| `tags_migration.sql` | Sistema de etiquetas |
| `notifications_migration.sql` | Tabla de notificaciones |
| `int_number_migration.sql` | Columna e índice de numeración de proyectos internos |
| `migrate_number_format.sql` | Formato de numeración |
| `rls_fix.sql` | Políticas de Row Level Security |
| `seed_data.sql` | Datos demo; elimina registros existentes y desactiva comprobaciones |
| `seed_test_data.sql` | Escenarios heredados con áreas, solicitantes y fechas; no son las pruebas aisladas actuales |
| `tags_migration.sql`, `tags_cleanup.sql` | Etiquetas históricas y limpieza ligada a áreas anteriores |
| `fix_enable_rls_all_tables.sql` | Ajustes históricos de RLS; no sustituye las políticas preparadas |

Las identidades, correos, áreas, plazos y ejemplos de esos archivos no forman
parte de la configuración de Procont. Se conservan como antecedentes; no se
importan ni se ejecutan. El único contenido inicial previsto en las migraciones
son los 35 pasos genéricos de checklist, editables por administradores autorizados.

No ejecutar `setup.js`: es un generador histórico que sobrescribe archivos de
la aplicación. Ahora toma la plantilla `.env.example` en lugar de contener
configuración de acceso heredada. No es parte de la instalación con `npm ci`.

---

## Despliegue

El proyecto está configurado para Vercel. Para desplegar:

```bash
npm i -g vercel
vercel --prod
```

O conectar el repositorio directamente desde el dashboard de Vercel y configurar las variables de entorno en Settings → Environment Variables.
