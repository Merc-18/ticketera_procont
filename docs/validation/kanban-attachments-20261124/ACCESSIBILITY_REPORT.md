# Accesibilidad (WCAG 2.2 AA como referencia)

Los contrastes se miden de dos maneras: (a) en el navegador, con los colores calculados (las pruebas fallan si no se alcanza el umbral, en claro y oscuro); (b) con la tabla de abajo, que reproduce `color-mix` en sRGB.

## 1. Columnas del Kanban

| Etapa | Tema | Acento vs página (no texto) | Título vs cabecera | Contador texto/fondo | Icono vs cabecera |
|---|---|---|---|---|---|
| queue | Claro | 3.86:1 | 12.61:1 | 8.73:1 | 8.90:1 |
| queue | Oscuro | 7.49:1 | 12.50:1 | 8.44:1 | 10.38:1 |
| analysis | Claro | 3.32:1 | 12.53:1 | 6.34:1 | 6.45:1 |
| analysis | Oscuro | 8.96:1 | 12.35:1 | 7.30:1 | 9.13:1 |
| design | Claro | 3.04:1 | 12.67:1 | 6.42:1 | 6.55:1 |
| design | Oscuro | 10.31:1 | 12.21:1 | 8.06:1 | 10.18:1 |
| build | Claro | 8.40:1 | 12.05:1 | 8.08:1 | 8.50:1 |
| build | Oscuro | 7.55:1 | 12.52:1 | 6.97:1 | 8.56:1 |
| review | Claro | **1.93:1** | 13.10:1 | 6.13:1 | 6.11:1 |
| review | Oscuro | 10.77:1 | 12.18:1 | 7.81:1 | 9.82:1 |
| testing | Claro | 4.20:1 | 12.31:1 | 5.94:1 | 6.13:1 |
| testing | Oscuro | 8.48:1 | 12.48:1 | 7.40:1 | 9.12:1 |
| release | Claro | 4.35:1 | 12.43:1 | 5.99:1 | 6.15:1 |
| release | Oscuro | 10.62:1 | 12.17:1 | 8.17:1 | 10.35:1 |
| done | Claro | 4.07:1 | 12.47:1 | 5.89:1 | 6.06:1 |
| done | Oscuro | 11.01:1 | 12.12:1 | 8.43:1 | 10.64:1 |

**Excepción declarada:** la barra de 3 px de *Code Review* en claro usa el dorado Procont (`#D4A017`, 1.93:1 sobre `#E2E8F0`). Es decorativa: la etapa se identifica por el título (13.10:1), el icono en `--stage-ink` (6.11:1) y el contador (6.13:1). WCAG 1.4.11 no la exige porque no es necesaria para entender el contenido. Las otras 15 combinaciones superan 3:1.

## 2. Prioridades, estados y tarjeta

| Elemento | Claro | Oscuro | Fuente |
|---|---|---|---|
| Insignias Urgente / Alto / Medio / Bajo | ≥ 4,5:1 cada una (aprobadas en D-042; sin cambios de color) | ≥ 4,5:1 | Prueba «sin barra azul…» (mide las 4) |
| Título de la tarjeta `--p-ink` sobre `--p-elevated` | 14,68:1 | 12,95:1 | Tokens del sistema (calculado) |
| REQ (`--p-ink-2`) y solicitante (`--p-muted`) | 10,31:1 / 7,56:1 | 11,00:1 / 7,29:1 | Tokens (calculado) |
| «Bloqueado» (`--danger` sobre su tinte) | ≥ 4,5:1 | ≥ 4,5:1 | Tokens `--danger`/`--danger-bg` aprobados |
| Borde de la tarjeta | Decorativo (la tarjeta se identifica por su contenido y su sombra) | — | — |
| Franja del responsable | Lleva la línea de 1 px `--p-ink` existente, que asegura ≥ 3:1 con cualquier color personal | — | Sin cambios |

## 3. Adjuntos (medido en la prueba, claro y oscuro)

| Elemento | Umbral exigido | Resultado |
|---|---|---|
| Instrucción vs fondo de la zona | ≥ 7:1 | Aprobado |
| Ayuda vs fondo de la zona | ≥ 4,5:1 | Aprobado |
| Texto del botón «Seleccionar archivos» | ≥ 4,5:1 | Aprobado |
| Borde de la zona (reposo y arrastre) vs fondo | ≥ 3:1 | Aprobado |
| Avisos de éxito y de error | ≥ 4,5:1 | Aprobado |
| Estado de fila («Lista») | ≥ 4,5:1 | Aprobado |
| Fondo en arrastre ≠ fondo en reposo | distinto | Aprobado |

## 4. Teclado, lectores de pantalla y movimiento

- La zona se alcanza con Tab; el anillo de foco es visible (`outline` sólido de 2 px). **Enter o Espacio** abren el explorador. Después sigue «Seleccionar archivos» (input `sr-only` con su etiqueta como botón y anillo en la etiqueta). Prueba «teclado».
- La zona usa `role="group"` con `aria-labelledby` (la instrucción) y `aria-describedby` (los límites y formatos).
- Los avisos van en `role="status"` con `aria-live="polite"`. El error de preparación conserva `role="alert"`.
- «Quitar «nombre»» es un botón de 44 × 44 con nombre propio; después de quitar, el foco vuelve a la zona.
- Columnas: `section` con `aria-label="Fase: N tickets"`; contador con `aria-label`; contador de bloqueados con texto oculto «bloqueado(s)».
- Tarjeta: «Solicitante:» y «Prioridad definitiva:» como texto oculto; checklist con `aria-label="Checklist x de y"`; casilla «Seleccionar …» y «Asignar responsable» sin cambios.
- Tabla: la columna «Responsable» lleva texto, no solo el avatar; «Bloqueado» lleva texto e icono.
- Movimiento reducido: la tarjeta no se desplaza al pasar el puntero (prueba); la regla global existente deja solo transiciones de color y opacidad.
- WCAG 2.5.8: todas las acciones nuevas miden ≥ 44 px; la casilla de selección existente mide 20 px y tiene separación suficiente.
