# Seguimiento público integrado en el portal (23/11/2026)

**Veredicto: APROBADO CON OBSERVACIONES.** Se publica junto con el modo oscuro ([`../dark-mode-20261123/`](../dark-mode-20261123/REPORT.md), commit `f6b6062`) en una sola actualización de `main`. Decisión registrada como D-039.

## 1. Qué cambió

| Antes | Ahora |
|---|---|
| La tarjeta «Rastrear Solicitud» de `/portal` era un botón que navegaba a `/tracking` (pantalla «Rastrear Solicitud» con su propio formulario) | La tarjeta **contiene el formulario**: icono, título, explicación, campo «Número de solicitud» y «Buscar». El resultado aparece dentro de la tarjeta, **sin salir de `/portal`** |
| `/cliente` repetía un formulario «Consultar estado de un ticket» bajo la selección Quipu/QuipuFac | Se retiró para no duplicar el formulario. Queda un enlace: «Rastréala en el portal con su número REQ» → `/portal#seguimiento` |
| `/tracking` era el destino de la consulta | `/tracking` **redirige** a `/portal#seguimiento` con el foco en el campo, así que los enlaces antiguos y los marcadores no se rompen |
| `RequestTracking.tsx` y `tracking-handoff.ts` | Retirados: no tenían otros consumidores |

El portal sigue teniendo **exactamente dos tarjetas**: Nueva Solicitud y Rastrear Solicitud.

## 2. Contrato y privacidad (sin backend)

- **Mismo contrato público, sin cambios:** `operations.trackRequest()` → RPC `track_request_status({ p_request_number })`. Ya valida el formato `REQ##-###` y **reduce la respuesta a `{ request_number, status }`**. No se tocaron SQL, RPC, RLS, Edge Functions ni permisos.
- **Lo que se muestra:** únicamente el número REQ y el estado general (insignia).
- **Lo que no se muestra:** solicitante, RUC, usuario, empresa, producto, subproyecto, título, descripción, prioridad, urgencia, adjuntos, comentarios, historial ni responsables. La prueba recorre el texto de la tarjeta buscando cada uno de esos datos.
- El detalle completo sigue en **Mis tickets** después del ingreso. La prueba con fixtures comprueba producto, solicitante, subproyecto, prioridad solicitada y descripción.

## 3. Estados de interacción

| Estado | Comportamiento |
|---|---|
| Inicial | Campo vacío con ayuda «Ejemplo: REQ26-001. Puedes escribir solo el número.»; sin consultas |
| Campo vacío | «Escribe el número de solicitud.» bajo el campo, `aria-invalid`, foco en el campo; sin consulta |
| Formato inválido | «Revisa el formato: REQ26-001 o solo el número…»; sin consulta. Solo dígitos → prefijo del año (`9999` → `REQ26-9999`) |
| Cargando | El botón pasa a «Buscando…» deshabilitado (sin envíos duplicados), el formulario se marca `aria-busy` y la región viva anuncia «Buscando REQ…» |
| Encontrado | Número y estado en la región viva (`role=status`) |
| No encontrado | «No encontramos la solicitud REQ…. Verifica el número…» |
| Error de servicio | `role=alert` con el mensaje y el botón **Reintentar** |
| Consulta sucesiva | Una búsqueda nueva reemplaza el resultado y descarta las respuestas tardías de la anterior |
| Teclado | Enter envía; nunca se consulta mientras se escribe |

## 4. Skills

- **Taste:**
  - La tarjeta ahora contiene un formulario, así que no es un enlace y no se eleva al pasar el puntero (`cards.md`: la tarjeta sin enlace no sube). La primera tarjeta conserva su elevación de 2 px.
  - Etiqueta visible encima del campo, error bajo el campo y botón activo hasta pulsarlo (formularios de `system.md`).
  - Un solo relleno de acción en la vista.
  - Se mantiene la composición aprobada del portal, sin reglas de landing nuevas. El gate sigue en OPEN 14, sin reiniciar.
- **Emil:**
  - El resultado es respuesta a una acción del usuario, así que entra con un fundido de opacidad de 150 ms con la curva propia.
  - Si la búsqueda se hace con teclado (Enter), no hay animación.
  - Con movimiento reducido se conserva solo la opacidad.
  - No hay animaciones decorativas.
