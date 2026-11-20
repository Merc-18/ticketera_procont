# Prueba E2E del portal — 19/11/2026

> **Revisión documental 20/11/2026 · base `c857a727c8e7640bbce8daada940f973acbf013e` · clasificación: HISTÓRICO.**
> Fuente oficial: [PRODUCT_REQUIREMENTS](specs/PRODUCT_REQUIREMENTS.md); estado operativo: [PROJECT_STATUS](PROJECT_STATUS.md).
> Evidencia real anterior a M15: REQ26-002/003 conservados. No acredita creación, adjuntos ni recorrido autenticado posterior a M15. La bandeja se verificó a nivel de datos, no con sesión visual interna.

## Alcance del documento anterior

El contenido siguiente conserva sus fechas y evidencias originales. Los estados de activación o contratos sustituidos no se consideran vigentes; prevalecen las especificaciones enlazadas arriba.

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

## Cierre de la verificación (Claude Code, 19/11/2026)

Continuación de la ejecución de Codex detenida en `waiting_internal_admin`, sin
crear tickets nuevos ni repetir las comprobaciones del navegador ya registradas.

- **Tablero interno (nivel de datos, solo lectura en `xsxdpaiivklqeudgqoqf`).** La
  bandeja interna (`useRequests`: `requests` ordenadas por `created_at` desc, límite
  200; pestaña Pendientes = `status='pending'`) contiene REQ26-003 en la posición 1
  y REQ26-002 en la 2, ambos `pending`, dentro de los 200; la lectura del personal
  usa la política `member_read` (authenticated + rol interno). No se usó la
  contraseña superadmin: la comprobación visual con sesión interna queda como
  confirmación opcional y no cambia el resultado.
- **Duplicados.** Exactamente dos solicitudes con el prefijo `[QA-E2E-20261119-`.
- **Cierre de sesión.** Todas las sesiones de ambas identidades están revocadas en el
  servidor (Quipu 3/3, QuipuFac 2/2; ninguna activa): `client_logout` operó en cada
  salida del recorrido.
- **REQ26-001.** Sin cambios (`approved`, última modificación 18/11/2026).
- **Pruebas afectadas.** 80 pruebas Node (portal, ambos logins, adjuntos, consumidores)
  y 9 Python (arranque local y sonda), correctas; contrato TypeScript y `npm run build`
  correctos. Sin defectos que corregir.

## Pruebas y Git

49 pruebas Node de adaptadores/portal y cuatro de aislamiento del arranque,
correctas. `npm run build` correcto, incluidas las comprobaciones TypeScript.
Solo se revisó el circuito afectado, sin repetir auditorías SQL completas.

Evidencia depurada: [client-login-e2e-20261119.json](validation/client-login-e2e-20261119.json).
La integración a main se realizó tras cerrar esta comprobación,
conservando los commits de ambos agentes, los worktrees, cambios pendientes y el
archivo no versionado `1`. El mecanismo preparado usa fetch local sin force y
no cambia el checkout activo.
