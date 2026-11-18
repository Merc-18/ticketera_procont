# Formulario del cliente y validación interna — activos (con M9)

**M9 integrada en `main` y aplicada en Supabase (historial 9/9):** la
migración `20261118000500_ticket_security.sql` de Codex añade reserva de adjuntos autorizada
por token de seguimiento, límites de 4 archivos y 2.500.000 bytes verificados en Storage, y
separa el motivo público de rechazo de las notas internas. El frontend ya usa ese contrato
(ver abajo). Las ocho migraciones anteriores no cambian.
Véase [seguridad de tickets](ticket-security.md). El resto describe M8 activa.

18/11/2026. Migración [`20261118000400_request_intake.sql`](../supabase/migrations/20261118000400_request_intake.sql)
aplicada con Supabase CLI (historial 8/8). Las siete anteriores no cambian.
Evidencia: [local](validation/request-intake-local.json) · [remota](validation/request-intake-remote.json).

## Cliente (`/request`)

Nombre · Estudio · Proyecto / Sistema · Tipo de solicitud (uno) · Título · Descripción ·
adjuntos · «Solicito atención urgente». Seguimiento solo con el número REQ: ver
[trazabilidad](request-tracking.md) (el token ya no se muestra; queda como credencial de adjuntos).
No ve correo, subproyecto, área, RUC, códigos, responsables, prioridad, SLA ni la antigua
división código/administrativo. RPC `submit_client_request`; recibe número REQ y token.
Seguimiento (`/tracking`): solo número, estado, fecha, título y motivo de rechazo
(`track_request` ya no devuelve SLA, fases ni progreso).

Tipos (catálogo `request_types`, editable en Equipo → Catálogos → Tipos de solicitud):
Error / Incidencia, Nueva funcionalidad, Mejora, Soporte técnico, Acceso / Permisos,
Reporte / Extracción, Integración / Automatización, Capacitación / Consulta, Otros.

## Adjuntos: compresión en el navegador

Reglas aprobadas: **máximo 4 archivos** y **total ≤ 2.500.000 bytes**. `AttachmentPicker`
muestra cada archivo, su tamaño original y final, y el total frente al límite; permite quitar
archivos antes de enviar. Si el total supera el límite, `prepareAttachments`
(`src/lib/attachment-prep.ts`) recomprime **solo imágenes** PNG/JPEG/WebP/BMP con Canvas → WebP
(JPEG si no hay WebP), conservando la proporción. Avanza por niveles de menor a mayor pérdida
(calidad 0,90 → 0,65; lado mayor nunca por debajo de 1600 px para mantener legibles las
capturas) y se detiene en el primero que cumple. PDF, Word, Excel, texto y GIF no se modifican.
Si ni así cabe, muestra un mensaje claro y bloquea el envío.

**Flujo integrado con el contrato de Codex (M9):** preparar/comprimir → `submit_client_request`
→ `reserve_request_attachments(request_id, tracking_token, lote)` (atómico; el token privado
solo viaja a la RPC) → subir cada archivo a la ruta asignada por el servidor
(`uploadReservedTicketAttachment`, `upsert:false`). `src/lib/attachment-delivery.ts` usa
`contracts/ticket-security-client.mjs` sin modificarlo (tipos en `.d.mts`). Cada archivo recibe
una `upload_key` estable; si la reserva o alguna subida falla, la confirmación muestra qué
archivos faltan y permite **reintentar** con las mismas claves dentro de los 30 minutos.

Pruebas: `tests/attachment-prep.test.mjs` (8, lógica con compresor simulado) y prueba real en
Chromium headless: 3 capturas PNG 2880×1800 + PDF (8,15 MB) → 2,26 MB en 0,7 s, WebP
2560×1600, texto de 13 px legible, PDF intacto.

## Validador (Requests → solicitud)

Muestra la información original (inmutable), evidencias (enlaces firmados de 10 min) y la
urgencia solicitada. Clasificación interna con `classify_request` (admin/superadmin):
código interno del estudio (obligatorio para decidir), subproyecto (obligatorio al aceptar
si el proyecto lo exige), área (obligatoria al aceptar solo para BUSINESS ACCOMPANYING SAC)
y subárea opcional; no aplicables a otros estudios.

- **Aceptar:** responsable, prioridad definitiva (baja/media/alta/urgente), tablero
  (desarrollo/administrativo/ambos); crea el trabajo. **SLA: «Pendiente de configuración»**:
  no se calcula fecha (se eliminaron `sla-config.ts` y las fórmulas heredadas).
- **Rechazar:** código interno + **motivo para el solicitante** (obligatorio, visible en el
  seguimiento) + **notas internas** opcionales (`reject_request_with_notes`, M9); sin responsable
  ni SLA. El seguimiento público solo muestra `public_rejection_reason`.

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

## Reglas y métricas nuevas — pendientes de integración/aplicación

Ver [contrato de métricas](business-metrics.md), migración `20261118000700`: nombre
público obligatorio, prioridades existentes sin cambio, tiempos derivados de eventos
del servidor y urgencias por nombre normalizado/estudio en America/Lima. No altera
solicitudes existentes ni el seguimiento público. No aplicada en remoto.
