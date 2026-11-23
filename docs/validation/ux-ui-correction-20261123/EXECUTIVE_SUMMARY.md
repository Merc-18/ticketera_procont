# Resumen ejecutivo — Corrección UX/UI (23/11/2026)

**Veredicto: APROBADO CON OBSERVACIONES.** Rama local `ux-ui-correction-20261123`, dos etapas: corrección (`9fc4afa`) y cierre de parciales (commit siguiente). Sin push, sin merge y sin despliegue. En GitHub sigue existiendo solo `main`.

## Qué se logró

- **Los 25 hallazgos de la auditoría tienen estado y evidencia:**
  - 19 corregidos;
  - 4 corregidos con una observación documentada;
  - 2 excepciones documentadas (H-01 y H-20), en las que se corrigió todo lo accionable y lo restante no es corregible sin romper una restricción;
  - 0 abiertos.

  También se corrigieron 8 hallazgos nuevos aparecidos durante el trabajo, más 1 observación (CLS < 0,1).
- **Identidad:** paleta oficial de Procont, sin violeta (0 colores con ese matiz). Solo iconos lineales, ningún emoji, y prioridades en español (Bajo, Medio, Alto, Urgente).
- **Accesibilidad (115 pantallas medidas):** en cero el contraste insuficiente, los campos sin etiqueta, el texto pequeño, los saltos de encabezado y el desbordamiento. Hay `h1` en todas las vistas.
- **Movimiento (Emil):** 21 de 21 criterios verificables, sin cambios en el cierre.
- **Taste:** pasa de 7 a **26 de 33** criterios. Los FAIL accionables del gate en el portal se corrigieron sin cambiar su composición (checker 48 → 43).
- **Rendimiento:** JavaScript inicial de 449,8 a 379 KB.
  - En el cierre, la bandeja pasa a PASS (469,7 → 445,9 KiB), el Kanban baja de 640,5 a 567,9 y el importador de 805,9 a 782,6.
  - Ningún recorrido llega al límite de 900 KiB.
- **Pruebas:**
  - Corrección: build, Node 173/173, Python 52/52, UI 61/61 y UX 36/36.
  - Cierre (solo lo afectado): tablero 15/15, portal 31/31, UX 36/36 y la re-auditoría automática.

## Las dos excepciones documentadas

1. **H-01, gate Taste en OPEN 14 (no PASS).** Las rondas están agotadas y no se reinician. Lo que sigue fallando son reglas de página de aterrizaje (hero a pantalla completa, una sección por pantalla, botón dentro del hero, «momento» animado). Aplicarlas cambiaría el portal aprobado y empujaría los accesos fuera de la primera pantalla. El registro histórico OPEN 19 se conserva.
2. **H-20, tres recorridos sobre 450 KiB:** cliente con recorrido completo 466,6, Kanban 567,9 e importador Planner 782,6. Lo que pesa son librerías en uso: Supabase, el arrastre del Kanban y la lectura de Excel, más la capa de movimiento obligatoria de Taste. Reducirlas exige cambiar dependencias o quitar funciones; por ejemplo, la versión ligera de `xlsx` no lee `.xls`.

## Otras observaciones

- Solo se probó en Chromium emulado, con datos ficticios y sin lector de pantalla real.
- El cambio **no está publicado**: falta autorizar el merge a `main` y el despliegue.

## Decisiones registradas

- D-037: paleta oficial e iconos.
- Presión .98 (incompatibilidad entre las skills).
- CSV con «Alta/Media/Baja» como formato de datos.
- «Nueva Solicitud» y «Rastrear Solicitud» con los nombres que dio el usuario.

## Documentos

[REPORT](REPORT.md) · [Matriz](REMEDIATION_MATRIX.md) · [Taste](TASTE_COMPLIANCE.md) · [Emil](EMIL_COMPLIANCE.md) · [Accesibilidad](ACCESSIBILITY_REPORT.md) · [Responsive](RESPONSIVE_REPORT.md) · [Rendimiento](PERFORMANCE_REPORT.md) · [Capturas](screenshots/) · [Capturas del cierre](cierre/screenshots/) · [SHA256SUMS](SHA256SUMS)
