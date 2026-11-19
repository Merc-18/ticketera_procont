# Prueba E2E del portal — 19/11/2026

Proyecto exclusivo: `ticketera-procont` (`xsxdpaiivklqeudgqoqf`). Rama
`integration/client-login-local`, base `2e39953`. Autorización expresa para dos
tickets ficticios y posterior fast-forward a main local. Sin push, despliegue ni
migraciones. La prueba usa el portal real de localhost, Chromium y los servicios
reales; no simula respuestas ni sustituye el formulario por SQL.

## Tickets conservados

| Identificador QA | REQ | UUID | Producto | Estudio | Estado inicial |
|---|---|---|---|---|---|
| QA-E2E-20261119-QUIPU | REQ26-002 | `a56a394f-34b5-42d6-a8e4-8404888c9dfc` | Quipu | BUSINESS ACCOMPANYING SAC | `pending` / público `received` |
| QA-E2E-20261119-QUIPUFAC | REQ26-003 | `855fc8a9-c014-428b-a01d-1bb823a0e29e` | Quipu_Fac | BUSINESS ACCOMPANYING SAC | `pending` / público `received` |

Ambos usan el estudio `15dd782b-ffff-4918-ae75-4f0b36540bd1`, tipo Mejora,
urgencia normal y ningún adjunto. Los títulos y descripciones corresponden a los
autorizados; los nombres declarados son «QA E2E Quipu» y «QA E2E QuipuFac».

## Verificación

- Antes de enviar: cero coincidencias para ambos identificadores. Nueva consulta
  antes de cada envío; un único POST de creación por ticket, dos en total.
- Se revisaron el formulario, las funciones de creación y sus triggers: sin llamadas
  externas de notificación detectadas. El contador de notificaciones permaneció en uno.
- Confirmación del formulario con REQ y UUID reales, y posterior lectura en Supabase
  de producto, estudio, tipo, urgencia, identidad y eventos iniciales.
- Cada identidad ve solo su ticket en Mis tickets y puede abrir su propio detalle.
  El detalle ajeno devuelve HTTP 404 en ambos sentidos; la sesión se conserva y
  permite volver a consultar el propio ticket.
- La búsqueda pública devuelve exactamente `request_number` y `status`, con
  `received`, sin título, descripción, solicitante ni datos internos.
- QuipuFac sigue excluyendo Quipu del selector. Identidades distintas aunque el
  RUC y el estudio sean comunes.
- La solicitud anterior quedó idéntica: se comparó una huella de todas las filas
  ajenas a estos dos identificadores. No se aprobó, modificó ni eliminó ningún ticket.

La ubicación interna correspondiente al estado inicial es **Requests → Pendientes**.
El Kanban contiene proyectos tras aprobar una solicitud; estos dos tickets QA
se conservan pendientes, con `project_id:null`, sin inventar clasificación ni aprobación.
La verificación visual de la bandeja interna está pendiente de la credencial interna.

## Pruebas y Git

49 pruebas Node de adaptadores/portal y cuatro de aislamiento del arranque,
correctas. `npm run build` correcto, incluidas las comprobaciones TypeScript.
Solo se revisó el circuito afectado, sin repetir auditorías SQL completas.

Evidencia depurada: [client-login-e2e-20261119.json](validation/client-login-e2e-20261119.json).
La integración a main local se completará al cerrar la comprobación interna,
conservando los commits de ambos agentes, los worktrees, cambios pendientes y el
archivo no versionado `1`. El mecanismo preparado usa fetch local sin force y
no cambia el checkout activo.
