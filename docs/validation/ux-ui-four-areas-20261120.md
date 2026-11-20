# Rediseño UX/UI de las cuatro áreas

> **Evidencia histórica.** Los ajustes posteriores y la galería unificada de 84 capturas
> están en [Ajustes finales UX/UI](ux-ui-final-adjustments-20261120.md).
> Ese informe actualiza versión, pruebas, presupuesto y clasificación individual de Taste.
> La descripción anterior de «reglas comerciales» no clasifica por sí sola los 19 casos:
> Taste también incluye SaaS; véase la matriz nueva. Se conserva lo siguiente como histórico.

Tipo: software; aplicación SaaS operativa existente, sin página comercial nueva.
Base: `6533b277e9022bf3bb9a64bff02d2e4cdbfc52d5`. Revisión: 20/11/2026.

## Metodologías leídas

ZIP Taste: `taste-skill-main.zip`, skill `design-taste-frontend`, versión 2.5.1.
ZIP Emil: `skills-main.zip`, skill `emil-design-eng`.
Ambos se extrajeron en directorios temporales separados y se leyeron completos.
Referencias utilizadas: Taste `copy`, `copy-voice`, `copy-registers`, `copy-moves`,
`copy-tells`, `system`, `layout-v4`, `sections`, `cards`, `motion`, `icons`, `perf`, `gate`;
Emil `choreograph/SKILL.md` y `RECIPES.md` para decidir qué permanece estático.

Taste asignó primero `host`: Host Grotesk + JetBrains Mono. Se usa esa combinación,
con fuentes locales, `font-display: swap`, pesos 400/500 y sus licencias OFL.
La paleta asignada se sustituye por la paleta Procont por instrucción expresa del usuario:
`#173D66`, `#D5AE54`, `#E8EEF5`, `#F8FAFC`, `#334155`.
Radio soft: controles 8 px, paneles 12 px, superficies principales 20 px.
Espaciado compartido: 4, 8, 12, 16, 24, 32, 48, 64 px.
Voz: hechos, etiquetas y mensajes existentes; sin promesas, cifras ni funciones inventadas.

Las recetas comerciales de Taste (precios, fotografías, héroes de varias pantallas,
escenas WebGL y momentos de desplazamiento) no sustituyen los flujos de la aplicación.
Prevalecen el alcance funcional del usuario y la restricción más estricta de Emil:
interfaz operativa sin bucles decorativos, sin animar listas frecuentes ni acciones de teclado.
Se conservan colores semánticos y datos históricos, aunque no coincidan con una paleta comercial.

## Composición por área

| Área | Composición y jerarquía | Material real |
|---|---|---|
| Portal | Cabecera institucional, título alineado, tres accesos completos y claramente distinguibles | Las tres operaciones existentes, logo oficial |
| Ingreso | Selección de proveedor en dos superficies equivalentes; formulario legible, sin campos adicionales | Quipu y QuipuFac; búsqueda pública existente |
| Tickets | Navegación persistente, formulario agrupado, adjuntos con límites visibles, tabla y tarjetas móviles | Campos, productos, datos y confirmación existentes |
| Interno | Cabecera Enterprise compacta, barra de herramientas, métricas jerarquizadas, ocho columnas y vistas alternativas | Métricas del servidor y operaciones actuales |

## Motion: criterio y tiempos

| Elemento | Papel | Inicio | Duración | Movimiento | Relación |
|---|---|---|---|---|---|
| Botón con puntero fino | Feedback | Al presionar | 100 ms | Escala 0,985 | Solo el control |
| Acceso del portal | Feedback | Hover | 150 ms entrada / 120 ms salida | Elevación 2 px | Contenido junto con la superficie |
| Modal | Principal | Al abrir con puntero | 200 ms | Opacidad y escala 0,98 a 1 | Una entrada por contenedor |
| Selector de proveedor | Estado | Al seleccionar | 0 ms | Indicador inmediato | Sin deslizar ni retrasar campos |
| Foco | Accesibilidad | Al enfocar | 0 ms | Ninguno | Anillo inmediato |

Emil respalda transform/opacity, duración breve, transiciones interrumpibles y ausencia de
animación para teclado; Taste respalda elevación 2 px, feedback de controles y foco inmediato.
La interfaz no retrasa ni modifica operaciones de red. Listas, métricas, progreso, cambios de
ruta y contenido de tabs permanecen estáticos por frecuencia. Bajo reduced-motion se
eliminan movimiento y animación; todo el contenido permanece visible.

## Evidencia de validación

[Galería completa: 65 capturas y logs](ux-ui-four-areas/README.md).
[Lista de archivos](ux-ui-four-areas/changed-files.md).
[Requisitos funcionales conservados](../specs/PRODUCT_REQUIREMENTS.md).

