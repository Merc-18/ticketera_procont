# Ajustes de Boards, Dashboard, identidad TI y formularios (23/11/2026)

**Veredicto: APROBADO CON OBSERVACIONES.** Rama **local** `dashboard-boards-20261123` (sin upstream) sobre `main` publicada `3ec6659`. Sin push, merge ni despliegue. Decisiones D-041 a D-046.

## 1. Diagnóstico del Dashboard

Detalle en [DASHBOARD_AUDIT.md](DASHBOARD_AUDIT.md):

- **No había métricas de solicitudes**, es decir, de la entrada del negocio.
- **Bloques que sobraban o fallaban:**
  - «Por Tipo» era obsoleto;
  - «Estado de proyectos» duplicaba los KPIs;
  - las urgencias ocupaban todo el ancho y salían solo de la casilla histórica;
  - «Por Área» mezclaba estudios y usaba el texto heredado `requester_area`.
- **El filtro de periodo engañaba:** solo afectaba a Cycle y Lead Time.

## 2. Cambios por ajuste

| # | Ajuste | Resultado | Documento |
|---|---|---|---|
| 1 | Áreas solo para PROCONT | El estudio se identifica por el **código canónico** `PROCONT` (exacto, sin nombres). Se aplica en el modal de validación (sin área ni envío de ids en otros estudios), en el filtro y los chips del Kanban y la Tabla, y en el Dashboard. Al cambiar de estudio se limpia la selección | [STUDIO_AREA_RULES.md](STUDIO_AREA_RULES.md) |
| 2 | Color en Boards | Prioridad con **relleno** (Urgente rojo, Alto dorado, Medio azul) y **contorno** (Bajo), más **borde superior** de la tarjeta y franja en el filtro. Los estados van en tinte o contorno: prioridad y estado ya no coinciden | [BOARD_COLOR_SYSTEM.md](BOARD_COLOR_SYSTEM.md) |
| 3 | Color personal interno | «Mi color de tarjeta» con seis colores oficiales y vista previa. Se muestra como franja lateral y anillo del avatar en Kanban y Tabla. Se guarda en `localStorage` por UUID; no lo ven los clientes | [INTERNAL_USER_CARD_COLORS.md](INTERNAL_USER_CARD_COLORS.md) |
| 4 | Formulario de tickets | Sin casilla ni texto de urgencia separada. Ayuda: «El equipo revisará la prioridad que solicitas y establecerá la prioridad definitiva.» Cuatro prioridades, Medio por defecto. `requested_priority` se envía; `urgent_requested` conserva su valor predeterminado (`false`) y **no se infiere** de «Urgente». En el detalle, la urgencia histórica solo aparece si existe | — |
| 5 | Identidad TI | «Acceso del equipo de TI» en el botón del portal, el título del modal, la etiqueta de cierre, la nota al pie y el subtítulo de `/login`. Misma autenticación, mismos roles | — |
| 6 | Dashboard | Secciones Solicitudes, Trabajo, Tiempos, Prioridad + Carga del equipo, Urgencias (compacto, dos fuentes separadas) + Áreas (solo PROCONT). Sin «Por Tipo», sin duplicados y sin gráficas vacías | [DASHBOARD_RESTRUCTURE.md](DASHBOARD_RESTRUCTURE.md) |

## 3. Las dos skills

- **Taste:**
  - color funcional («state in visuals»), un acento por canal, sin teñir tarjetas enteras;
  - 90–95 % neutro;
  - jerarquía con h1, h2 de sección y notas de 16 px;
  - gráficos que no se dibujan vacíos;
  - objetivos de 44 px en el selector de color;
  - sin violeta;
  - el gate sigue en **OPEN 14**, sin reiniciar.
- **Emil:**
  - ninguna animación nueva (dashboard «crisp and fast»);
  - los cambios de color usan las transiciones existentes;
  - el panel de color no se anima;
  - con teclado, sin transición.

## 4. Pruebas

