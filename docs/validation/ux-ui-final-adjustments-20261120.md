# Ajustes finales UX/UI tras revisión visual

> **Estado histórico superado por una autorización posterior.** El usuario autorizó
> optimizar la carga y conservar las excepciones de Taste. Consulte el
> [cierre de rendimiento y galería final](ux-ui-performance-close-20261120.md).
> Se preservan las cifras y los pendientes de esta entrega como evidencia anterior.

Fecha: 20/11/2026. Base/HEAD: `6533b277e9022bf3bb9a64bff02d2e4cdbfc52d5`.
Rama existente: `feat/ticketera-ux-ui-four-areas`.
Worktree conservado: `/tmp/ticketera-ux-ui-20261120-worktree`.

Se continuó el rediseño existente de las cuatro áreas. La dirección visual aprobada,
paleta, tipografía, distribución general y operaciones se conservan. Este informe
actualiza el estado de entrega del [informe anterior](ux-ui-four-areas-20261120.md);
sus resultados y capturas permanecen como evidencia histórica.

## Cambios acotados

| Petición | Implementación | Evidencia actual |
|---|---|---|
| Una galería y una versión | Un solo `npm run build`, Vite Preview y transporte normal del frontend; servicios HTTP simulados localmente | [84 capturas](ux-ui-final-adjustments-20261120/README.md), todas **Versión 202611201512** |
| Seguimiento mínimo | `RequestTracking` presenta REQ y una sola etiqueta del estado actual; elimina la secuencia inferida y la promesa de reanudación automática | Caso de Chromium recorre los siete estados generales y rechaza una lista de etapas |
| Iconos coherentes | `ControlLabel` e `Icon` reutilizan glifos SVG Lucide para navegación, encabezados, vistas, exportación y controles | Capturas de las cuatro áreas; sin paquete nuevo |
| Orientación móvil | `ScrollHint` identifica scroll de Kanban, Tabla y Gantt; cuatro botones de vistas en una grilla ajustable | Capturas móviles y comprobación del ancho real del PNG |
| Filtros compactos | Dashboard agrupa rangos/tipos y coloca selects y exportaciones en dos columnas móviles | Se conservan todos los filtros y handlers |
| Mensaje de métricas | Sustituye texto de desarrollo por un estado de disponibilidad, manteniendo el error real y la ausencia de registros diferenciados | Tres capturas y un caso React con respuestas HTTP separadas |

### Seguimiento público

