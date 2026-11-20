# Capturas y resultados locales

> **Galería histórica, reemplazada para la revisión actual.** Conserva sus versiones y
> resultados originales. Consulte la [galería final de 84 capturas del único build
> Versión 202611201512](../ux-ui-final-adjustments-20261120/README.md).
> La clasificación individual de Taste y el presupuesto actual están en el informe nuevo;
> no se considera que sus 19 instancias sean todas reglas exclusivamente comerciales.

Base: `6533b27`. Fecha: 20/11/2026. React y Chromium reales, servicios y datos simulados.
Las imágenes conservan el ancho de la ventana; las páginas largas se capturaron completas.
Los modales se capturaron como ventana visible, sin transformar ni reconstruir las capturas.
No hay imágenes generadas, credenciales reales ni datos del proyecto remoto.

| Pantalla | Desktop 1440 × 900 | Laptop 1366 × 768 | Tablet 768 × 1024 | Móvil 390 × 844 |
|---|---|---|---|---|
| portal | [desktop](screenshots/desktop-01-portal.png) | [laptop](screenshots/laptop-01-portal.png) | [tablet](screenshots/tablet-01-portal.png) | [movil](screenshots/movil-01-portal.png) |
| modal-personal | [desktop](screenshots/desktop-02-modal-personal.png) | [laptop](screenshots/laptop-02-modal-personal.png) | [tablet](screenshots/tablet-02-modal-personal.png) | [movil](screenshots/movil-02-modal-personal.png) |
| quipu-validacion | [desktop](screenshots/desktop-03-quipu-validacion.png) | [laptop](screenshots/laptop-03-quipu-validacion.png) | [tablet](screenshots/tablet-03-quipu-validacion.png) | [movil](screenshots/movil-03-quipu-validacion.png) |
| quipufac-validacion | [desktop](screenshots/desktop-03-quipufac-validacion.png) | [laptop](screenshots/laptop-03-quipufac-validacion.png) | [tablet](screenshots/tablet-03-quipufac-validacion.png) | [movil](screenshots/movil-03-quipufac-validacion.png) |
| nuevo-ticket-adjunto | [desktop](screenshots/desktop-04-nuevo-ticket-adjunto.png) | [laptop](screenshots/laptop-04-nuevo-ticket-adjunto.png) | [tablet](screenshots/tablet-04-nuevo-ticket-adjunto.png) | [movil](screenshots/movil-04-nuevo-ticket-adjunto.png) |
| mis-tickets | [desktop](screenshots/desktop-05-mis-tickets.png) | [laptop](screenshots/laptop-05-mis-tickets.png) | [tablet](screenshots/tablet-05-mis-tickets.png) | [movil](screenshots/movil-05-mis-tickets.png) |
| detalle | [desktop](screenshots/desktop-06-detalle.png) | [laptop](screenshots/laptop-06-detalle.png) | [tablet](screenshots/tablet-06-detalle.png) | [movil](screenshots/movil-06-detalle.png) |
| seguimiento-publico | [desktop](screenshots/desktop-07-seguimiento-publico.png) | [laptop](screenshots/laptop-07-seguimiento-publico.png) | [tablet](screenshots/tablet-07-seguimiento-publico.png) | [movil](screenshots/movil-07-seguimiento-publico.png) |
| dashboard | [desktop](screenshots/desktop-08-dashboard.png) | [laptop](screenshots/laptop-08-dashboard.png) | [tablet](screenshots/tablet-08-dashboard.png) | [movil](screenshots/movil-08-dashboard.png) |
| bandeja | [desktop](screenshots/desktop-09-bandeja.png) | [laptop](screenshots/laptop-09-bandeja.png) | [tablet](screenshots/tablet-09-bandeja.png) | [movil](screenshots/movil-09-bandeja.png) |
| kanban | [desktop](screenshots/desktop-10-kanban.png) | [laptop](screenshots/laptop-10-kanban.png) | [tablet](screenshots/tablet-10-kanban.png) | [movil](screenshots/movil-10-kanban.png) |
| kanban-done | [desktop](screenshots/desktop-11-kanban-done.png) | [laptop](screenshots/laptop-11-kanban-done.png) | [tablet](screenshots/tablet-11-kanban-done.png) | [movil](screenshots/movil-11-kanban-done.png) |
| tabla | [desktop](screenshots/desktop-12-tabla.png) | [laptop](screenshots/laptop-12-tabla.png) | [tablet](screenshots/tablet-12-tabla.png) | [movil](screenshots/movil-12-tabla.png) |
| gantt | [desktop](screenshots/desktop-13-gantt.png) | [laptop](screenshots/laptop-13-gantt.png) | [tablet](screenshots/tablet-13-gantt.png) | [movil](screenshots/movil-13-gantt.png) |
| roadmap | [desktop](screenshots/desktop-14-roadmap.png) | [laptop](screenshots/laptop-14-roadmap.png) | [tablet](screenshots/tablet-14-roadmap.png) | [movil](screenshots/movil-14-roadmap.png) |
| modal-ticket | [desktop](screenshots/desktop-15-modal-ticket.png) | [laptop](screenshots/laptop-15-modal-ticket.png) | [tablet](screenshots/tablet-15-modal-ticket.png) | [movil](screenshots/movil-15-modal-ticket.png) |

