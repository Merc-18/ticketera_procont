# Corrección de distribución del color (23/11/2026)

**Veredicto: APROBADO CON OBSERVACIONES.** Rama local `color-distribution-20261123` sobre `main` publicada (`afc112e`). Commit local, **sin push, merge ni despliegue**. Decisión registrada como D-040. Diagnóstico previo: [página de comparación](https://claude.ai/artifact/7KTeGAHvjK93pND9G4pMXZ).

## 1. Resumen ejecutivo

El modo oscuro era monocromático en sentido literal: el **99 % del área** caía en un solo matiz (azul 261–266°), porque fondo, tarjetas, tintes y acento compartían color.

La corrección no añade colores nuevos. Hace tres cosas:

- pasa las superficies oscuras a **grafito con sesgo azul**, de modo que la banda navy, el azul de acción y el dorado vuelven a contrastar por matiz;
- da **profundidad** real: columnas y filtros hundidos, tarjetas elevadas;
- asigna a cada color oficial un **trabajo funcional**: KPIs, estados sin colisiones, prioridad por intensidad y dorado para la atención.

| Área de fondo, oscuro (12 vistas a 1440) | Antes | Después |
|---|---|---|
| Navy / tinte azul | **50,9 %** | **6,9 %** (banda y tintes funcionales) |
| Neutro (grafito) | 47,6 % | 91,6 % (Taste: 90–95 %) |
| Azul de acción · dorado · rojo · verde | 0,81 · 0,15 · 0,42 · 0,15 % | 0,86 · 0,17 · 0,41 · 0,15 % |
| Marcas doradas en el dashboard (elementos) | 2 | 8 |

El área de color de acento casi no cambia, y es a propósito: lo que cambia es que ahora se distingue del fondo. En claro, la proporción sigue igual (93 % neutro).

## 2. Fase 1: qué se sentía monocromático (por área)

| Área | Antes | Corrección |
|---|---|---|
| Dashboard | Seis KPIs idénticos. El borde de color existía (`border-t-2 border-green-700`…) pero `.enterprise .stat-card { border }` lo anulaba por especificidad. «Bloqueados 1» se veía como «Total 8» | Icono en tinte funcional por métrica; cifra roja solo si hay bloqueados o vencidos; dorado para Cycle/Lead Time |
| Tarjetas / Kanban | Columna y tarjeta con el mismo relleno; solo las separaba el borde | Columna en el fondo **alterno** (hundido), tarjeta en superficie **elevada** |
| Panel interno | Superficies navy sobre fondo navy; el contador de pendientes en rojo de error | Grafito + banda navy; contador **dorado** (atención, no error) |
| Bandeja | Estados vacíos grises genéricos; contador rojo | Estado vacío con icono en tinte y fondo alterno; contador dorado |
| Gantt / Roadmap / Tabla | «Hoy» en el rojo de peligro; prioridad con poca diferencia | «Hoy» en dorado (la fecha marcada); prioridad por intensidad |
| Mis tickets | «En proceso» = «Aprobada»; «Rechazada» = «Bloqueado» (mismo tinte); vacío plano | Siete estados con siete apariencias; vacío con icono azul |
| Portal | Tarjetas navy sobre navy | Tarjetas grafito: el filo y el icono dorados de «Nueva Solicitud» y el icono azul de «Rastrear Solicitud» ganan presencia sin cambiar la composición |

## 3. Qué se corrigió exactamente (solo frontend)

| Cambio | Archivos |
|---|---|
| Superficies oscuras: página `#0B0F16` → alterno `#0F141C` → superficie `#131A26` → elevada `#1A2230`; línea `#283143`; tinte suave `#14213F`. Escalas `gray` por rol en grafito | `src/index.css`, `src/theme/themes.ts` |
| Tokens nuevos: `--p-alt` (claro `#F1F5F9`, oscuro `#0F141C`), `--elevated`, `--success-bg`, `--gold-ink`; utilidad `bg-elevated` | `src/index.css`, `tailwind.config.ts` |
| Profundidad: columnas del Kanban y barras de filtros (dashboard, bandeja, tablero) en alterno; tarjeta del Kanban en elevada | `src/index.css`, `ProjectCard.tsx` |
| KPIs con tono funcional (`.kpi-tile .tone-*`): azul (totales, activos), verde (completados), neutro (archivados), rojo **solo si > 0** (bloqueados, vencidos), dorado (Cycle/Lead Time) | `DashboardView.tsx`, `src/index.css` |
| Estados sin colisiones (ver la tabla siguiente) | `src/lib/request-status.ts` |
| Prioridad por intensidad: Urgente rojo sólido, Alto dorado sólido, Medio tinte azul, Bajo contorno neutro | `src/lib/constants.ts` |
| Dorado como atención: contador de pendientes, línea y leyenda «Hoy», punto de fase actual | `App.tsx`, `GanttView.tsx`, `ChecklistSection.tsx` |
| Estados vacíos (`.empty-state`): bandeja (3) y Mis tickets | `RequestInbox.tsx`, `MyTickets.tsx`, `src/index.css` |
| `theme-color` oscuro `#0B0F16` | `index.html`, `src/lib/theme.ts`, prueba del tema |

| Estado | Antes | Después |
|---|---|---|
| Recibida | neutro | neutro |
| En revisión | amarillo (= Bloqueado) | **dorado** (atención) |
| Aprobada — En backlog | tinte azul (= En proceso) | **contorno azul** |
| Trabajo en proceso | tinte azul | **tinte azul más firme** |
| Bloqueado | amarillo (y rojo en el Kanban) | **tinte rojo**, igual en el chip y en el Kanban |
| Terminado | verde | verde |
| Rechazada | tinte rojo | **contorno rojo** |

## 4. Decisiones de color y por qué

- **Grafito en lugar de navy uniforme.** El monocromatismo venía de que fondo y acento compartían matiz. Con croma ≈ 0,02 el fondo vuelve a ser neutro, y el navy queda donde significa «Procont»: la banda corporativa y los tintes de selección.
- **Más protagonismo del azul sin más área.** El azul ahora destaca porque es lo único azul saturado: botón primario, pestaña activa, barras, KPIs de trabajo, «en proceso». Se mantiene también en títulos y cabeceras de tabla, que ahora se leen como módulos sobre el grafito.
- **Dorado con intención.** Solo donde algo pide atención o marca un momento: pendientes, prioridad alta, «Hoy», fase actual, en revisión y tiempos del ciclo. Pasa de 2 a 8 marcas en el dashboard y sigue muy por debajo del 3 % de Taste. En claro, siempre como relleno con tinta oscura, nunca como texto (1,7:1 sobre claro).
- **Rojo solo cuando hay algo que mirar.** La cifra de «Bloqueados»/«Vencidos» se vuelve roja con 1 o más casos; con 0 es neutra.
- **Prioridad por intensidad, conservando el azul para «Medio».** Se pidió más presencia del azul, así que «Medio» mantiene su tinte azul. La escala se lee por peso: relleno (urgente, alto), tinte (medio), contorno (bajo).
- **Sin colores nuevos.** Todos los valores son de la paleta oficial o de sus derivados ya aprobados (escalas blue, yellow, red y green del sitio y grafito de la escala slate). Áreas y tipos siguen sin paleta propia, y no hay violeta.

## 5. Criterios de Taste aplicados (`system.md`, `cards.md`)

- «The interface stays 90 to 95% neutral»: el oscuro pasa de 47,6 % a **91,6 %** de neutro real.
- «One accent at most … primary button, focus ring, links, state in visuals, small marks and the one brand band; under 3% elsewhere»: azul en acción y estado; dorado como marca pequeña y atención; navy como banda.
- «Fill `--card`, one clear step off the page»: página → alterno → superficie → elevada. La tarjeta del Kanban queda un escalón sobre su columna (1,10:1 en claro, 1,16:1 en oscuro).
- «Border 1px, ink at 8 to 14%; inner top highlight 1px (dark only); no blurred shadow at rest»: se conserva, con la línea grafito `#283143`.
- «State in visuals» y «Never a row of green dots»: los tonos van en tintes de icono y chip, nunca en filas de puntos saturados; el rojo aparece solo con casos.
- «Highlight by contrast»: la cifra en alerta cambia de color, no de fondo.
- «Never violet»: 0 colores en 255–320° entre los 36 (claro) y 54 (oscuro) renderizados.
- Composición del portal y gate: sin cambios. El gate sigue en **OPEN 14** y no se reinicia.

## 6. Criterios de Emil aplicados (`emil-design-eng`)

- **Cohesión.** «A professional dashboard should be crisp and fast»: no se añadió ninguna animación. El color de estado cambia con las transiciones de 150 ms existentes, y con teclado de forma inmediata.
- **«Should this animate at all?»** Los KPIs, estados vacíos y chips no animan su aparición (Emil: lo que se ve muchas veces al día no se anima).
- **Movimiento reducido** y presión (`scale(.98)`) iguales que antes, medidos en la re-auditoría.
- Emil casi no trata el color. Su aporte aquí es la regla de cohesión y la de no animar lo frecuente; la distribución cromática se decidió con Taste.

## 7. Qué quedó igual a propósito

- Banda corporativa, portal claro, tipografía, radios, iconografía Lucide, selector de tema, seguimiento integrado y estructura de las cuatro áreas.
- Títulos y cabeceras de tabla en azul de marca (refuerzan el protagonismo del azul que se pidió).
- Pestaña activa en relleno azul.
- Gráficos de tipo y área en azul.
- Áreas y tipos sin colores por categoría.
- CSV y datos.

## 8. Hallazgos y límites

1. **Gate Taste:** OPEN 14, sin rondas nuevas (agotadas y prohibido reiniciar). La verificación es la re-auditoría y la medición de tokens.
2. **Modo claro con cambios intencionales:**
   - columna del Kanban `#F1F5F9` y tarjeta `#FFFFFF`;
   - barras de filtros en alterno;
   - KPIs con tinte;
   - estados y prioridades nuevos;
   - contador y «Hoy» en dorado.

   El resto del claro aprobado no cambia (93 % neutro igual que antes).
3. **El área de azul no sube:** su protagonismo es perceptivo (contraste de matiz), no de superficie, porque Taste limita el acento.
4. **Presupuesto JS:** la bandeja queda en **449,9 KiB** (PASS, a 0,1 del límite). Un cambio futuro en el bundle inicial podría devolverla a WARN.
5. Pruebas solo en Chromium emulado, con datos ficticios; sin publicar.

## 9. Validación

| Comprobación | Resultado |
|---|---|
| TypeScript y build | PASS |
| Unitarias Node | **173/173** |
| UI (tema, seguimiento, portal, cuatro áreas) | **81/81** (6 omitidas: solo corren con build y se cubren en la fila siguiente) |
| UX sobre build de producción | **36/36** |
| Contraste de tokens desde el CSS compilado | **71/71** pares (15 nuevos: iconos de KPI ≥ 4,58:1, cifras en alerta, chips sólidos, contornos, estados vacíos, escalones) |
| Re-auditoría | 120 + 120 pantallas: textos bajo 4,5:1, lectura < 16 px, campos sin etiqueta, saltos de encabezado, desbordamiento (incluido 320 px) y emoji en **0** en los dos temas; h1 120/120; foco 58/58; presión y movimiento reducido iguales |
| Violeta | 0 |
| Backend | Sin cambios en `supabase/**`, SQL, RPC, RLS, Edge Functions, datos, autenticación, contratos ni dependencias |
| JS por recorrido | Portal 396,7 · dashboard 433,4 · bandeja 449,9 en PASS; los mismos 3 WARN de antes (< 900) |

## 10. Evidencia

- [`screenshots/antes/`](screenshots/antes/) (`afc112e`) y [`screenshots/despues/`](screenshots/despues/): 44 + 44 capturas con el mismo nombre. Cubren portal, seguimiento, Mis tickets, dashboard, bandeja, Kanban, tabla, Gantt, roadmap, modal de proyecto y equipo, en claro y oscuro, a 1440 y 390 px.
- [`screenshots-manifest.json`](screenshots-manifest.json): fase, tema, área, pantalla, resolución, versión, fecha y sha256 de cada captura.
- [`data/`](data/): re-auditorías, mediciones de contraste y logs.
- [`SHA256SUMS`](SHA256SUMS).