La referencia es [TICKET-012, Seguimiento público mínimo](../specs/PRODUCT_REQUIREMENTS.md#ticket-012).
La antigua línea mostraba cinco **estados generales**, no las ocho fases internas Development.
Sin embargo, infería pasos anteriores desde el estado actual y excedía la presentación de
dos datos solicitada por el usuario. Se retiró esa inferencia en la vista; `track_request_status`,
sus argumentos y el contrato de respuesta permanecen idénticos. El resultado muestra
`request_number` y la etiqueta de `GENERAL_STATUS[result.status]`, sin historial, UUID,
solicitante, producto ni información interna. Se conserva el indicador semántico del estado.

### Mensaje del Dashboard

`src/lib/metrics-adapter.ts:67–76` convierte `PGRST202` y `42883` en `pending_contract`.
Eso representa una RPC no publicada/no encontrada, no una consulta correcta sin filas.
El texto «Pendiente de integración con las métricas del servidor.» era la presentación
de ese caso técnico y podía parecer una tarea de desarrollo pendiente.

`MetricState` ahora muestra «Las métricas no están disponibles en este momento.» con
`role="status"`. El estado `error` conserva su mensaje existente y usa `role="alert"`.
`UrgencyStatsPanel` mantiene «Sin datos suficientes para …» cuando `ready` trae una lista
vacía. No se modifica el adaptador, no se convierte un error en cero ni se inventa evidencia.
Las tres situaciones se comprobaron con fixtures locales; **no se comprobó el estado remoto**.
Los promedios mostrados en capturas son datos ficticios preexistentes del arnés.

### Iconografía y responsive

`ControlLabel` traduce únicamente prefijos conocidos de etiquetas de interfaz a `Icon` y
texto legible. No transforma datos de tickets ni catálogos. Se aplica a navegación interna,
tabs del cliente, columnas, encabezados y controles de vistas, exportación e importación,
edición, archivo y asignación. El portal y los proveedores ya utilizaban SVG compartido.
Los colores y símbolos semánticos de prioridad, bloqueo y estado se conservan; esta
migración es progresiva, no una afirmación de que desapareció todo emoji del repositorio.

Las pistas de scroll son texto visible en móvil, no una operación nueva. El contenido de
tablas y timelines conserva desplazamiento horizontal dentro de su región. Los filtros
del Dashboard mantienen rangos, tipos, área, estudio, ambos CSV y actualización.
La revisión intermedia detectó que el ancho mínimo del nuevo grupo de iconos expandía
Kanban a 432 px en móvil. Se corrigió solo el layout de los cuatro botones; la galería final
comprueba ancho de documento y **ancho físico del PNG de 390 px**.

## Metodologías y excepciones conservadas

Se reutilizaron las copias extraídas y leídas de `design-taste-frontend` 2.5.1 y
`emil-design-eng`; no se sustituyeron ni se reiniciaron rondas. Taste respalda jerarquía,
superficies, tipografía, iconos consistentes y feedback de controles. Emil respalda feedback
inmediato, estados de formulario, foco visible, transiciones breves y reduced-motion.

No se añadieron animaciones: se mantienen hover de accesos de 150 ms/120 ms, pulsación
de 100 ms, entrada de modal de 200 ms y selección/foco instantáneos. Sin bucles decorativos
ni animación de listas o datos frecuentes. Chromium comprobó puntero, teclado y
`prefers-reduced-motion` con el build final.

El gate histórico permanece **OPEN 19 (rounds used up)**. No se ejecutó de nuevo ni se
editaron sus scripts o estado. [Matriz de las 19 instancias](ux-ui-final-adjustments-20261120/taste-findings.md):
10 incumplimientos formales, siete falsos positivos justificados y dos no determinados.
No se declaran 19 defectos reales ni se descartan todas las reglas como comerciales:
Taste incluye expresamente software/SaaS. La dirección visual aprobada y el alcance
acotado prevalecen sobre convertir los tres accesos operativos en una página de venta.
La clasificación es una revisión estática del resultado conservado, no un nuevo PASS.

## Pruebas después de los ajustes

| Comprobación | Resultado | Naturaleza / alcance |
|---|---|---|
| `node --test tests/*.test.mjs` | **171/171**, 0 omitidas | Suite Node existente; unitarias y contratos con simulación |
| `node --test tests/ui/portal-navigation.ui.test.mjs` | **31/31**, 0 omitidas | React/Chromium reales, servicios locales simulados; permisos, rutas, contratos, proveedores, adjuntos y Planner |
| `node --test tests/ui/ux-four-areas.ui.test.mjs` con `UI_UX_BUILD_DIR` | **20/20**, 0 omitidas | Build compilado; cuatro resoluciones, carga de ambos ingresos, seguimiento mínimo, tres estados de métricas, motion y arrastre cancelado |
| TypeScript de aplicación | **PASS** | `tsc --noEmit` y `tsc` de `npm run build` |
| Contrato TS estricto | **PASS** | `tests/client-access-contract.types.mts`, NodeNext/ES2022/DOM |
| Build final | **PASS**, advertencia de chunk >500 kB | Artefacto utilizado por las 84 capturas; no se cambió configuración para silenciarla |
| Integridad de galería | **84/84** | Una versión, cuatro resoluciones, PNG del ancho correcto, pie nativo incluido, SHA-256 de capturas/assets/fuentes |
| Conservación funcional estática | **PASS** | 18 handlers por nombre y 390 atributos funcionales originales preservados en 40 archivos modificados; comprobación delimitada, no prueba universal de equivalencia |
| Archivos protegidos | **128/128 idénticos** | Comparación de bytes respecto de base, cero nuevos archivos en las rutas protegidas |
| `git diff --check` | **PASS** | Sin errores de whitespace |
| Gate Taste | **OPEN histórico**, no repetido | No se afirma aprobación automática |
| JavaScript sin comprimir | **FAIL del presupuesto** | Detalle a continuación |

[Logs y JSON de evidencia](ux-ui-final-adjustments-20261120/README.md#evidencias-y-límites).
Los 171, 31 y 20 pertenecen a ejecuciones diferentes. Los antiguos 45 y ocho focalizados
se conservan como históricos; no se suman como casos nuevos.

La suite UI existente solo cambió expectativas de nombres visibles al retirar emoji de
etiquetas. No se sustituyeron las comprobaciones de permisos o contratos. La nueva suite
captura carga reteniendo la respuesta HTTP y liberándola después; no cambia los tiempos
reales de la aplicación. Los servicios se interceptan mediante el transporte de prueba
existente, desde Node. Se conserva la protección `import.meta.env.DEV` de la aplicación.
El navegador bloqueó las solicitudes no locales; el manifiesto registra cero solicitudes
externas. No se realizaron operaciones en Supabase, Quipu, QuipuFac ni Vercel.

## Presupuesto JavaScript actual

La referencia Taste `references/perf.md:17` admite hasta **900 KiB = 921.600 bytes** de
JavaScript analizado; 450 KiB ya es advertencia. Gzip no sustituye este presupuesto.

Se compiló por separado una extracción intacta de `6533b27` para medir la base con el
mismo Node/Vite, dependencias, URL local ficticia, login habilitado y mock del frontend
deshabilitado. Esa compilación de referencia no produjo capturas y no reemplazó el build
final de la galería. No se modificó ningún worktree existente para obtenerla.

| Medición equivalente actual | Bytes UTF-8 sin comprimir |
|---|---:|
| Base `6533b27`, modo production | 1.070.962 |
| Rediseño con ajustes, build de la galería | 1.074.248 |
| Diferencia total de la rama frente a base | **+3.286** (aprox. 0,31 %) |
| Exceso actual sobre 900 KiB | **152.648** |

Archivo final: `index-BLmphZwO.js`; SHA-256
`3661c8783df3a6f89c3f53eb30a5b41889bb7f8acbea323e73fac7fe2cf8a46a`.
El total es 1.049,07 KiB. La comparación histórica de **+2.244 bytes** correspondía a
otro estado y configuración de prueba; sigue preservada, pero no describe este build.
Se utiliza el tamaño real en disco, no se equiparan cifras redondeadas de consola,
caracteres de JavaScript, KiB y transferencia gzip. La compresión varía según nivel/herramienta.

No se añadieron dependencias. Los glifos y etiquetas compartidos, pistas y marcado nuevo
aportan código y sustituyen texto/markup anterior. El delta neto no permite atribuir bytes
exactos a cada componente: no se generó un mapa de módulos del bundle. Una posible
reducción mayor sigue siendo diferir el importador Planner/XLSX que se carga desde
`App → RequestInbox → PlannerImportModal`; cambiar esa estrategia excede estos ajustes
visuales y no se implementó. No se eliminaron animaciones o componentes arbitrariamente.

## Alcance protegido y estado de entrega

Sin diferencias en `supabase/`, `contracts/`, `scripts/`, `src/lib/`, `src/hooks/`,
`src/types/`, `src/dev/`, `package.json`, `package-lock.json`, `vite.config.ts` y
`vercel.json`. [Comparación por archivo](ux-ui-final-adjustments-20261120/protected-files.json).
M1–M15, Edge Functions, RPC, sesiones, permisos, contratos, dependencias y generación de
la versión siguen idénticos a base. Se preservan los handlers y argumentos existentes.
No hubo cambio de variables ni datos remotos. El checkout compartido y el archivo `1`
permanecen intactos.

Los ajustes visuales y las regresiones ejecutadas pasan. El presupuesto JavaScript sigue
fallando y Taste no tiene un PASS. Se respeta la condición «commit local únicamente si las
validaciones pasan»: **no se crea commit nuevo** con esas validaciones abiertas. El trabajo
y las evidencias quedan guardados en la misma rama/worktree, sin descartar archivos.
No hubo push, merge ni despliegue.

Pendientes: aceptación del presupuesto excedido o su optimización con alcance explícito;
revisión de las excepciones Taste conservadas; dispositivos físicos, lector de pantalla y
auditoría WCAG completa. Ningún resultado simulado se presenta como verificación remota.

Veredicto de los ajustes: **APTO PARA REVISIÓN VISUAL**, con presupuesto y gate abiertos.
