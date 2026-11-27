# Refinamiento visual final de tarjetas — 27/11/2026

Base: main `7cf700390310fd0d6622806451de18034e03944e`. Intervención de Codex exclusivamente frontend, sin Claude ni modificaciones de Supabase/datos. Se utiliza la copia independiente escribible y se preserva intacta la carpeta original protegida, sin forzar su sincronización o eliminar archivos locales.

## Resultado

- Responsable: avatar circular de iniciales; nombre completo únicamente en tooltip y aria-label. Una instancia por usuario aunque figure en dos flujos históricos. Sin responsable se usa círculo vacío con tooltip/etiqueta accesible; no se inventa un nombre.
- Se elimina el checkbox y su contenedor de todas las tarjetas. Seleccionar en la barra del Kanban activa selección por clic, Enter o Espacio; aria-pressed y borde discreto indican estado. Cancelar y Escape limpian selección, devuelven modo normal y foco. Normal: clic/Enter abre el detalle; Espacio conserva arrastre por teclado donde está disponible. En selección se desactiva arrastre y asignación rápida para evitar acciones involuntarias.
- Barra masiva, contador, prioridad y archivado mantienen operate_board_tickets, sus IDs y clave por acción. Se bloquean controles mientras se procesa; error conserva selección. Cambiar filtros limpia IDs; cambiar vista/estado/tablero/rol cancela modo. Viewer no ve selección/operaciones masivas. El límite previo de 100 se conserva. La barra flotante conserva espacio adicional de scroll para alcanzar los últimos tickets.
- Antigüedad en tarjetas: Hoy / 1d / 2d / 15d; fecha ausente = guion con explicación. Tooltip y aria-label conservan Hoy / N días en tablero. Se reutilizan ticketAgeDays/ticketAgeLabel sin modificar sus cálculos: projects.created_at y días civiles de Lima. No hay tiempo por columna ni colores de alerta.
- Checklist: contador real (incluidos 0/0, 0/3, 1/3, 3/3 y 3/18 en las suites), barra de **30 px** proporcional. Icono de edición de 12 px, área de **44×44 px**, centrado con avatares. Título, Producto · Subproducto → Proyecto y prioridad conservan su jerarquía.
- Portafolio, INT/REQ, solicitante, área y nombres completos siguen en el detalle; relaciones, filtros y administración permanecen. No se cambia el resolver ni el cliente de operaciones.

## Autocrítica visual obligatoria

Se abrieron e inspeccionaron las **ocho capturas finales** de tarjetas activas: 320/390/834/1440 px × claro/oscuro, además del detalle y el modo selección móvil. La decisión no se basa solo en los tests. No se otorgan 10/10: se explican los límites de densidad/descubrimiento y el Kanban conserva su navegación horizontal por fases.

| Dimensión | Nota | Justificación |
|---|---|---|
| Jerarquía visual | 9/10 | Título primero, hasta dos líneas; producto/subproducto y proyecto secundarios; prioridad y edad en su fila. Sin checkbox ni metadatos que compitan. |
| Densidad de información | 9/10 | Solo iniciales, edad compacta y barra de 30 px con contador exacto; sin nombres o responsables repetidos. Altura de 171–192 px en los casos activos observados. |
| Consistencia de alineación | 9/10 | Prioridad/edad alineadas y pie con contador a la izquierda, avatares y edición a la derecha. Se corrigió la proximidad de los anillos con 10 px de separación y se verificó su contorno exterior. |
| Legibilidad | 8/10 | Texto principal y contador legibles en ambos temas; nombres y edad completos accesibles/tooltip. Iniciales y elipsis requieren tooltip o detalle para identificar textos completos, especialmente en móvil; es la reducción de información visible solicitada. |
| Responsive | 9/10 | Inspección de 320, 390, 834 y 1440 px en claro/oscuro sin choque de elementos dentro de la tarjeta; edición de 44 px. Kanban conserva desplazamiento horizontal intencionado por fases; no hay overflow del documento. |

Hallazgos corregidos antes de publicar: los anillos de dos avatares quedaban demasiado próximos aun sin cruzarse sus cajas; se separaron 10 px y la aserción considera outline + offset. La prueba de arrastre detectó que el CSS global de teclado eliminaba transitionend y dejaba la cancelación pendiente; se permite 1 ms únicamente al completar el drop con teclado o movimiento reducido. Se verificó cancelación con ratón y teclado en ambos modos. No se añadió decoración.