| Validación | Resultado | Naturaleza |
|---|---|---|
| Node existente | 171/171 PASS | Unitarias y contratos con simulación |
| React/Chromium conjunto | 45/45 PASS, sin omisiones | Navegador y React reales, servicios locales simulados |
| Portal tras clase compartida wrap | 8/8 PASS | Solo comprobación afectada, sin repetir el resto |
| TypeScript de aplicación | PASS | Incluido en npm run build |
| Contrato TypeScript estricto | PASS, salida 0 | Comprobación estática adicional |
| npm run build | PASS | Advierte chunk >500 kB; no se cambió la aplicación para silenciarlo |
| Comparación de alcance | PASS | 18 handlers y 388 atributos funcionales conservados; cero archivos protegidos cambiados |
| Responsive | PASS local en cuatro resoluciones | Sin overflow del documento; las regiones Kanban/Tabla/Gantt mantienen scroll accesible |
| Gate Taste | OPEN, 19 hallazgos pendientes de evaluación | No se declara PASS; reglas comerciales incompatibles con la aplicación operativa |
| Presupuesto JS de Taste | FAIL heredado, sin nueva dependencia | Misma base sobre 900 KiB; diferencia UX +2.244 bytes en build equivalente |

No se realizaron operaciones remotas ni logins reales. Las contraseñas utilizadas en pruebas
son ficticias del simulador. No se ejecutaron pruebas PostgreSQL ni se operó Supabase.

## Aplicación de cada metodología

| Área | Taste | Emil |
|---|---|---|
| Portal | Bordes iguales, jerarquía tipográfica, iconos legibles, tres superficies alineadas y una acción principal reconocible | Hover 2 px con puntero fino y pulsación; ninguna entrada que oculte accesos |
| Ingreso | Proveedores equivalentes, selección con borde e indicador, formulario sobre superficie separada | Selección instantánea, mostrar/ocultar contraseña sin cambiar valor ni validación, errores existentes visibles |
| Tickets | Campos agrupados en dos columnas de escritorio y una móvil, adjuntos diferenciados, número REQ monoespaciado, tabla y tarjetas | Conserva feedback de preparación, envío y reintento; sin animación de listas ni porcentajes ficticios |
| Panel interno | Densidad Enterprise, métricas jerarquizadas, barras de herramientas, columnas y tarjetas consistentes | Foco modal contenido, Escape y devolución del foco; arrastre nativo conservado, sin animar datos frecuentes |

## Revisión Antes / Después (Emil)

| Antes | Después | Motivo |
|---|---|---|
| Portal oscuro con emoji de gran tamaño | Fondo Procont claro y glifos de interfaz compartidos | Identificar las tres operaciones con jerarquía y contraste medio |
| Proveedor no seleccionado atenuado | Ambos métodos legibles, seleccionado con indicador y borde | Comparar métodos sin ocultar información |
| Campo de contraseña fijo | Control de mostrar/ocultar con nombre y aria-pressed | Feedback de un estado visual, sin cambiar el envío |
| Formulario largo a una columna | Agrupación de campos en escritorio; una columna móvil | Reducir desplazamiento y mantener el mismo orden de lectura |
| Selección de tarjeta oculta en reposo | Checkbox visible y número REQ sin cortar | Mejor reconocimiento y operación táctil |
| Modales sin gestión común de foco | ModalFocus para formularios, detalle y confirmaciones | Tab contenido, Escape y retorno al control de origen |
| Transiciones generales y hover táctil | Propiedades concretas, hover solo con puntero fino, teclado instantáneo | Interrupción natural, menos movimiento y sin estados hover pegados |

## Componentes compartidos

Nuevos: `Icon`, `PasswordField`, `InteractionMode`, `ModalFocus`.
Consolidados: `BrandLogo`, `BuildVersion`, `Toaster`, tokens CSS/Tailwind y superficies de formularios,
modales, tablas, tarjetas y barras de herramientas. No se añadieron paquetes ni se actualizaron frameworks.
Las fuentes locales incluyen licencia OFL y los glifos incluyen la licencia Lucide.

## Alcance protegido

Sin diferencias respecto de la base en `supabase/`, `contracts/`, `scripts/`, `src/lib/`,
`src/hooks/`, `src/types/`, `package.json`, `package-lock.json`, `vite.config.ts` y `vercel.json`.
M1–M15 permanecen idénticas. No cambian rutas, handlers de negocio, payloads, permisos,
sesiones, productos ni la lógica de la versión de compilación. El checkout compartido conserva
su rama original y el archivo sin seguimiento `1`; main local/remoto permanecen en `6533b27`.

## Límites de esta entrega

La aceptación automática de la plantilla comercial Taste no se obtuvo; sus 19 hallazgos
están conservados íntegros. El exceso de JavaScript ya existía en la base y no se oculta.
No se afirma conformidad WCAG completa ni validación en dispositivos físicos o servicios remotos.
Se entrega el cambio frontend para revisión local, con estas observaciones visibles.


## Estado de cierre

Implementación local de las cuatro áreas guardada. No se genera commit nuevo mientras
permanezcan las validaciones adicionales abiertas, conforme a la condición del usuario.
Rama `feat/ticketera-ux-ui-four-areas`; HEAD de referencia `6533b27`.
No se realizó push, merge ni despliegue.
