# Cierre local UX/UI: carga diferida y excepciones Taste

Revisión: 20/11/2026. Base: `6533b277e9022bf3bb9a64bff02d2e4cdbfc52d5`.
Rama existente: `feat/ticketera-ux-ui-four-areas`.
Worktree: `/tmp/ticketera-ux-ui-20261120-worktree`.
Versión del build final: **Versión 202611201553**.

**Gate histórico: OPEN 19 (rounds used up)**. No se repitió ni se simuló un PASS.
El usuario autorizó conservar el diseño aprobado y sus excepciones metodológicas.
El **presupuesto de JavaScript inicial sí cumple**, medido en Chromium y contrastado con
el script original de rendimiento de Taste, independiente del gate de composición.

## Optimización realizada

Se modificó únicamente la estrategia de carga del frontend, sin rehacer las cuatro áreas:

- `App.tsx`: `React.lazy` carga Dashboard, Kanban, bandeja, usuarios, carga de trabajo,
  papelera y catálogos al abrir su vista. No cambian rutas, condiciones de rol ni props.
- `RequestInbox.tsx`: Planner es otro límite diferido, activado por el botón existente.
  El import estático de XLSX permanece dentro de ese módulo diferido, por lo que XLSX
  se descarga al necesitar el importador, sin reescribir su parser ni el proceso de envío.
- `Suspense` conserva cabeceras y navegación mientras llega el contenido. El importador
  pendiente tiene feedback, cancelación, foco contenido, Escape y retorno al botón.
  Los fallos de importación de chunks siguen llegando al `ErrorBoundary` existente,
  que permite recargar. No se introduce un sistema de reintentos de negocio nuevo.

No se añadieron dependencias, reglas de chunks manuales, prefetch global ni cambios de
framework. No se tocaron hooks, sesiones, contratos o llamadas RPC. Las animaciones y
sus tiempos, fuentes, paleta, iconos y disposición aprobada permanecen conservados.
La comparación con los hashes de fuentes de la galería anterior confirma que, en esta
etapa de optimización, solo cambiaron `src/App.tsx` y `RequestInbox.tsx` dentro de `src/`;
el resto permanece idéntico. [Evidencia](ux-ui-performance-close-20261120/optimization-scope.json).

| Before | After | Why |
|---|---|---|
| El portal descarga las vistas internas y XLSX | Vistas internas al abrir su sección y Planner al pulsar Importar Planner | Taste: importar solo módulos montados; reducir trabajo inicial sin eliminar funciones |
| No existe espera de red para módulos separados | Fallback breve y accesible, sin ocultar navegación | Emil: feedback inmediato y acciones disponibles durante la carga |
| Un límite inicial amplio ocultaba subtabs de Equipo al suspender | Límites por contenido, con subtabs fuera del fallback | Conservar orientación y controles; defecto detectado por la suite y corregido antes del cierre |

## Medición reproducible y significado del presupuesto

Taste `references/perf.md:17` fija advertencia por encima de 450 KiB y error por encima
de **900 KiB = 921.600 bytes**. `scripts/perf.mjs:274–275` suma las peticiones de tipo
`Script` realmente cargadas: `decoded || encoded`, con `Network.dataReceived.dataLength`
para bytes decodificados, después de cargar y recorrer la página. No mide solamente el
archivo más grande, gzip ni la suma de todos los archivos emitidos sin descargarlos.

El [probe de Chromium](../../tests/ui/bundle-probe.mjs) replica esa fórmula y el redondeo
del script, con caché deshabilitada. Los tests comprueban además que los chunks internos
y Planner no se descargan en el portal y que Planner aparece realmente después del clic.
La importación diferida se verifica en red; no se asume correcta solo por ver varios archivos.

