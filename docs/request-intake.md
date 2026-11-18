# Formulario del cliente y validación interna — activos

**Corrección preparada en rama aislada, no integrada ni aplicada:** M9 refuerza
la subida con una reserva autorizada por token de seguimiento y separa motivo
público de notas internas. La pendiente M9 incorpora los límites definitivos de
4 archivos y 2.500.000 bytes totales, verificando bytes reales en Storage. Requiere
revisar la compresión de imágenes y el adaptador de adjuntos con Claude
antes de activarla. No modifica los ocho archivos anteriores ni las reglas SLA.
Véase [seguridad de tickets](ticket-security.md). El resto describe M8 activa.

18/11/2026. Migración [`20261118000400_request_intake.sql`](../supabase/migrations/20261118000400_request_intake.sql)
aplicada con Supabase CLI (historial 8/8). Las siete anteriores no cambian.
Evidencia: [local](validation/request-intake-local.json) · [remota](validation/request-intake-remote.json).

## Cliente (`/request`)

Nombre · Estudio · Proyecto / Sistema · Tipo de solicitud (uno) · Título · Descripción ·
adjuntos · «Solicito atención urgente».
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

**Integración con el backend de Codex (rama `codex/ticket-security-guards`, 9.ª migración
pendiente):** la preparación ocurre antes de cualquier llamada al servidor; el formulario solo
envía cuando `prepared.ok`. `attachmentManifest(items)` entrega nombre, tamaño y tipo finales
para un contrato de reserva previo a la subida; `uploadRequestAttachments` recibe los archivos
ya preparados. Hoy se sube tras crear la solicitud con la política de Storage de la migración 8
(que todavía admite 5 archivos y 10 MB por archivo); el límite 4 / 2,5 MB lo aplica el frontend
hasta que el backend lo haga cumplir.

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
