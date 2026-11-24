# Kanban visual + adjuntos con copiar/pegar y arrastrar — informe

| Dato | Valor |
|---|---|
| Fecha | 24/11/2026 |
| Responsable | Claude Code |
| Base verificada | `github/main` = `e653138fd339a9503238825db32f27d34c698bb8` (`git ls-remote`: única rama remota `main`) |
| Copia de trabajo | Worktree persistente `.agent-workspaces/kanban-attachments-20261124`, rama **local** `local/kanban-attachments-20261124` sin upstream |
| Alcance | Solo frontend (UX/UI e interacción) |
| Skills | `design-taste-frontend` 2.5.1 y `emil-design-eng` (copias de auditoría del proyecto; ver TASTE/EMIL_COMPLIANCE) |
| Publicación | **No**: sin push, sin merge, sin despliegue |

## 1. Qué se hizo

1. **Kanban**: cada columna real tiene un tono de etapa sutil (fondo al 5–9 %, acento de 3 px, icono y contador teñidos). Se eliminó la barra superior de 3 px por prioridad, que era la «barra azul universal» porque Medio es la prioridad más común. Las tarjetas son neutras y tienen 4 bandas de jerarquía. La prioridad queda solo en la insignia, el responsable en la franja y el anillo (color persistido en Supabase, sin cambios de lógica) y el bloqueo es un indicador propio. Detalle en [KANBAN_VISUAL_REPORT.md](KANBAN_VISUAL_REPORT.md).
2. **Tabla**: columna «Responsable» con el mismo anillo, punto de etapa en «Fase» e insignia «Bloqueado». La prioridad es la misma insignia que en el Kanban.
3. **Adjuntos**: la zona acepta archivos por **«Seleccionar archivos»**, **arrastrar y soltar** y **Ctrl/Cmd + V**, con el mismo filtro del contrato (formato, tamaño, duplicado por contenido, 4 archivos) y estados visibles, en español y accesibles con teclado. Nada se sube hasta el envío, que usa el flujo de reservas existente. Detalle en [ATTACHMENTS_INTERACTION_REPORT.md](ATTACHMENTS_INTERACTION_REPORT.md).

## 2. Archivos cambiados

| Archivo | Cambio |
|---|---|
| `src/lib/board-stages.ts` (nuevo) | Fase → tono de etapa (solo presentación) |
| `src/components/boards/BoardColumn.tsx` | `data-stage`, cabecera con contador y contador de bloqueados, estado de arrastre en el tono de la etapa, vacío |
| `src/components/boards/ProjectCard.tsx` | Jerarquía nueva, sin barra; misma información y acciones |
| `src/components/boards/TableView.tsx`, `KanbanBoard.tsx` | Columna «Responsable», punto de etapa, insignia de bloqueo; `users` pasa a la Tabla |
| `src/lib/attachment-intake.ts` (nuevo) | Filtro común del contrato (extensiones, MIME del bucket, tamaño, duplicado, cantidad); portapapeles; nombres de capturas |
| `src/lib/attachments.ts` | `ATTACHMENT_ACCEPT` se reexporta desde `attachment-intake.ts` (mismo valor) |
| `src/components/requests/AttachmentPicker.tsx` | Zona de soltar/pegar, avisos, vista previa, estados, `sending` |
| `src/components/requests/PublicRequestForm.tsx` | `sending={loading}`; mensaje de éxito «Se adjuntaron N archivos» en el recibo |
| `src/components/projects/EvidenceSection.tsx` | `sending={busy}` |
| `src/index.css` | Bloques «Kanban: identidad de etapa…» y «Adjuntos: seleccionar, arrastrar o pegar»; se eliminan las barras `prio-*` y los estilos anteriores del selector de adjuntos |
| `tests/attachment-intake.test.mjs` (nuevo) | 11 pruebas unitarias |
| `tests/ui/kanban-attachments.ui.test.mjs` (nuevo), `kanban-attachments-fixtures.mjs` (nuevo), `capture-kanban-attachments.mjs` (nuevo) | 17 pruebas de interfaz, datos ficticios y capturas |
| `tests/ui/dashboard-boards.ui.test.mjs` | Dos aserciones exigían la barra de 3 px; ahora exigen 1 px y la insignia (cambio pedido) |

**Backend intacto**: `git diff e653138 --stat -- supabase contracts scripts vercel.json package.json package-lock.json` está vacío. No se modificaron Supabase, SQL, migraciones, RPC, RLS, Edge Functions, datos, autenticación, identidad Quipu/QuipuFac ni variables de Vercel. No hay dependencias nuevas.

