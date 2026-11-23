# Resumen ejecutivo — Auditoría UX/UI Ticketera Procont (23/11/2026)

**Dictamen: NO APROBADO.** No hay defectos críticos de uso. La aprobación queda bloqueada por incumplimientos explícitos de Taste y de WCAG AA concentrados en el panel interno, por un gate de Taste sin PASS y por una paleta sin trazabilidad a la marca oficial. Todo es corregible.

**Versión auditada:** producción `Versión 202611231118`, `main` `a1d9e9c`. El código de main coincide con lo desplegado en 15/15 assets. Las vistas privadas se auditaron con datos simulados (build local del mismo main) y se marcan como tales.

**Skills:**
- Ambas se leyeron íntegras y son idénticas al original.
- Taste 2.5.1: `Leonxlnx/taste-skill`. La referencia `emilkowalski/taste-skill` no existe (404).
- Emil: `emilkowalski/skills`, skill `emil-design-eng`.

| Dimensión | Evaluación |
|---|---|
| Taste Skill | **No cumple.** 7 PASS, 18 PARTIAL, 6 FAIL. Gate `OPEN 19`, solo sobre el portal antiguo; kit y capa de movimiento no adoptados; violeta prohibido en el panel |
| Emil Design Engineering | **Cumple con observaciones.** 15 PASS, 5 PARTIAL, 1 FAIL |
| Identidad visual | **Parcial.** Logo oficial y contraste medio correctos; paleta `#173D66`/`#D5AE54` a ΔE 6–11 de la oficial (`#1E3A8A`, `#01257B`, `#EEBB31`), sin decisión registrada |
| UX | **Bueno** en portal, ingreso y cliente; **parcial** en el panel (validación de formulario genérica, prioridades en inglés en Kanban) |
| UI | **Bueno** en las áreas 1–3; **parcial** en el panel (emojis + Lucide, dos botones rellenos, etiquetas truncadas, versales) |
| Motion | **Bueno.** Ninguna animación decorativa salvo un punto pulsante; mejoras menores en presión, movimiento reducido y hover inicial |
| Responsive | **Bueno.** Sin desbordamiento de 320 a 1920; tablero y tablas con desplazamiento interno |
| Accesibilidad | **Parcial.** Foco, skip link, nombres y movimiento reducido correctos. Contraste AA insuficiente en el panel (acción principal 3,15:1), bordes de campo 1,39:1 y panel sin `h1` |
| Rendimiento percibido | **Bueno** en el portal (LCP 0,57 s, CLS 0, 442 KiB). **WARN** en vistas internas (463–836 KiB) |

## Primero, corregir

1. **H-02:** quitar el violeta y el púrpura del panel (Kanban, avatares, badges, dashboard).
2. **H-03 / H-12:** contraste AA en «Aceptar y crear trabajo», contadores, avatares y vacíos.
3. **H-04:** que el usuario confirme o revoque la paleta `#173D66`/`#D5AE54` y quede registrada.
4. **H-05:** borde de campos con contraste ≥ 3:1.
5. **H-01:** ejecutar el gate de Taste sobre el build y las áreas actuales, o cerrarlo con `--done` y las palabras del usuario.

Detalle, matrices, 25 hallazgos y evidencias en [REPORT.md](REPORT.md).
Capturas con manifiesto: 30 de producción y 75 simuladas.