- **Temas:** todo usa los tokens existentes (`--p-*` y escalas por rol); no hay un tercer sistema de colores. En claro, las únicas diferencias de color frente al portal publicado son las del nuevo campo (`#FFFFFF`, borde `#64748B`, etiqueta `#374151`), todas tokens aprobados. En oscuro, el campo usa navy elevado, el borde `#7083A3` (≥ 4,1:1) y el resultado el tinte `#12224A` con número `#93C5FD`.

## 5. Rendimiento

| Recorrido (KiB de script) | Publicado | Solo modo oscuro | **Modo oscuro + seguimiento** | Veredicto |
|---|---|---|---|---|
| Portal | 393,1 | 394,8 | **396,7** | PASS |
| Dashboard | 429,6 | 431,2 | **433,4** | PASS |
| Bandeja | 445,9 | 447,6 | **449,8** | PASS |
| Cliente autenticado | 466,6 | 468,3 | 468,8 | WARN (como antes) |
| Kanban | 567,9 | 569,6 | 572,5 | WARN (como antes) |
| Importador | 782,6 | 784,2 | 786,5 | WARN (como antes; < 900) |

En la primera versión del formulario, la bandeja llegó a 451,0 KiB y pasó a WARN. Para recuperar el PASS sin quitar funciones:

- La consulta y el resultado se movieron a un chunk diferido de 1,9 KB (`TrackingOutcome`), que se precarga al acercarse a la tarjeta.
- El selector de tablero (`BoardSelector`) ahora viaja con la pestaña Boards.

Fuente: [`data/browser-bundle.json`](data/browser-bundle.json). Ningún veredicto empeora frente a lo publicado.

## 6. Pruebas

| Suite | Resultado |
|---|---|
| TypeScript y build | PASS |
| Unitarias Node | **173/173** |
| UI (`tests/ui/*.ui.test.mjs`), incluidas las 12 nuevas de seguimiento y las 8 del tema | **81/81** (6 omitidas: solo corren con build y se cubren en la fila siguiente) |
| UX sobre build de producción | **36/36** |
| Tokens desde el CSS compilado | 56/56 pares |
| Re-auditoría claro / oscuro | 120 + 120 pantallas (más 6 + 6 a 320 px), 0 fallos, 0 errores de página, 0 peticiones externas |

La re-auditoría da en ambos temas 0 textos bajo 4,5:1, 0 campos sin etiqueta, 0 saltos de encabezado, 0 desbordamiento (incluido `/portal#seguimiento` a 320 px), 0 emoji, 0 violeta y h1 en 120/120.

[`tests/ui/portal-tracking.ui.test.mjs`](../../../tests/ui/portal-tracking.ui.test.mjs) cubre, en claro y oscuro:

- composición de dos tarjetas;
- estado inicial;
- campo vacío y formato inválido sin consultas;
- sin consultas al escribir;
- encontrado con el botón;
- sucesiva con Enter;
- solo REQ y estado;
- sin navegación;
- cargando, error y reintento;
- `/tracking` → `/portal#seguimiento` con foco.

Además comprueba `/cliente` sin el formulario duplicado y Mis tickets con el detalle completo.

Las suites existentes se adaptaron al nuevo comportamiento:

- `portal-navigation`: el test 11 consulta en el portal y verifica que no hay navegación; `/tracking` redirige.
- `ux-four-areas`: el seguimiento se hace desde `/portal`.

No se debilitó ninguna aserción de privacidad.

## 7. Evidencia

- [`screenshots/light/`](screenshots/light/) y [`screenshots/dark/`](screenshots/dark/): 23 + 23 capturas de las vistas modificadas (portal, selección de `/cliente`, resultado encontrado, sin resultado) en 1920, 1440, 768, 390, 360 y 320 px.
- [`screenshots-manifest.json`](screenshots-manifest.json): área, pantalla, tema, resolución, versión, fecha y sha256 de cada captura.
- Resultados completos de la re-auditoría y logs en [`data/`](data/).
- Las 242 capturas del modo oscuro siguen en `../dark-mode-20261123/`.
- [`SHA256SUMS`](SHA256SUMS).

## 8. Observaciones

1. Las pruebas se hicieron en Chromium emulado, con datos ficticios.
2. El gate Taste sigue en OPEN 14 y los tres WARN de JavaScript ya existían.
3. `/tracking` redirige en el cliente (SPA). Vercel sigue sirviendo `index.html` para esa ruta (rewrite existente en `vercel.json`, sin cambios).
