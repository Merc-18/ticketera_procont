# Las 19 instancias conservadas del gate Taste

> **Cierre autorizado posterior:** el usuario aprobó conservar el diseño y documentar las
> excepciones. La [clasificación operativa final](#clasificación-operativa-final-autorizada)
> al final de este documento es la vigente. Se conserva la primera matriz como registro
> de la revisión anterior; no se borran sus dudas ni se presenta un nuevo gate.

Fecha: 20/11/2026. Base: `6533b27`. Skill: `design-taste-frontend` 2.5.1.

Fuente íntegra: [taste-gate.log histórico](../ux-ui-four-areas/taste-gate.log).
Resultado: **GATE: OPEN 19 (rounds used up)**. No se reinició ni volvió a ejecutar.
Las 19 instancias tienen 11 identificadores distintos; la numeración de esta tabla solo
desambigua instancias, no pretende crear identificadores oficiales de la skill.
El log examina `/portal`, principalmente a 1440 y 390 px; no representa un análisis
automático de todas las pantallas. Su versión antigua permanece en el log como evidencia.

**REAL** significa que la estructura incumple literalmente esa regla de Taste, no que
se haya demostrado una incidencia de usuario. **FALSO POSITIVO** requiere una razón
de clasificación o una excepción explícita de las referencias. **NO DETERMINADO**
evita atribuir un resultado sin resolver su aplicabilidad. La severidad es de revisión UX,
no la etiqueta FAIL del checker. Todas las pantallas de la tabla son el portal, salvo el
pie de versión, componente compartido observado allí.

| # | Identificador exacto | Hallazgo y componente/elemento | Aplicabilidad a SaaS | Problema real de UX/UI | Clasificación | Severidad | Recomendación acotada |
|---:|---|---|---|---|---|---|---|
| 1 | `hero-fill` | `PublicLanding`, `.portal-options` visible a 336 px, antes de terminar el primer viewport | Regla formal de composición de página software; no es exclusiva de comercio | No demostrado: los accesos operativos visibles son útiles | REAL | Baja, formal | Conservar los accesos según dirección aprobada; documentar excepción, sin ocultarlos bajo un hero |
| 2 | `flush` | Primera `.portal-option` medida a 0 px del borde superior de `.portal-options` | La separación/padding sí aplica a SaaS | No: el checker usa el contenedor de la fila y no el padding interno de la tarjeta | FALSO POSITIVO | Sin defecto acreditado | Mantener padding interno 32 px escritorio / 24 px móvil; `cards.md:23–36` lo permite |
| 3 | `cta` | `.portal-heading` sin botón dentro del encabezado | Regla formal para software; recetas de hero con CTA | No demostrado: las tres acciones están inmediatamente debajo | REAL | Baja, formal | No duplicar una acción ni añadir una cuarta opción |
| 4 | `cta` | `.public-footer` termina sin botón | Patrón de cierre promocional, de utilidad limitada en un portal operativo | No demostrado | REAL | Baja, formal | Conservar copyright y las tres acciones existentes; registrar excepción de cierre |
| 5 | `moment-none` | La página carece de un momento escénico asignado | Taste exige un momento también a páginas software | No demostrado: introducir una escena no mejora necesariamente esta tarea frecuente | REAL | Baja, formal | Mantener microinteracciones funcionales aprobadas y la restricción más estricta de Emil |
| 6 | `hero-screen` | `.portal-heading` termina a 288 px, no a 900 px | La regla de una pantalla es explícita, también para software | No demostrado | REAL | Baja, formal | No ampliar el encabezado solo para retrasar la navegación |
| 7 | `hero-screen` | `.portal-options` ocupa parte del primer viewport | Misma regla, otra instancia | No demostrado | REAL | Baja, formal | Conservar acciones visibles; no contar esta instancia como otro defecto funcional |
| 8 | `section-height` | `BuildVersion`, footer de 36 px clasificado como sección de una pantalla | El pie de metadatos no es una sección de contenido | No: ampliarlo taparía o desplazaría contenido sin beneficio | FALSO POSITIVO | Sin defecto acreditado | Mantener pie compacto con versión real |
| 9 | `section-height` | `.public-footer`, copyright de 45 px tratado como sección | El copyright no es una sección de contenido de una pantalla | No | FALSO POSITIVO | Sin defecto acreditado | Conservar metadatos compactos, sin contenido de relleno |
| 10 | `section-air` | Copyright medido como sección vacía/0 % de ocupación | Error derivado de tratar metadatos como sección narrativa | No | FALSO POSITIVO | Sin defecto acreditado | No inventar contenido para alcanzar una ocupación de 55 % |
| 11 | `one-section` | Encabezado y accesos conviven en el primer viewport | Taste impone literalmente una sección por pantalla | No demostrado en este portal operativo | REAL | Baja, formal | Conservar composición aprobada y documentar desviación |
| 12 | `one-heading` | `.portal-options` contiene tres `h2`, uno por acceso | La skill exige un h2 por sección; títulos de tarjetas son una estructura SaaS válida | No demostrado; no implica por sí solo una jerarquía accesible rota | REAL | Baja, formal | Mantener nombres claros por acceso; no quitar semántica solo para reducir conteo |
| 13 | `container-edges` | `div#root` superior fuera del esqueleto estático exigido | La receta HTML no establece por sí sola cómo adaptar un root de React existente | No determinado | NO DETERMINADO | Pendiente de interpretación | Conservar React y landmarks; no alterar estructura funcional para aparentar PASS |
| 14 | `container-edges` | `.portal-heading` no tiene un único hijo en flujo `.wrap` | Regla estructural explícita, no solo comercial | No se observa desalineación visible por esa ausencia | REAL | Baja, formal | Registrar diferencia literal; no cambiar layout aprobado sin evidencia de mejora |
| 15 | `container-edges` | `.portal-options` sin `.wrap` hijo único; el log agrupa también copyright y versión | Parte de la receta estructural para páginas software | No demostrado; la parte de metadatos comparte el problema de clasificación de 8–10 | REAL | Baja, formal | Mantener fila y límites existentes; conservar la instancia agrupada sin inflar el número |
| 16 | `container-edges` | Título de la tercera tarjeta, «Rastrear Solicitud», a 902 px del contenedor | `layout-v4.md:220–223` admite columnas y excluye texto interior de tarjetas de la línea global | No | FALSO POSITIVO | Sin defecto acreditado | Mantener tercera columna y padding; no alinear los tres títulos en una misma coordenada x |
| 17 | `container-edges` | Título de la segunda tarjeta, «Mis tickets», a 468 px | Misma excepción de columnas y texto interior | No | FALSO POSITIVO | Sin defecto acreditado | Mantener segunda columna |
| 18 | `container-edges` | Primer título, «Nueva Solicitud», a 33 px del borde | `cards.md:23–36` requiere padding; `layout-v4.md:223` excluye texto interno de la línea de página | No | FALSO POSITIVO | Sin defecto acreditado | Mantener padding de tarjeta |
| 19 | `no-visual` | `.portal-options` móvil sin fotografía/efecto/mock reconocido | La receta de feature exige visual y el propio log admite iconos reales; hay SVG de navegación, no una ilustración de producto | No determinado: no está demostrado que una imagen adicional ayude a estas tres acciones | NO DETERMINADO | Pendiente de interpretación | Conservar iconos claros; no añadir una maqueta o efecto decorativo para superar el detector |

Totales: **10 REAL formales, 7 FALSO POSITIVO, 2 NO DETERMINADO**.

Las referencias `cards.md` y `layout-v4.md` son archivos de la skill extraída, no documentos
del producto. `SKILL.md` incluye expresamente App/SaaS y la regla de una sección por
pantalla: no se justifica descartar todas sus reglas como una plantilla exclusivamente
comercial. La falsa detección de tarjetas y metadatos se argumenta individualmente.
Emil recomienda no animar tareas frecuentes ni introducir movimiento sin propósito.
La aprobación visual del usuario conserva la distribución actual y permite estas
excepciones metodológicas, pero no transforma el resultado automático en PASS.

No se modificó `.taste-skill/gate.json`, no se añadieron waivers al checker y no se
eliminaron las advertencias originales. La lista refleja el log conservado, no una
afirmación de que un gate nuevo sobre este build produciría idénticos números.

## Clasificación operativa final autorizada

Fecha: 20/11/2026. Mismo log y mismos 19 registros; sin ejecutar `gate.mjs`, `--start`,
`--done`, nuevas rondas, waivers o cambios al estado del checker. La autorización de cierre
permite excepciones metodológicas; no convierte el resultado automático en PASS.

La clasificación final distingue **excepción metodológica justificada**, **falso positivo**
y **hallazgo real pendiente**. Los dos casos antes no determinados (13 y 19) se conservan
como excepciones expresas al método, no como falsos positivos demostrados. No se afirma
haber resuelto automáticamente su aplicabilidad. No hay un defecto UX real demostrado
pendiente dentro de estos 19 registros; esto no equivale a certificar accesibilidad completa.

Evidencias comunes:

- **L:** [log original sin editar](../ux-ui-four-areas/taste-gate.log).
- **D:** [portal desktop del build final](../ux-ui-performance-close-20261120/screenshots/desktop-01-portal.png).
- **M:** [portal móvil del mismo build](../ux-ui-performance-close-20261120/screenshots/movil-01-portal.png).
- **P:** [componente PublicLanding](../../../src/components/requests/PublicLanding.tsx).
- **V:** [pie de versión](../../../src/components/ui/BuildVersion.tsx).
- Referencias de Taste leídas: `SKILL.md` reglas 3 y 5 y §1/§4.0; `layout-v4.md:220–223`;
  `cards.md:23–36`; `gate.md`. Emil: frecuencia, propósito, feedback y movimiento reducido.

| # / identificador | Regla de Taste | Pantalla / componente | Motivo y aplicabilidad SaaS | Clasificación final y justificación | Impacto UX/UI / evidencia |
|---|---|---|---|---|---|
| 1 `hero-fill` | Hero ocupa el primer viewport sin sección siguiente | `/portal`, `PublicLanding .portal-options` | La regla aplica literalmente a software; las tres acciones aparecen en la primera pantalla | **Excepción metodológica justificada**: portal operativo aprobado, no ocultar su navegación bajo un hero de 100svh | Mantiene acceso directo a las tres tareas; L, D, M, P |
| 2 `flush` | Separación al cambiar de superficie | `/portal`, primera `.portal-option` | Sí aplica a SaaS; el detector mide el borde de la fila como si fuera el texto dentro de la tarjeta | **Falso positivo**: existe padding interno; `cards.md` prescribe padding de 32/24 px | Sin texto pegado al borde de la tarjeta; L, D, M, P y `src/index.css` |
| 3 `cta` | Botón dentro del hero | `/portal`, `.portal-heading` | Regla literal para software; acciones en el bloque inmediato posterior, no dentro del heading | **Excepción metodológica justificada**: no duplicar Nueva Solicitud ni añadir otra opción | La acción sigue visible y operativa; L, D, M, P |
| 4 `cta` | Cierre termina con un botón | `/portal`, `.public-footer` | Patrón narrativo/promocional con utilidad limitada para este portal de tareas | **Excepción metodológica justificada**: conservar copyright y tres accesos, sin CTA de venta o duplicado | Evita una acción redundante; L, D, M, P |
| 5 `moment-none` | Un momento escénico asignado por página software | `/portal`, página | Taste incluye SaaS; no hay momento escénico, sí feedback funcional | **Excepción metodológica justificada**: usuario conserva dirección actual y Emil restringe movimiento frecuente sin propósito | No se retiran animaciones aprobadas ni se añade una escena distractora; L, D, M y pruebas de motion |
| 6 `hero-screen` | Hero exactamente una pantalla | `/portal`, `.portal-heading` | No cumple altura literal; regla aplicable al plan de página software de Taste | **Excepción metodológica justificada**: la cabecera compacta permite ver las tareas inmediatamente | No obliga a hacer scroll para comenzar; L, D, M, P |
| 7 `hero-screen` | Nada posterior al hero en el primer viewport | `/portal`, `.portal-options` | Segunda instancia de la misma decisión de composición | **Excepción metodológica justificada**: conservar accesos visibles aprobados | No constituye un segundo defecto funcional; L, D, M, P |
| 8 `section-height` | Secciones de una o dos pantallas | `/portal` y pie compartido, `BuildVersion` | La versión es metadato del pie, no una sección narrativa de contenido | **Falso positivo**: clasificación de componente incorrecta; no extender 36 px a 900 px | Pie compacto sin ocupar el área de trabajo; L, D, M, V |
| 9 `section-height` | Secciones de una o dos pantallas | `/portal`, copyright | La línea legal es metadato, no una sección de contenido | **Falso positivo**: no requiere una pantalla propia | No introduce espacio vacío artificial; L, D, M, P |
| 10 `section-air` | Ocupación mínima del 55 % por sección | `/portal`, copyright | Deriva de considerar la línea legal una sección vacía | **Falso positivo**: base de medición inadecuada para metadatos | No se rellena la página con información inventada; L, D, M, P |
| 11 `one-section` | Un único bloque de sección por viewport | `/portal`, heading y opciones | Incumplimiento formal; SaaS está incluido en la regla | **Excepción metodológica justificada**: un encabezado más tres accesos es la composición operativa aprobada | Comprensión conjunta de propósito y acciones; L, D, M, P |
| 12 `one-heading` | Un h2 por sección | `/portal`, tres títulos de acceso | La receta agrupa tarjetas como una sección; cada tarjeta tiene título propio | **Excepción metodológica justificada**: conservar semántica y nombres de las tres opciones, sin alterar diseño | No se demostró fallo de navegación por encabezados; L, D, M, P |
| 13 `container-edges` | Esqueleto de header/main/footer sin div superior | `/portal`, `div#root` de React | La receta estática no encaja directamente con el root existente; §4.0 exige conservar el stack | **Excepción metodológica justificada**: antes NO DETERMINADO; se conserva explícitamente React y sus landmarks. No se declara falso positivo medido | Sin cambio de framework ni estructura funcional por el checker; L, `index.html`, `src/main.tsx`, D, M |
| 14 `container-edges` | Exactamente un hijo `.wrap` por sección | `/portal`, `.portal-heading` | Difiere la estructura literal, aunque se comparten límites de contenido | **Excepción metodológica justificada**: no cambiar el DOM aprobado solo para satisfacer una clase/receta | Mantiene alineación y responsive observados; L, D, M, P |
| 15 `container-edges` | Un `.wrap` en opciones y bloques agrupados por el log | `/portal`, `.portal-options`, copyright y versión | Incumplimiento estructural de receta; el log agrupa tres bloques en una instancia | **Excepción metodológica justificada**: conservar layout; los metadatos además comparten las razones de 8–10 | No se inventan tres hallazgos adicionales ni se rediseña la página; L, D, M, P, V |
| 16 `container-edges` | h2 en la línea izquierda global | `/portal`, tarjeta Rastrear Solicitud | La tercera columna está desplazada del origen global como corresponde a una grilla | **Falso positivo**: `layout-v4.md:220–223` permite columnas y excluye texto interno de tarjetas de la línea de página | Conserva tercera columna y padding; L, D, P |
| 17 `container-edges` | h2 en la línea izquierda global | `/portal`, tarjeta Mis tickets | Segunda columna válida en la grilla | **Falso positivo**: misma excepción explícita de columnas y texto interno | Conserva alineación de la segunda tarjeta; L, D, P |
| 18 `container-edges` | h2 al ras del contenedor global | `/portal`, primera tarjeta | Desplazamiento por padding interior requerido en `cards.md` | **Falso positivo**: padding no es desalineación de la página | No se pega el texto al borde para pasar el detector; L, D, M, P |
| 19 `no-visual` | Feature con fotografía, efecto o UI de producto reconocible | `/portal`, `.portal-options` móvil | Son accesos operativos con SVG Lucide, no una sección comercial de features. La detección original de visual no es concluyente | **Excepción metodológica justificada**: antes NO DETERMINADO; usuario aprueba iconos y navegación. No se declara falso positivo ni se añade una maqueta decorativa | Mantiene acciones claras, sin imágenes que desplacen navegación; L, M, P e `Icon.tsx` |

Balance de cierre: **12 excepciones metodológicas justificadas, 7 falsos positivos,
0 hallazgos UX reales demostrados pendientes dentro de este conjunto**. El log mantiene
sus 19 FAIL abiertos. Esta decisión manual documentada no modifica el gate.
El presupuesto de rendimiento se valida por separado en el
[informe de cierre](../ux-ui-performance-close-20261120.md): no se confunde un presupuesto
de JS cargado conforme con una aprobación automática global de Taste.
