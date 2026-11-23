# Sistema de color de Boards (D-042)

## Tres conceptos, tres canales

| Concepto | Canal visual | Nunca usa |
|---|---|---|
| **Prioridad** (importancia administrativa) | Insignia **en relleno** + **borde superior de 3 px** de la tarjeta + acento del filtro | El borde lateral ni el tinte de fondo |
| **Responsable** (color personal, D-043) | **Franja lateral de 4 px** + anillo del avatar | El borde superior ni las insignias |
| **Estado** (situación del trabajo) | Insignia de estado **en tinte o contorno**; bloqueo con tinte rojo de fondo y borde rojo | El borde lateral ni el superior |

Regla clave: **la prioridad va en relleno y el estado en tinte o contorno.** Así «Medio» (relleno azul) y «Trabajo en proceso» (tinte azul) nunca coinciden. Antes, la tarjeta bloqueada usaba el borde lateral rojo; ahora ese lado es del responsable y el bloqueo se lee por el tinte, el borde y el texto «Bloqueado».

## Prioridad

| Prioridad | Insignia (claro / oscuro) | Acento superior (claro / oscuro) | Texto sobre la insignia |
|---|---|---|---|
| Urgente | Relleno rojo `#B91C1C` / `#DC2626` | `#B91C1C` / `#EF4444` | Blanco 6,47:1 / 4,62:1 |
| Alto | Relleno dorado Procont `#EEBB31` | `#EEBB31` | Tinta `#0F172A` 10,02:1 |
| Medio | Relleno azul corporativo `#1E3A8A` / `#2563EB` | `#1E3A8A` / `#3B82F6` | Blanco 9,9:1 / 4,94:1 |
| Bajo | Contorno neutro visible (borde 4,55:1 / 3,92:1) | sin acento (borde normal) | Tinta 14:1 / 12:1 |

Aplicado en:

- insignias de la tarjeta;
- acento de la tarjeta;
- filtro de prioridad (franja del color elegido en el `select`);
- detalle del ticket (selector de prioridad del modal);
- Tabla (insignia);
- barras del Gantt, punto del Roadmap y gráfico del Dashboard (`PRIORITY_BAR`).

Los textos siguen en español: Bajo, Medio, Alto y Urgente.

## Estados (sin cambios desde D-040)

| Estado | Tratamiento |
|---|---|
| Recibida | Tinte neutro |
| En revisión | Tinte dorado |
| Aprobada | Contorno azul |
| En proceso | Tinte azul |
| Bloqueado | Tinte rojo |
| Terminado / Completado | Tinte verde |
| Rechazada | Contorno rojo |

## Taste y Emil

- **Taste:** «estado en visuales» con color funcional, sin pintar la tarjeta entera; un solo acento por canal. No se añadieron colores fuera de la paleta oficial y sus derivados; sin violeta.
- **Emil:** los cambios de color se hacen con las transiciones existentes de 150 ms, sin animaciones nuevas; el arrastre no cambia.

## Contraste

Los 84 pares medidos desde el CSS compilado cumplen (`data/contrast-measurements.json`). El acento dorado sobre la tarjeta clara (1,78:1) es informativo: la prioridad siempre va también en la insignia con texto.
