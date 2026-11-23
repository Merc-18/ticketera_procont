# Corrección integral UX/UI — Ticketera Procont (23/11/2026)

**Veredicto: APROBADO CON OBSERVACIONES** (justificación en §8).

| Dato | Valor |
|---|---|
| Rama | `ux-ui-correction-20261123` (**solo local**; sin push ni merge) |
| Base | `5b411e5` (auditoría `ux-ui-audit-20261123`) sobre main `a1d9e9c07000007b83e063f19a3ff2e24a5b8f1b` |
| Alcance | Solo frontend: `src/**`, `index.html`, `tailwind.config.ts`, `public/assets/motion/`, `public/share.jpg`, pruebas UI y documentación |
| Sin cambios | `supabase/**`, SQL, migraciones M1–M16b, RPC, RLS, Edge Functions, autenticación, contratos de API, datos, variables de Supabase y Vercel, dependencias (`package.json` y lockfile intactos) |
| Entorno de evidencia | Build local con el servidor de datos ficticios del repositorio, red externa bloqueada (0 peticiones externas). **No es producción** |
| Re-auditoría | Versión 202611231424: 115 pantallas, 4 áreas, 5 anchos más 320 px |

## 1. Mandato y restricciones cumplidas

Se pidió corregir los 25 hallazgos de la auditoría y todos los PARTIAL/FAIL aplicables de las dos skills obligatorias (Taste 2.5.1 y Emil). El encargo incluía:

- portal SaaS, login minimalista, espacio del cliente SaaS y panel Enterprise;
- contraste medio con la paleta oficial Procont;
- solo iconos lineales (Lucide), sin emoji y nunca violeta;
- prioridades en español (Bajo, Medio, Alto, Urgente);
- WCAG 2.2 AA, movimiento Emil y kit Taste;
- responsive y rendimiento sin degradación.

Restricciones respetadas:

- Sin push, merge, despliegue ni cambios en Vercel; sin ramas remotas (la única remota sigue siendo `main`).
- Sin `git reset` ni `git clean`.
- No se creó ningún ticket real ni se usaron credenciales.
- No hay Co-Authored-By en el commit.
- El gate histórico OPEN 19 se conserva tal cual.

## 2. Cambios por área

**Sistema (todas las áreas)**

- Tokens: `src/theme/brand.ts` y `tailwind.config.ts` con la paleta oficial (D-037).
  - Azul de acción `#1E3A8A`, hover `#01257B`, activo `#001E64`.
  - Dorado `#EEBB31` como acento.
  - Neutros slate; fondo `#E2E8F0` y superficie `#F8FAFC`.
- `info` deja de ser violeta.
- Curva y duración por defecto de Emil.
- Borde de campo a 3:1 o más.
- Lectura a 16 px.
- Objetivos de 44 px.
- Un solo sistema de botones (`ui-button-primary`, `-secondary`, `-danger`, `-danger-solid`).
- Iconos: `Icon` y `ControlLabel icon`.
- Kit Taste de movimiento copiado sin modificar.
- Metadatos `og:*`.

**Portal y login**

- Composición en dos bloques: cabecera con `.wrap` de 760 px y accesos.
- Entrada `m-enter` del kit.
- Precarga por intención de las rutas diferidas.
- Modal del personal con `role=alert` y cierre de 44 px.
- `h2` de búsqueda a 24 px (`heading-scale`).

**Espacio del cliente**

- Formulario con errores por campo y foco en el primer error.
- «Enviar» activo salvo durante el envío; acciones con el primario primero.
- Búsqueda REQ con etiqueta visible.
- Paginación sin «Siguiente» vacío.
- `.back-link` de 44 px.
- Descripción del detalle a 16 px.
- Rutas diferidas.

**Panel interno**

- `h1` en cada vista y `h2` en las secciones.
- Filtros con etiqueta visible: Kanban, dashboard (Área, Estudio), urgencias (Mes) y lote.
- Fases y avatares sin violeta.
- Prioridades en español: tarjeta, modal, Gantt, Roadmap, lista, lote, validación y línea de tiempo.
- Un relleno por vista en el dashboard.
- Etiquetas de gráfico sin cortar.
- Etiqueta del Gantt legible sobre el dorado.
- Glifo de orden AA.
- Bandeja accesible con teclado.
- Modal de validación con botón principal AA, `htmlFor` en todos los selectores y `aria-pressed`.
- Checklist sin pulso y con el botón de eliminar visible con foco y en táctil.
- Carga de trabajo con `h2`.

**Movimiento**

- Hover desde el primer movimiento.
- Presión `scale(.98)` con 1 px.
- El modal sale en 120 ms (entra en 200 ms).
- Sin animación en acciones de teclado.
- Con movimiento reducido se mantienen color y opacidad.

El detalle por hallazgo está en [REMEDIATION_MATRIX.md](REMEDIATION_MATRIX.md).

## 3. Antes y después (métricas medidas)