Los criterios solicitados se cumplen en las tarjetas revisadas: sin información ni avatares duplicados, sin cruces de controles/anillos, sin checkbox, sin nombres visibles junto al avatar, edad compacta, altura proporcionada y selección múltiple funcional en el entorno local. La barra flotante de acciones es la superposición temporal existente y cuenta con espacio de scroll; no se superponen sus controles entre sí ni con los avatares dentro de la tarjeta.

## Pruebas y procedencia

| Comprobación | Resultado | Alcance |
|---|---|---|
| Node | **215 PASS, 0 FAIL** | Incluye cálculo civil de Lima y contratos/reglas anteriores; cálculo sin cambios |
| UI completa | **168 PASS, 0 FAIL, 6 SKIP / 174** | Chromium/React reales, Auth/REST ficticios locales |
| Focalizadas | **14 PASS, 0 FAIL** | Incluidas en el total; repetidas tras ajustar anillos, sin sumarlas otra vez |
| TypeScript y build | **PASS** | npm run build = tsc + Vite, después del ajuste final |
| Captura antes | **8 escenarios, sin errores JS** | main@7cf7003 aislado, mismo escenario sintético; no acredita reglas nuevas |

La matriz comprueba ocho combinaciones tema/ancho × activos/completados/archivados; nombres largos/ausentes; dos responsables diferentes y usuario compartido por dos flujos; tooltip/aria-label; Hoy/1d/2d/15d; contadores y proporción real; control de 44 px, geometría con anillos y ausencia de overflow. El detalle conserva portafolio, proyecto, INT/REQ, solicitante y área.

Los casos de selección verifican clic y teclado, deselección, borde/aria-pressed, cancelación por botón/Escape, Escape del selector de prioridad sin salir del modo, acceso normal al detalle y arrastre/cancelación por teclado y ratón (movimiento normal y reducido). Las operaciones de prioridad y archivado se recorren con **superadmin, admin y developer ficticios**, con IDs exactos, claves distintas y cambios confirmados en el almacén local. Se prueba error, bloqueo durante envío, conservación de selección, filtros/vistas sin IDs ocultos y viewer sin selección pero con acceso de lectura.

Las demás regresiones cubren detalle, portafolios/RPC/filtros/gestión, fases/checklist, colores/contraste, formularios, clientes y adjuntos mediante simulación local. Los seis SKIP históricos siguen pendientes: cuatro cargas de ingresos (desktop/laptop/tablet/móvil) y dos presupuestos/carga diferida de vistas/Planner (desktop/móvil). No se repiten ni se atribuyen a esta entrega los 17 PASS SQL externos.

El arnés usa cacheDir Vite por puerto para aislar sesiones de captura/pruebas, y reloj real para comprobar DnD; no se simulan eventos de fin de animación para declarar PASS. Evidencia estructurada y logs: [resultados](results.json), [Node](node-results.txt), [UI](ui-regression-results.txt), [focalizadas](focused-results.txt), [TypeScript/build](typecheck-build-results.txt).

## Altura y capturas

Promedio de cuatro tarjetas activas en ambos temas, mismo escenario. Valores dependientes del contenido; rango final observado **171–192 px**.

| Ancho | Antes | Después |
|---|---|---|
| 320 px | 219.5 px | 186.75 px |
| 390 px | 197.5 px | 186.75 px |
| 834 px | 197.5 px | 186.75 px |
| 1440 px | 197.5 px | 186.75 px |

[Galería antes/después](GALLERY.md). Once capturas antes y trece después, con hashes en manifiestos; la galería incluye ambos temas/tamaños, completados/archivados, detalle y selección.

## Conservación y publicación

Cero SQL, migraciones o escrituras alojadas. Sin cambios en supabase/, contracts/, src/lib/, src/hooks/ o src/types/. Snapshot QA y lockfile idénticos byte a byte a la base. Se preservan datos reales/ficticios, portfolio_id, portfolio_initiatives y gestión administrativa. AGENTS.md, CLAUDE.md, requisitos oficiales y estado documentan la regla actual.

Los fixtures y capturas no son E2E autenticado contra producción. Proveedores reales, cuatro perfiles alojados, transferencias mediante reservas y eventos PostgreSQL Realtime conservan sus límites previos. La comprobación de publicación usará GET público sin autenticación para verificar versión, recursos y deployment. PR/merge normal a main autorizado; SHA final y versión quedan en la entrega y recibo local, evitando un SHA circular dentro del commit.