| Suite | Resultado |
|---|---|
| TypeScript y build | PASS |
| Unitarias Node | **173/173** |
| Python | **52/52** (88 subtests) |
| UI (incluidas las **9 nuevas** de `dashboard-boards.ui.test.mjs`) | **90/90** (6 omitidas: solo corren con build y se cubren en la fila siguiente) |
| UX sobre build de producción | **36/36** |
| Contraste de tokens desde el CSS compilado | **84/84** pares (13 nuevos: insignias de prioridad, contorno de Bajo, acentos, franjas personales) |
| Re-auditoría claro / oscuro | 120 + 120 pantallas: contraste, lectura < 16 px, texto < 13 px, etiquetas, nombres de control, encabezados, desbordamiento (incluido 320 px) y emoji en **0** en los dos temas; h1 120/120; foco 56/56; violeta 0 |
| JS por recorrido | Portal 396,8 · dashboard 436,5 · bandeja 449,7 en PASS; cliente acumulado 468,3 · Kanban 577,3 · importador 787,6 en WARN (los mismos tres de antes; ninguno llega a 900) |

Las pruebas nuevas cubren:

- **Área:** PROCONT con selector de área y otro estudio sin él; el filtro del Kanban se oculta y se limpia; el Dashboard muestra «No aplica» y su filtro de área.
- **Prioridad:** cuatro prioridades distinguibles en los dos temas, con el dorado exacto y Bajo sin acento; el filtro marca su color.
- **Color personal:** se elige, persiste al recargar, aplica en Kanban y Tabla y conserva el acento de prioridad; el espacio del cliente no tiene selector.
- **Dashboard:** sin «Por Tipo»; cifras exactas de los fixtures; urgencias por prioridad solicitada con el histórico aparte; bloque de menos de 420 px.
- **TI:** las etiquetas nuevas y el inicio de sesión sin cambios.

Pruebas existentes adaptadas al comportamiento pedido:

- `ux-four-areas`: sin casilla de urgencia; «Urgente» con `urgent_requested=false`; título «Urgencias solicitadas».
- `portal-navigation`: el importador Planner elige el área del catálogo cuando existe.
- Fixtures: estudio PROCONT ficticio con código canónico y dos áreas.
- «Acceso del equipo de TI» en todas las suites y en el harness.

No se debilitó ninguna aserción de seguridad ni de contrato.

## 5. Comparativas

- [`screenshots/antes/`](screenshots/antes/) (`3ec6659`) y [`screenshots/despues/`](screenshots/despues/): 36 + 36 capturas con el mismo nombre. Cubren portal, modal de acceso TI, nuevo ticket, detalle, dashboard, bandeja, modal de validación, Kanban y Tabla, en claro y oscuro, a 1440 y 390 px.
- [`screenshots/nuevas/`](screenshots/nuevas/): 10 capturas (acceso TI, panel «Mi color de tarjeta», Kanban y Tabla con color personal, validación PROCONT con área), en los dos temas.
- [`screenshots-manifest.json`](screenshots-manifest.json): fase, tema, área, pantalla, resolución, versión, fecha y sha256.

## 6. Hallazgos pendientes y límites

1. **Área por código (no por estudio).** Si la regla debe excluir ARAPA, DISFARMADENT, etc. (códigos del mismo estudio), el servidor lo impide hoy, porque exige área a todo el estudio. Requiere autorización de backend.
2. **Color personal limitado al navegador.** No existe una tabla de preferencias. Para compartirlo con el equipo hace falta un cambio en Supabase.
3. **«Historial de urgencias» del modal de validación** sigue usando la RPC de la casilla histórica (`metrics_requester_urgency`). Cambiarlo requiere una RPC nueva.
4. **Volumen.** Las lecturas del Dashboard heredan el límite de filas de PostgREST, como antes. Con más volumen haría falta una RPC agregada.
5. **Áreas en el modal de nuevo proyecto (interno, sin estudio):** se conserva el selector de áreas para trabajo interno, que pertenece a PROCONT.
6. **JavaScript:** los tres recorridos en WARN de siempre. El Kanban sube 4,8 KiB por el selector de color.
7. Pruebas en Chromium emulado, con datos ficticios.

## 7. Backend

Sin cambios en `supabase/**`, SQL, migraciones, RPC, RLS, Edge Functions, datos, autenticación, contratos, variables de Vercel ni dependencias. Solo se leen tablas que el panel ya leía.