| Métrica | Auditoría | Final |
|---|---|---|
| Hallazgos abiertos | 25 | 0 abiertos; 2 parciales (H-01 gate OPEN, H-20 JS en WARN) |
| Textos bajo 4,5:1 | 525 [SIM] | **0** |
| Lectura < 16 px / texto < 13 px | 210 / 80 | **0 / 0** |
| Campos sin etiqueta visible | 160 | **0** |
| Pantallas sin h1 / saltos de encabezado | 40 / — | **0 / 0** |
| Emoji renderizado | 264 en el código | **0** |
| Violeta | presente (7 archivos) | **0** |
| Desbordamiento a 320 px | 0 | 0 |
| Borde de campo | 1,39:1 | 4,55:1 |
| Botón principal de validación | 3,15:1 | 9,90:1 |
| Bundle inicial | 449,8 KB | 379,0 KB |
| Taste | PASS 7 · PARTIAL 18 · FAIL 6 | PASS 25 · PARTIAL 5 · FAIL 2 (excepciones) |
| Emil | PASS 15 · PARTIAL 5 · FAIL 1 | PASS 21 (2 no verificables) |

Capturas «antes»: [`../ux-ui-audit-20261123/screenshots/`](../ux-ui-audit-20261123/screenshots/). Capturas «después»: [`screenshots/`](screenshots/), 115 archivos con sha256 en [`screenshots-manifest.json`](screenshots-manifest.json).

## 4. Pruebas

| Suite | Resultado |
|---|---|
| `tsc --noEmit` y `npm run build` | PASS (exit 0; bundle inicial 379 KB) |
| Node unitarias (`tests/*.test.mjs`) | **173/173** PASS |
| Python (`pytest tests/`) | **52/52** PASS (88 subtests) |
| UI con Vite dev (`tests/ui/*.ui.test.mjs`) | **61/61** PASS; 6 omitidas (solo corren con build, ver la fila siguiente) |
| UX sobre build de producción (`UI_UX_BUILD_DIR`) | **36/36** PASS, 0 omitidas |
| Re-auditoría (115 pantallas) | 115 pantallas, 0 fallos, 0 errores de página, 0 peticiones externas |

Logs: [`data/tests/`](data/tests/).

Pruebas UI ajustadas a los cambios de comportamiento pedidos:

- espera de las rutas diferidas;
- paginación que termina en la página 3;
- «Enviar» activo con mensaje de estado en lugar de deshabilitado;
- «Carga de trabajo»;
- prioridad «Alto».

No se debilitó ninguna aserción de seguridad ni de contrato.

## 5. Skills

- [TASTE_COMPLIANCE.md](TASTE_COMPLIANCE.md):
  - gate del build nuevo en **OPEN 14 (rondas agotadas)** con 5 waivers;
  - checker sobre `/cliente` y `/tracking`;
  - matriz T1–T33.
- [EMIL_COMPLIANCE.md](EMIL_COMPLIANCE.md): inventario de movimiento y matriz E1–E23.

## 6. Accesibilidad, responsive y rendimiento

- [ACCESSIBILITY_REPORT.md](ACCESSIBILITY_REPORT.md): WCAG 2.2 AA, PASS en los criterios evaluados.
- [RESPONSIVE_REPORT.md](RESPONSIVE_REPORT.md): 0 desbordamiento.
- [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md): 4 vistas PASS, 4 WARN y 0 FAIL.

## 7. Incompatibilidades y decisiones documentadas

1. **Escala de presión.** Emil pide .95–.98 y Taste .985 → se aplica `.98` más 1 px, el rango que pidió el usuario.
2. **Reglas de landing de Taste frente a la composición aprobada (D-033).** Las reglas en conflicto son:
   - hero a pantalla completa, una sección por pantalla y `cta` dentro del hero;
   - `moment-none`, `one-heading` y `container-edges` de la medida de 760 px.

   Siguen como FAIL del gate (excepción autorizada T7/T11) y no se convierten en PASS.
3. **Tipo frase frente a los nombres que dio el usuario.** «Nueva Solicitud» y «Rastrear Solicitud» mantienen sus mayúsculas.
4. **CSV.** Las columnas de prioridad exportadas mantienen «Alta/Media/Baja». Es un formato de datos cubierto por `tests/ticket-export.test.mjs`; en pantalla se usa Bajo/Medio/Alto/Urgente.
5. **Marcador de datos `🔴 URGENTE`.** Se lee de observaciones históricas guardadas en BD; no se renderiza como icono.
6. **JS por vista.** Las vistas en WARN dependen de librerías; bajarlas exige cambiar dependencias, algo que no estaba autorizado.

## 8. Veredicto

**APROBADO CON OBSERVACIONES.**

Se resolvieron los 25 hallazgos: 19 corregidos, 4 corregidos con observación y 2 parciales. También se corrigieron los 8 hallazgos nuevos detectados en el camino. Las métricas automáticas de accesibilidad quedan en cero en 115 pantallas, y Emil cumple en todo lo verificable.

No se declara APROBADO por estas observaciones:

- **(a)** El gate Taste del build corregido está en **OPEN 14**, no en PASS. Sus FAIL son reglas de landing incompatibles con la composición aprobada; las rondas están agotadas y el histórico OPEN 19 se conserva.
- **(b)** Cuatro vistas superan el WARN de 450 KiB de JavaScript (ninguna llega al FAIL de 900).
- **(c)** No hubo pruebas en dispositivos reales ni con lectores de pantalla.
- **(d)** Toda la evidencia es de un build local con datos ficticios; el cambio **no está desplegado**.

## 9. Integridad

Las sumas SHA-256 de todos los archivos de esta carpeta están en [`SHA256SUMS`](SHA256SUMS). El commit local y el bundle se crean después de esta carpeta, así que no pueden citarse dentro de ella. Su hash, la verificación (`git bundle verify`) y el SHA-256 del bundle quedan en `.agent-backups/ticketera-ux-ui-correction-20261123.bundle.sha256`.
