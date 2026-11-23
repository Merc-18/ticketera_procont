# Color personal de tarjeta para usuarios internos (D-043)

## Comportamiento

- **«Mi color de tarjeta»**, en la barra de herramientas de Boards (junto a «Nuevo proyecto»), abre un panel con siete opciones (Sin color, Azul Procont, Celeste, Dorado, Ámbar, Grafito, Pizarra). Incluye una **vista previa** de una tarjeta y una nota sobre dónde se guarda.
- El color se aplica a las tarjetas cuyo **responsable del flujo** (`assigned_to`) es ese usuario:
  - en Kanban, como franja lateral de 4 px y anillo del avatar;
  - en Tabla, como franja en la primera celda.
- Se mantiene al cambiar entre Kanban y Tabla, al recargar y entre pestañas (evento `storage`).
- Funciona en claro y oscuro: cada color tiene su variante oscura.
- **Clientes:** el selector solo existe en el panel interno. El espacio del cliente no lo monta; está comprobado en la prueba.

## Separación de significados

El color personal **no sustituye** a la prioridad (borde superior e insignia) ni al estado (insignia y tinte). Ver BOARD_COLOR_SYSTEM.md. La prueba verifica que la tarjeta con color personal conserva su acento de prioridad de 3 px.

## Persistencia: límite documentado

- **No existe** un mecanismo de preferencias en el backend: `public.users` solo guarda id, email, nombre, rol y estado.
- No se crearon migraciones (no estaban autorizadas).
- La preferencia se guarda en `localStorage` (`ticketera-owner-colors`) como `{ uuid_del_usuario_interno: color }`. Solo se aceptan UUID válidos y colores de la lista; no contiene datos de clientes.
- **Consecuencia:** el color queda en **ese navegador y dispositivo**. En otro equipo, o en el navegador de un compañero, la tarjeta no muestra el color. Si varios usuarios comparten un navegador, cada uno ve los colores que se eligieron ahí.
- Para que el color sea del equipo (visible para todos y en cualquier dispositivo), hace falta una columna o tabla de preferencias en Supabase, con RLS para que cada usuario solo edite la suya. **Requiere autorización de backend.**

## Paleta

Todos los colores son oficiales o derivados aprobados. Sin rojo ni verde (reservados a estados) y sin violeta.

| Color | Claro | Oscuro |
|---|---|---|
| Azul Procont | `#1E3A8A` | `#3B82F6` |
| Celeste | `#60A5FA` | `#93C5FD` |
| Dorado | `#EEBB31` | `#EEBB31` |
| Ámbar | `#A16207` | `#CA8A04` |
| Grafito | `#374151` | `#CBD5E1` |
| Pizarra | `#94A3B8` | `#64748B` |

Algunas franjas tienen menos de 3:1 sobre la tarjeta (celeste, dorado y pizarra en claro). Son informativas, porque el responsable siempre aparece con su nombre e iniciales. Dorado y azul coinciden en tono con «Alto» y «Medio», pero en otro canal (lateral frente a superior e insignia), y lo documento como decisión.

## Accesibilidad

- El panel tiene un `fieldset` con leyenda y opciones de radio con etiqueta visible de 44 px.
- Se cierra con Escape o con clic fuera, y el botón usa `aria-expanded` y `aria-controls`.
