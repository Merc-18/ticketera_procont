# Ticketera Controlling

Sistema de gestión de tickets y proyectos para el área de Controlling de Gilat Perú. Permite administrar solicitudes internas y externas, gestionar flujos de desarrollo y proyectos administrativos, y hacer seguimiento de SLAs en tiempo real.

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
- Métricas por área (SAQ, DDC, QA, ATC, AASS, PMO, OC, Controlling)

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
| Estilos | Tailwind CSS 3 |
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
│   └── ui/             # Toast y componentes compartidos
├── hooks/              # Custom hooks (useProjects, useAuth, useRequests…)
├── lib/                # Supabase client, constantes, SLA config, utilidades
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
