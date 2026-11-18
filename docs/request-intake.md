# Formulario del cliente y validación interna — activos

18/11/2026. Migración [`20261118000400_request_intake.sql`](../supabase/migrations/20261118000400_request_intake.sql)
aplicada con Supabase CLI (historial 8/8). Las siete anteriores no cambian.
Evidencia: [local](validation/request-intake-local.json) · [remota](validation/request-intake-remote.json).

## Cliente (`/request`)

Nombre · Estudio · Proyecto / Sistema · Tipo de solicitud (uno) · Título · Descripción ·
adjuntos (hasta 5, 10 MB, imágenes/PDF/Office/texto) · «Solicito atención urgente».
No ve correo, subproyecto, área, RUC, códigos, responsables, prioridad, SLA ni la antigua
división código/administrativo. RPC `submit_client_request`; recibe número REQ y token.
Seguimiento (`/tracking`): solo número, estado, fecha, título y motivo de rechazo
(`track_request` ya no devuelve SLA, fases ni progreso).

Tipos (catálogo `request_types`, editable en Equipo → Catálogos → Tipos de solicitud):
Error / Incidencia, Nueva funcionalidad, Mejora, Soporte técnico, Acceso / Permisos,
Reporte / Extracción, Integración / Automatización, Capacitación / Consulta, Otros.

## Validador (Requests → solicitud)

Muestra la información original (inmutable), evidencias (enlaces firmados de 10 min) y la
urgencia solicitada. Clasificación interna con `classify_request` (admin/superadmin):
código interno del estudio (obligatorio para decidir), subproyecto (obligatorio al aceptar
si el proyecto lo exige), área (obligatoria al aceptar solo para BUSINESS ACCOMPANYING SAC)
y subárea opcional; no aplicables a otros estudios.

- **Aceptar:** responsable, prioridad definitiva (baja/media/alta/urgente), tablero
  (desarrollo/administrativo/ambos); crea el trabajo. **SLA: «Pendiente de configuración»**:
  no se calcula fecha (se eliminaron `sla-config.ts` y las fórmulas heredadas).
- **Rechazar:** código interno + motivo obligatorio; sin responsable ni SLA.

Reglas en base de datos (trigger): datos del cliente inmutables; clasificación editable solo
mientras está pendiente; requisitos de decisión anteriores. Trazabilidad en `request_events`
(submitted, classified, approved, rejected, requester_corrected), visible solo a miembros.

## Seguridad y compatibilidad

- Bucket privado `request-attachments`: el cliente solo puede subir a la carpeta de su
  solicitud recién creada (30 min, pendiente, máx. 5); lectura solo para miembros internos.
- Anon ya no puede usar `submit_request` ni `submit_classified_request` (siguen para usuarios
  internos/importador). Solicitudes y proyectos históricos sin cambios; se validan sin clasificación.

## Pendientes

- Definir plazos SLA de Procont (hoy «Pendiente de configuración»).
- Primer ticket real: prueba de punta a punta con sesión de validador (la vista interna
  requiere iniciar sesión; se validó con 22 comprobaciones aisladas y build).
- Al desplegar el frontend: añadir su dominio a `PROCONT_ALLOWED_ORIGINS` (solo afecta a
  la administración de usuarios).