[Arrastre real en Chromium, cancelado sin operar el backend](screenshots/desktop-16-arrastre.png).

65 capturas: 16 pantallas por 4 resoluciones y una captura de arrastre.
Tablet y móvil incorporan emulación táctil; no sustituyen un dispositivo físico.

## Resultados conservados

- [171/171 Node](node.log).
- [45/45 Chromium: 31 existentes + 14 UX](chromium.log).
- [8/8 controles focalizados de portal tras consolidar la clase wrap](chromium-targeted.log).
- [Build y TypeScript](build.log). La comprobación estricta adicional del contrato TypeScript salió con código 0.
- [Conservación de handlers, atributos y archivos protegidos](scope.json).
- [Gate Taste: OPEN con 19 hallazgos](taste-gate.log).
- [Rendimiento del build servido con fallback SPA](performance.log), [datos JSON](performance.json).
- [Comparación del bundle contra la base aprobada](bundle-comparison.json).

No se suman las ejecuciones focalizadas al total de la suite conjunta.
La primera medición con el servidor estático de la skill devolvía un falso 404 de `/portal`:
ese servidor no tenía fallback SPA. Se repitió exclusivamente esa medición con Vite Preview;
la medición válida tiene cero peticiones rotas. No se cambió la aplicación para acomodar el checker.

La primera prueba nueva necesitó corregir selectores por el contador Requests, prefijos de iconos
y separador decimal de `es-PE`; no se cambiaron las reglas de negocio ni las pruebas existentes.
Una ejecución intermedia terminó por SIGTERM sin resultado final; se conservan aquí las ejecuciones
posteriores completas, con cero fallos y cero pruebas omitidas.

## Observaciones abiertas de Taste

`GATE: OPEN 19 (rounds used up)` no significa PASS. No se añadieron waivers ni se alteraron sus scripts.
El checker trata la aplicación como una página comercial: exige héroe de una pantalla, secciones
de una o dos pantallas, CTA comercial, momento decorativo, visual de producto y estructura HTML
estática. Sus recomendaciones de ampliar el pie de versión a una pantalla o esconder los accesos
hasta la siguiente pantalla contradicen la aplicación operativa y el alcance del usuario.
La lista completa, con elementos y propuestas automáticas, está en [taste-gate.log](taste-gate.log).
Estos resultados no se presentan como una aprobación automática de Taste.

El presupuesto de JavaScript de la skill falla en ambos tamaños medidos (un mismo bundle):
unos 1.045 KiB analizados frente a su umbral de 900 KiB. La base ya tenía 1.067.876 bytes;
la versión UX tiene 1.070.120 bytes en el mismo build simulado (+2.244 bytes; +2.035 gzip).
No se añadieron dependencias ni se modificó la estrategia de carga funcional para ocultar ese límite.
La transferencia total ronda 388 KiB, fuentes 51 KiB, CLS 0, cero contextos WebGL y cero peticiones rotas.
FCP/LCP y long tasks corresponden a Chromium local en CPU: no son métricas de usuarios reales.

Pendientes de evaluación externa: dispositivos físicos, lector de pantalla y conformidad WCAG completa.

## Estado Git y conservación

Rama `feat/ticketera-ux-ui-four-areas`, en el worktree aislado
`/tmp/ticketera-ux-ui-20261120-worktree`. HEAD/base `6533b277e9022bf3bb9a64bff02d2e4cdbfc52d5`.
No se creó commit nuevo: el usuario condicionó esa operación a que todas las validaciones pasen.
Gate Taste queda OPEN 19 y el presupuesto JS no pasa el umbral de la skill, aunque las pruebas
funcionales, TypeScript, build y controles responsive sí pasan. Los archivos quedan guardados
sin descartar cambios, sin push, merge o despliegue.

[Estado verificable de entrega](delivery-status.json).