## 3. Pruebas

| Suite | Resultado | Registro |
|---|---|---|
| Unitarias `node --test tests/*.test.mjs` (incluye 11 nuevas de adjuntos) | **184/184** | [data/unit-tests.log](data/unit-tests.log) |
| Nueva `tests/ui/kanban-attachments.ui.test.mjs` | **17/17** | [data/kanban-attachments-ui.log](data/kanban-attachments-ui.log) |
| Afectada `dashboard-boards.ui` (Boards, color personal) | **9/9** | [data/affected-existing-ui-suites.log](data/affected-existing-ui-suites.log) |
| Afectada `theme.ui` (claro/oscuro) | **8/8** | ídem |
| Afectada `ux-four-areas.ui` (Kanban, arrastre, formulario) | **31/31**; 6 omitidas por diseño (`skip: !BUILD_DIR`, requieren un build de producción) | ídem |
| Afectada `portal-navigation.ui` (creación del cliente) | **31/31** | ídem |
| `tsc --noEmit` y `vite build` | OK | — |

No se repitió `portal-tracking.ui` (seguimiento público, no afectado).

Defectos que las pruebas encontraron durante la validación, ya corregidos:
1. A 768 px la página se desplazaba 428 px en horizontal, porque el texto oculto del contador de bloqueados escapaba al recorte del carrusel. Se corrigió con `position: relative` en `.board-column`.
2. Al excluir la vista previa de «Mi color de tarjeta» del hover, la regla de movimiento reducido perdió especificidad y la tarjeta volvía a subir 1 px. Se igualó el selector.

Cobertura pedida:
- **Kanban**: identidad de cada columna (8 acentos y 8 cabeceras distintas, sin violeta, contrastes); sin barra superior; cuatro prioridades; estado bloqueado independiente; color personal en franja y anillo; coherencia Kanban ↔ Tabla (colores calculados idénticos); claro y oscuro; responsive de 1920 a 320.
- **Adjuntos**: seleccionar (explorador); arrastrar uno y varios; pegar un archivo e imagen; texto del portapapeles ignorado; duplicado; formato no permitido; tamaño excedido; límite de cantidad; eliminar; soltar fuera; envío con 1 reserva y 1 subida por archivo, sin duplicados; teclado; contraste; responsive.

Todo con datos y archivos ficticios, servidores locales (`127.0.0.1`) y credenciales simuladas. No se crearon tickets reales ni se subieron archivos a producción.

## 4. Evidencias

- 120 capturas en `screenshots/`: 44 **Antes**, tomadas de una copia limpia de `e653138` con el mismo script, y 76 **Después**. Ver `screenshots-manifest.json` (tema, vista, viewport y SHA-256 de cada una) y `SHA256SUMS`.
- Informes: [EXECUTIVE_SUMMARY](EXECUTIVE_SUMMARY.md) · [KANBAN_VISUAL_REPORT](KANBAN_VISUAL_REPORT.md) · [ATTACHMENTS_INTERACTION_REPORT](ATTACHMENTS_INTERACTION_REPORT.md) · [TASTE_COMPLIANCE](TASTE_COMPLIANCE.md) · [EMIL_COMPLIANCE](EMIL_COMPLIANCE.md) · [ACCESSIBILITY_REPORT](ACCESSIBILITY_REPORT.md) · [RESPONSIVE_REPORT](RESPONSIVE_REPORT.md).
- Peso: el CSS principal pasa de 82,93 kB (15,91 kB gzip) a 95,52 kB (18,00 kB gzip), +2,09 kB gzip. El JS principal no cambia (382,61 kB).

## 5. Pendientes y limitaciones

- Que el explorador del sistema operativo exponga archivos copiados depende del navegador. Las pruebas simulan `ClipboardEvent`/`DataTransfer` en Chromium; no se probó con el portapapeles real del sistema ni en Safari o Firefox. Se recomienda una verificación manual en Chrome/Edge de Windows antes de publicar.
- El gate Taste histórico sigue en `OPEN 14`; no se reinició (ver TASTE_COMPLIANCE).
- El acento de 3 px de *Code Review* en claro (dorado) es decorativo y mide 1,93:1. Está declarado en ACCESSIBILITY_REPORT.

## 6. Git y respaldo

Commit local en la rama `local/kanban-attachments-20261124` (sin upstream), bundle Git verificado con `git bundle verify` y su SHA-256 en `.agent-backups/kanban-attachments-20261124/` del repositorio principal (fuera del commit para no crear una referencia circular). Sin push, merge ni despliegue: queda pendiente la autorización del usuario.