El script original de Taste, **sin modificar**, se ejecutó contra Vite Preview antes y
después: 1440 y 390 px, tres cargas para la mediana y recorrido hasta el final. La versión
anterior se sirvió desde su build archivado; no se recompiló ni se modificó su código.
Se preservan [logs y JSON antes/después](ux-ui-performance-close-20261120/README.md#evidencias).

| Magnitud | Antes, Versión 202611201512 | Después, Versión 202611201553 |
|---|---:|---:|
| JavaScript inicial realmente descargado | 1.074.248 bytes | **443.011 bytes** |
| JS parsed del script original de Taste | 1.049,1 KiB: **FAIL** | **432,6 KiB: PASS**, en ambos anchos |
| Cantidad de archivos JS emitidos | 1 | 14 |
| Chunks diferidos emitidos, fuera de la carga inicial | 0 | **635.586 bytes** |
| Total JavaScript emitido | 1.074.248 bytes | **1.078.597 bytes** |

Reducción inicial: **631.237 bytes, 58,76 %**. El total emitido aumenta **4.349 bytes** por
separación de módulos, referencias de carga y fallback. Se comunica ese aumento: el código
sigue existiendo, se descarga cuando hace falta. No se presenta como reducción del total.

| Recorrido medido en Chromium | JS acumulado cargado | Resultado de JS parsed |
|---|---:|---|
| Portal inicial, tras scroll | 443.011 bytes | PASS |
| Portal → ingreso Quipu → Nuevo ticket | 443.011 bytes | PASS |
| Ingreso interno → Dashboard | 464.528 bytes | WARN (>450 KiB), por debajo de error |
| Dashboard → bandeja, antes de importar | 501.403 bytes | WARN, por debajo de error |
| Dashboard → bandeja → Planner abierto y Excel leído | 845.328 bytes | WARN, por debajo de error |
| Dashboard → Kanban, incluido desplazamiento de columnas | 672.572 bytes | WARN, por debajo de error |

Los mismos valores se observaron en escritorio y móvil. La medición interna comienza
con una carga nueva y conserva lo ya descargado durante ese recorrido; no resta módulos
anteriores para aparentar un tamaño menor. Los escenarios de bandeja y tablero se miden
en documentos independientes. No se afirma que recorrer todas las secciones durante una
misma sesión mantenga eternamente el acumulado por debajo de 900 KiB. El total emitido
continúa superando ese valor, pero no es la métrica de carga inicial solicitada.

Archivo inicial: `index-BgWXSNJH.js`, SHA-256
`771c7fd352d3e221d4d1cf1e5dd49e4395aa362af7b608592febab6b31241def`.
[Detalle de assets](ux-ui-performance-close-20261120/bundle-comparison.json) y
[mediciones de red](ux-ui-performance-close-20261120/browser-bundle.json).
No se detectaron copias múltiples de React, ReactDOM o XLSX en la inspección de
dependencias resueltas; `npm ls` muestra las referencias compartidas como `deduped`.
Recharts está instalado, pero no se encontraron imports en `src`; no se elimina un
paquete ni se cambia el lockfile sin necesidad. No se modificaron las animaciones para
cumplir el presupuesto.

### Cómo repetir

Desde este worktree, con las dependencias existentes y Chromium instalado, elegir un
directorio **nuevo**, sin assets de builds anteriores:

```bash
CHROMIUM_EXECUTABLE=/home/procont/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
UI_UX_BUILD_DIR=/tmp/ticketera-ux-repro-nuevo/build \
UI_UX_EVIDENCE=/tmp/ticketera-ux-repro-nuevo/evidence \
UI_UX_SCREENSHOTS=/tmp/ticketera-ux-repro-nuevo/screenshots \
node --test tests/ui/ux-four-areas.ui.test.mjs
```

El arnés compila una vez, sirve ese build, intercepta servicios en localhost, bloquea red
externa y guarda bytes, nombres y hashes. Las variables ficticias son solo del proceso de
prueba; no modifica `.env` ni Vercel. La versión será la de la nueva compilación, no la
de esta evidencia histórica. Los puertos y hashes también pueden variar.

Para contrastar con el script original, servir el build con Vite Preview y ejecutar:

```bash
CHROME_PATH=/ruta/local/a/chrome \
node /ruta/a/design-taste-frontend/scripts/perf.mjs http://127.0.0.1:PUERTO/portal \
  --profile /tmp/ticketera-perf-perfil-nuevo --json /tmp/ticketera-perf-nuevo.json
```

No ejecutar `gate.mjs` ni reiniciar sus rondas para repetir estas mediciones de rendimiento.

## Excepciones metodológicas

La [matriz final de los 19 hallazgos](ux-ui-final-adjustments-20261120/taste-findings.md#clasificación-operativa-final-autorizada)
documenta identificador, regla, componente, motivo, aplicabilidad, impacto y evidencia.
Balance: **12 excepciones justificadas, siete falsos positivos y cero defectos UX reales
demostrados pendientes dentro de ese conjunto**. Los casos antes no determinados se
conservan como excepciones autorizadas, no se convierten en falsos positivos sin prueba.

Las excepciones mantienen accesos visibles, cabecera compacta, tres títulos de tarjeta,
root de React, pie de metadatos y ausencia de escenas decorativas. Taste incluye SaaS:
no se descartan todas sus reglas como comerciales. Emil conserva feedback con propósito,
ausencia de animación frecuente o de teclado y reduced-motion. El gate sigue OPEN 19;
**el PASS de rendimiento no es un PASS de ese gate**. Su estado se conserva por hash.

## Validación final y fallos conservados

| Prueba | Resultado final | Evidencia / naturaleza |
|---|---|---|
| Node existente | **171/171**, cero omitidas | [Log](ux-ui-performance-close-20261120/node.log); unitarias y contratos con simulación |
| UI existente | **31/31**, cero omitidas | [Log](ux-ui-performance-close-20261120/chromium-existing.log); React y Chromium, servicios simulados |
| UI del build compilado | **22/22**, cero omitidas | [Log](ux-ui-performance-close-20261120/chromium-build.log); responsive, accesibilidad básica, motion, flujo cliente y carga diferida |
| TypeScript de aplicación | **PASS** | `tsc --noEmit` y `tsc` del build |
| Contrato TS estricto | **PASS** | `tests/client-access-contract.types.mts`, NodeNext/ES2022/DOM |
| Build | **PASS** | [Log](ux-ui-performance-close-20261120/build.log); ninguna advertencia de chunk >500 kB |
| Script original Taste perf, después | **0 FAIL / 0 WARN** | Tres cargas por ancho; [log](ux-ui-performance-close-20261120/taste-performance-after.log) |
| Galería final | **92/92**, una versión | Cuatro resoluciones, pie nativo, ancho real PNG, hashes de fuentes/assets/capturas |
| Alcance estático | **PASS** | 18 handlers por nombre y 390 atributos funcionales conservados; comprobación delimitada, no prueba universal de equivalencia |
| Archivos protegidos | **128/128 idénticos** | Comparación binaria con base, sin archivos nuevos en esas rutas |
| Capturas anteriores | **84/84 intactas** | Hashes iguales al manifiesto anterior; galería de 65 también conservada |
| Estado de Taste | **OPEN histórico, sin modificar** | No se ejecutaron gate ni nuevas rondas |

La primera suite UI de esta etapa obtuvo **29/31**, con dos fallos al abrir Equipo.
Un `Suspense` demasiado amplio ocultaba sus subtabs mientras descargaba Workload.
Se preserva el [log fallido](ux-ui-performance-close-20261120/chromium-existing-first-attempt.log).
Se corrigió el límite por contenido, sin debilitar las aserciones. Los
[dos casos afectados](ux-ui-performance-close-20261120/chromium-equipo-targeted.log)
pasaron después; la suite completa final pasó 31/31. La suite compilada retiene
explícitamente el chunk de Workload y comprueba que los controles permanecen visibles.
No se oculta ni se contabiliza la ejecución fallida como aprobada.

Planner se prueba de dos formas: la suite existente procesa un Excel real ficticio y
conserva payload/acuse contra la RPC simulada; el build de producción lee otro Excel
ficticio en el navegador y muestra su fila **sin enviarla**. Se comprueban descarga
retardada, Tab, Escape, restauración del foco y reapertura del importador.

Los 171, 31, 22 y dos focalizados son ejecuciones distintas; no se suman como una sola
suite. No hay omisiones en las ejecuciones finales completas. Los tiempos de Taste son
medianas de Chromium local/CPU, no métricas de usuarios reales ni resultados de Vercel.
La verificación no equivale a WCAG completa, dispositivo físico o integración remota.

## Galería y conservación del sistema

[92 capturas finales](ux-ui-performance-close-20261120/README.md): 80 de los 20 estados
principales en cuatro resoluciones y 12 adicionales de arrastre, métricas y carga diferida.
Todas muestran **Versión 202611201553** desde un único build. Las
[84 capturas anteriores](ux-ui-final-adjustments-20261120/README.md) permanecen como
histórico, con su versión original. No se reconstruyen ni editan imágenes.

Se mantienen las cuatro áreas, Lucide, paleta Procont, contraste medio, microinteracciones
y responsive aprobados. Solo se añade feedback para la espera de módulos diferidos.
Revisión visual real de portal, Kanban y estados de Planner; comprobación automatizada
del conjunto en desktop 1440×900, laptop 1366×768, tablet 768×1024 y móvil 390×844.

Sin diferencias en backend, `supabase/`, migraciones M1–M15, Edge Functions, `contracts/`,
`scripts/`, `src/lib/`, `src/hooks/`, `src/types/`, `src/dev/`, dependencias, configuración
Vite ni Vercel. [Comparación](ux-ui-performance-close-20261120/protected-files.json).
No se utilizaron servicios reales ni credenciales QA. Las creaciones de las pruebas son
respuestas locales simuladas, sin tickets persistentes o remotos. Se mantienen intactos
los worktrees originales, main y el archivo sin seguimiento `1` del checkout compartido.

La lista de [archivos de la rama](ux-ui-performance-close-20261120/changed-files.md)
incluye el rediseño previamente aprobado, sus evidencias y esta optimización; no se
presenta como si toda la lista hubiese cambiado durante esta última etapa.

Con las pruebas y el presupuesto final conformes, el usuario autoriza **commit local en
la misma rama**, conservando historial y excepciones. El SHA corresponde al commit que
incorpora este documento; se consulta con `git log -1 --oneline --` seguido de su ruta.
No se autoriza ni se ejecuta push, merge, modificación de main o despliegue.

Veredicto: **APTO PARA REVISIÓN E INTEGRACIÓN LOCAL POSTERIOR**, con excepciones
Taste explícitamente autorizadas y gate histórico OPEN. No se declara listo para producción.
