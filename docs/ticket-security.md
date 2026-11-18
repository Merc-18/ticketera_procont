# Correcciones de seguridad de tickets — preparadas, no aplicadas

**Integración (Claude, rama `integration/attachments-security`):** fusionada sin conflictos
sobre `c85b624`; el frontend usa este contrato (compresión → reserva por lote con token →
subida de rutas autorizadas) y la separación de rechazo. Las 46 comprobaciones de esta rama
(26 + 20) pasan sobre la cadena completa de 9 migraciones. Sigue **sin aplicar** en Supabase.

Base: Claude `779e4ee`, octava migración ya existente. Rama aislada
`codex/ticket-security-guards`; la rama anterior `codex/client-validator-backend`
se conserva. No se modifica el árbol compartido, `src`, ni las ocho migraciones.
No hay SQL remoto, cuentas/tickets reales, merge, push o despliegue.

Migración nueva:
[`20261118000500_ticket_security.sql`](../supabase/migrations/20261118000500_ticket_security.sql).

## Adjuntos: autorización y límites

Se conservan el bucket privado y las políticas RLS de M8. Su límite individual
se reduce a 2.500.000 bytes y se añade una guarda propia al confirmar escrituras. La función existente
`request_attachment_allowed(text)` ahora exige una reserva exacta emitida por
el servidor, además de solicitud pendiente y ventana original de 30 minutos.
El UUID del ticket, un nombre parecido o un token de otro ticket no bastan.

La RPC nueva verifica el token privado de seguimiento **antes** de reservar:

```text
reserve_request_attachment(
  p_request_id uuid, p_tracking_token uuid, p_upload_key uuid,
  p_file_name text, p_size_bytes bigint, p_mime_type text
) -> {bucket, path, mime_type, size_bytes, expires_at}
```

`p_upload_key` es un UUID que el cliente genera una vez por archivo y conserva
para reintentos. No es la autorización de Storage: la ruta incluye otra capacidad
aleatoria generada por el servidor. El token de seguimiento nunca aparece en
la ruta. La capacidad autoriza únicamente esa ruta, durante la ventana original;
se trata como un secreto temporal de subida. No se permite sobrescribir.

Los límites definitivos son **cuatro archivos y 2.500.000 bytes combinados**,
exactamente en bytes decimales, no 2,5 MiB. Incluyen reservas pendientes y archivos
anteriores de M8; estos últimos no se modifican ni eliminan. Si falta el tamaño
real de un archivo anterior o ya no queda presupuesto, se rechazan nuevas reservas.

La reserva toma un bloqueo por ticket y suma tanto plazas como bytes. La clave
estable y los mismos datos reutilizan la reserva, sin consumir otra cuota. Esta
no se libera automáticamente después de un fallo de red. La tabla privada mantiene
RLS y carece de acceso directo para anon/authenticated/service_role.

**La declaración del navegador no basta:** el trigger diferido propio
`procont_attachment_final_size` comprueba al COMMIT los metadatos reales de Storage
(`metadata.size` y `metadata.mimetype`, nunca `user_metadata`). Exige coincidencia
con la reserva y vuelve a verificar el total y la cantidad bajo el mismo bloqueo
por ticket. Incluye las escrituras privilegiadas finales de Storage, sin cambiar
sus triggers administrados. Una subida mayor o menor que lo reservado, sin tamaño
real, fuera de plazo o con otro MIME no se confirma.

