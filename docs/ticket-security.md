# Correcciones de seguridad de tickets — preparadas, no aplicadas

Base: Claude `779e4ee`, octava migración ya existente. Rama aislada
`codex/ticket-security-guards`; la rama anterior `codex/client-validator-backend`
se conserva. No se modifica el árbol compartido, `src`, ni las ocho migraciones.
No hay SQL remoto, cuentas/tickets reales, merge, push o despliegue.

Migración nueva:
[`20261118000500_ticket_security.sql`](../supabase/migrations/20261118000500_ticket_security.sql).

## Adjuntos: autorización y límites

El bucket y las políticas Storage de M8 se conservan. La función existente
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

Se mantiene el bucket privado y su límite de **10 MiB**; los tipos MIME deben
estar en la lista existente. La tabla de reservas tiene RLS y carece de lectura
directa para anon/authenticated/service_role. La reserva serializa por ticket:
máximo **cinco plazas**, incluyendo archivos previos de M8 y reservas pendientes.
La cuota no se libera por un fallo de red: reintentar con la misma clave y datos
reutiliza la plaza. Si la subida ya pudo completarse, revisar su resultado antes
de reenviarla; el adaptador no reintenta automáticamente.

### Integración con Claude, pendiente de revisión conjunta

**No se sustituyó** `src/lib/attachments.ts`. Su subida UUID/nombre antigua será
rechazada después de M9. Antes de activar M9 y probar archivos reales, integrar
en ese helper la RPC de reserva y usar exclusivamente la ruta devuelta:

```javascript
await uploadTicketAttachment(client, receipt.id, receipt.tracking_token, file, uploadKey)
```

Implementación lista para incorporar:
[`contracts/ticket-security-client.mjs`](../contracts/ticket-security-client.mjs).
No emplea claves privilegiadas. Mantiene rutas de dos componentes, compatibles
con el listado interno actual. El prefijo del nombre pasa de ordinal a capacidad
aleatoria; el frontend puede adaptar su etiqueta de visualización tras revisar
la integración. Los tipos MIME vacíos usan las extensiones ya admitidas por M8.
La lectura interna y enlaces firmados conservan las políticas existentes.
El uso de INSERT sin upsert sigue el contrato de
[Storage/RLS de Supabase](https://supabase.com/docs/guides/storage/security/access-control).

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

## Pruebas y siguiente paso

26 comprobaciones nuevas de seguridad en PostgreSQL 17.12, con stubs Auth/Storage
y datos sintéticos; cuatro del adaptador. Incluyen autorización correcta/incorrecta,
token de otro ticket, límites/caducidad, cuota concurrente, no sobrescritura,
separación de notas, publicación histórica autorizada y contrato de rechazo
compatible. El servidor aislado se detuvo. No se repitieron suites anteriores.
Evidencia: [`ticket-security-local.json`](validation/ticket-security-local.json).

El límite HTTP real de Storage, la subida desde navegador y el flujo completo no
se prueban con stubs: quedan para la prueba real tras integración y autorización.
Revisar conjuntamente el adaptador con Claude, autorizar por separado integración
y aplicación de M9, y entonces probar envío, adjunto, rechazo público/privado y
seguimiento. No usar ejecutores/bundles antiguos para revertir esta ampliación.
