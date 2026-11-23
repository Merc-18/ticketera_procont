# Informe responsive

Re-auditoría final: 115 capturas a pantalla completa en 5 anchos (desktop 1920×1080, laptop 1440×900, tablet 768×1024, móvil 390×844, m360 360×800), más una medición de desbordamiento a 320 px. Tablet y móvil se emulan con `hasTouch`, y móvil también con `isMobile`.

| Ruta (320 px) | Desbordamiento horizontal |
|---|---|
| `/portal` | 0 |
| `/cliente` | 0 |
| `/tracking` | 0 |
| `/cliente/nuevo` | 0 |
| `/` dashboard | 0 |
| `/` Kanban | 0 |

Las 115 pantallas tienen `overflow 0` ([`data/reaudit-results.json`](data/reaudit-results.json)).

## Cambios con efecto responsive

| Cambio | Antes | Después | Captura |
|---|---|---|---|
| Marca en la cabecera Enterprise (H-21) | Truncada a 360/390 | `whitespace-nowrap` y barra con `flex-wrap`; nombre completo | `m360-30-dashboard.png`, `m360-33-kanban.png` |
| Acciones del formulario (H-23) | Cancelar encima de Enviar | Columna con el primario primero en móvil; fila de ancho natural (mín. 180 px) desde 768 px | `movil-25-quipufac-validacion-vacia.png`, `desktop-24-quipufac-nuevo-ticket.png` |
| Filtros del Kanban y del dashboard | Selectores sueltos con `aria-label` | `.toolbar-field` (etiqueta encima del control) que se acomoda en filas | `*-33-kanban.png`, `*-30-dashboard.png` |
| Etiquetas del gráfico «Por tipo» (H-08) | Cortadas | `break-words` | dashboard |
| Objetivos táctiles | 20–36 px | ≥ 44 px (cierre de modal, `.back-link`, botones y selectores Enterprise, conmutador de asignación) | todas |
| Botón de eliminar del checklist | Solo visible con hover | Visible en táctil (`hover:none`) y con foco | `*-37-modal-ticket.png` |
| Hover | — | Limitado a `(hover:hover) and (pointer:fine)`; en táctil solo hay presión | — |

## Comprobación visual

Se revisaron las capturas de las cuatro áreas en los cinco anchos. No hay texto de interfaz cortado; las métricas `overflow` y la inspección de capturas coinciden. No hay solapamientos ni contenido fuera del contenedor. Manifiesto completo con sha256 por captura: [`screenshots-manifest.json`](screenshots-manifest.json).

**Limitación.** Solo se usó Chromium emulado; no se probó en dispositivos físicos ni en Safari o Firefox.