El trigger es diferido porque Storage prueba INSERT en una transacción/savepoint
que revierte antes de transferir el archivo. Esa prueba puede no tener tamaño real;
la escritura final sí lo debe tener. Las reservas y la guarda final conservan el
plazo de 30 minutos desde el ticket, sin renovarlo en reintentos. El bucket aplica
además un máximo individual de 2.500.000 bytes y la lista MIME de M8.
Fuentes del flujo de Storage:
[prueba de permisos](https://github.com/supabase/storage/blob/master/src/storage/database/pg.ts),
[metadatos de la escritura final](https://github.com/supabase/storage/blob/master/src/storage/uploader.ts).

### Integración con Claude, pendiente de revisión conjunta

**No se sustituyó** `src/lib/attachments.ts` ni ninguna pantalla de Claude. El
helper antiguo UUID/nombre será rechazado después de M9: frontend y migración
se deben activar juntos, después de revisión y autorización de integración.

Contrato recomendado, con reserva atómica de todo el lote:

```text
reserve_request_attachments(
  p_request_id uuid,
  p_tracking_token uuid,
  p_files [{upload_key: uuid, file_name: string, size_bytes: integer, mime_type: string}]
) -> [{bucket, path, mime_type, size_bytes, expires_at}]
```

- Array de 1 a 4 archivos, claves distintas, suma final <= 2500000. Cero archivos:
  omitir la llamada. Si un elemento falla, no queda ninguna reserva parcial nueva.
- Mismo orden de entrada/salida. Usar siempre la ruta devuelta, nunca construirla
  desde el UUID. La RPC individual anterior sigue disponible con la misma firma.
- Reservar todo el lote antes de comenzar a subir; luego se pueden subir en paralelo
  con `upsert: false`. Los controles del servidor siguen aplicándose en concurrencia.

Secuencia exacta para la compresión que implementará Claude:

1. Seleccionar como máximo cuatro archivos. Comprimir **solo imágenes** a un formato
   ya admitido (por ejemplo image/jpeg o image/webp), actualizando nombre y MIME.
2. Conservar los documentos originales (PDF/Office/texto y otros admitidos): no
   recomprimirlos, convertirlos ni truncarlos. El adaptador los envía intactos.
3. Calcular `File.size`/`Blob.size` de los archivos **finales**. Si la suma excede
   2500000, no reservar ni subir; pedir que se reduzca la selección o las imágenes.
4. Generar un upload_key por archivo final y conservarlo junto con ese File/Blob
   durante todos los reintentos. No volver a comprimir después de reservar.
5. Llamar a la reserva por lote y subir cada archivo final a su ruta correspondiente.
   Tanto tamaño como MIME deben coincidir; no enviar tamaños de los originales.

Adaptador preparado fuera del frontend:
[`contracts/ticket-security-client.mjs`](../contracts/ticket-security-client.mjs).

```javascript
const grants = await reserveTicketAttachments(client, receipt.id, receipt.tracking_token,
  finalFiles, stableUploadKeys)
await Promise.all(grants.map((grant, i) =>
  uploadReservedTicketAttachment(client, grant, finalFiles[i])))
```

No emplea claves privilegiadas ni transforma documentos. Las capacidades mantienen
rutas de dos componentes y la lectura interna/enlaces firmados existentes. Claude
puede adaptar la etiqueta de archivo, cuyo prefijo deja de ser un ordinal. Un error
de subida no provoca reintentos automáticos ni una nueva clave. Si la respuesta
se perdió, revisar si el objeto quedó confirmado antes de reenviarlo.

## Rechazo: mensaje público separado

- `requests.public_rejection_reason`: mensaje destinado explícitamente al cliente.
- `requests.rejection_reason`: motivo/observaciones internas o históricas. Ya no
  se serializa directamente en seguimiento.
- `track_request(text,uuid)` conserva la firma y las cinco claves del frontend:
  `request_number`, `status`, `created_at`, `title`, `rejection_reason`. Esta última
  **se obtiene del campo público**; no hay notas, códigos, responsables, SLA,
  áreas, RUC ni campos administrativos añadidos.

`reject_request(uuid,text)` mantiene la pantalla actual: su argumento `p_reason`
se considera el mensaje público. Lo conserva también como copia en el campo
antiguo por compatibilidad con su CHECK y la vista interna existente.

Para registrar observaciones separadas, disponible para admin/superadmin activos:

```text
reject_request_with_notes(p_request_id uuid, p_public_reason text, p_internal_notes text)
```

El motivo público es obligatorio; las notas pueden ser NULL. El campo anterior
guarda las notas cuando se suministran. Las reglas de clasificación, permisos y
decisión de M8 siguen vigentes. No se añadieron inputs React: el contrato permite
que Claude los incorpore después de la revisión.

Los rechazos históricos **no se copian automáticamente** a un campo público.
Mantienen íntegro su texto original y muestran un mensaje genérico hasta que
un administrador revise y publique el motivo apropiado:

```text
publish_rejection_reason(p_request_id uuid, p_public_reason text)
```

Esta RPC solo modifica el mensaje público de un rechazo existente, conserva las
notas originales y registra una entrada de auditoría interna. Anon/viewer no
pueden publicarlo. Los mensajes de publicación se redactan como texto destinado
al solicitante; no se reutiliza automáticamente un campo administrativo.

## SLA: documentado, sin cambios

La RPC previa `approve_request` todavía exige `sla_formal_days` entre 1 y 3650
si se proporciona `sla_target_date`, y elimina ese SLA cuando la prioridad es
`low`. El frontend actual envía ambos valores como NULL. Esta rama **no altera**
esa RPC, los plazos ni las fórmulas. Las reglas oficiales se definirán después;
las restricciones anteriores no quedan adoptadas como política de Procont.

## Integración preparada, sin merge

Se comparó con el HEAD actual de Claude `779e4ee`, sin cambiar sus referencias
ni su árbol. No se detectaron rutas en conflicto con sus cambios locales. La
rama conserva el commit anterior `8385620` y añade este ajuste; no se reescribió
historial. Las ocho migraciones y todo `src` permanecen idénticos a la base.
La comparación es local por base/rutas; no se ejecutó una integración real.

El backend y el contrato están listos para revisión conjunta. Claude debe conectar
su compresión y el nuevo helper de reserva/subida. Después se autorizarán por
separado la integración y aplicación de M9: el frontend anterior no debe ponerse
en producción junto con esta migración sin adaptar la subida. Si Claude añade
otros commits antes de integrar, revisar de nuevo solo las rutas coincidentes.

## Pruebas y siguiente paso

Evidencia histórica del commit `8385620`: 26 comprobaciones SQL y cuatro del
adaptador, con los límites anteriores. Se conserva en
[`ticket-security-local.json`](validation/ticket-security-local.json); **no se
repitió esa suite**. Sus fixtures se ajustaron para futura compatibilidad, sin
presentarlas como revalidadas con los límites nuevos.

Validación vigente: **20 pruebas nuevas** en PostgreSQL 17.12, incluyendo tamaños
reales al COMMIT, escrituras privilegiadas, concurrencia, límite exacto y exceso
de un byte, rollback de lote, archivos anteriores y plazo; **cinco pruebas nuevas**
del contrato, documentos intactos y tamaños después de comprimir. Solo se usaron
stubs Auth/Storage y datos sintéticos; el servidor temporal está detenido.
Evidencia: [`ticket-attachment-limits-local.json`](validation/ticket-attachment-limits-local.json).

El límite HTTP real de Storage, la subida desde navegador y el flujo completo no
se prueban con stubs: quedan para la prueba real tras integración y autorización.
Revisar conjuntamente el adaptador con Claude, autorizar por separado integración
y aplicación de M9, y entonces probar envío, adjunto, rechazo público/privado y
seguimiento. No usar ejecutores/bundles antiguos para revertir esta ampliación.
