# Informe de rendimiento — modo oscuro

Sin dependencias nuevas: `package.json` y el lockfile no cambian. `tailwindcss/colors` y `tailwindcss/plugin` ya forman parte de Tailwind.

## Build

| Recurso | Publicado (`49cca39`) | Con modo oscuro | Diferencia |
|---|---|---|---|
| `index-*.css` | 56,89 KB (gzip 11,20) | 74,61 KB (gzip 14,26) | +17,7 KB (+3,1 KB gzip): 237 variables por rol × 2 temas y utilidades que las referencian |
| `index-*.js` (inicial) | 378,94 KB (gzip 113,02) | 380,64 KB (gzip 113,58) | +1,7 KB: `theme.ts` y `ThemeToggle` |
| Script anti-destello en `<head>` | — | 275 bytes en línea | Se ejecuta antes del CSS; sin petición extra |

## Presupuesto por recorrido (Taste `perf.md`; UX sobre build de producción, 36/36)

| Recorrido | Publicado | Con modo oscuro | Veredicto |
|---|---|---|---|
| Portal | 393,1 | 394,8 | PASS |
| Dashboard | 429,6 | 431,2 | PASS |
| Bandeja | 445,9 | 447,6 | PASS |
| Cliente autenticado (acumulado) | 466,6 | 468,3 | WARN (como antes) |
| Kanban | 567,9 | 569,6 | WARN (como antes) |
| Importador abierto | 782,6 | 784,2 | WARN (como antes; < 900) |

El tema no cambia ningún veredicto: añade +1,7 KiB por recorrido. La excepción H-20 de la corrección UX/UI se mantiene tal cual. Fuente: [`data/browser-bundle.json`](data/browser-bundle.json).

## Estabilidad y pintado

| Ruta (carga en frío) | CLS claro | CLS oscuro |
|---|---|---|
| `/portal` | 0 | 0 |
| `/tracking` | 0,0413 | 0,0413 |
| `/cliente/nuevo` | 0,0431 | 0,0431 |

- **Sin destello del tema:** el atributo `data-theme` se fija en el `<head>` antes de que se apliquen las hojas de estilo, y el primer pintado ya usa el tema guardado (prueba «persistencia sin destello»).
- **Cambio de tema:** View Transitions hace un único fundido de 200 ms (opacidad en el compositor). Durante el cambio se suspenden las transiciones por elemento, así que no se lanzan cientos de animaciones de color. Sin soporte de View Transitions, el cambio es instantáneo.
