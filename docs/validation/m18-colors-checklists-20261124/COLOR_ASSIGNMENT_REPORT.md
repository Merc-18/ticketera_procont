# Asignación de color personal en el servidor (M18)

## Los 10 colores permitidos

Son los mismos identificadores que `src/lib/card-palette.ts` `OWNER_PALETTE`; una prueba unitaria compara ambas listas. No se añadieron colores ni HEX.

| id | Etiqueta | `sort_order` (orden de autoasignación) |
|---|---|---|
| `azul` | Azul Procont | 1 |
| `celeste` | Celeste | 5 |
| `celeste-oscuro` | Celeste intenso | 7 |
| `dorado` | Dorado | 9 |
| `dorado-claro` | Dorado claro | 10 |
| `ambar` | Ámbar | 13 |
| `ambar-bronce` | Ámbar bronce | 16 |
| `grafito` | Grafito | 17 |
| `pizarra` | Pizarra | 21 |
| `pizarra-acero` | Pizarra acero | 24 |

Los 14 restantes (`azul-claro`, `azul-oscuro`, `azul-acero`, `celeste-claro`, `celeste-acero`, `dorado-oscuro`, `dorado-ocre`, `ambar-claro`, `ambar-oscuro`, `grafito-claro`, `grafito-oscuro`, `grafito-humo`, `pizarra-claro`, `pizarra-oscuro`) siguen en el catálogo con `offered=false`.

## Comportamiento

| Situación | Antes (M17) | Con M18 |
|---|---|---|
| Activación de un perfil sin color | Primer libre de los **24** (el 3.º perfil recibía `azul-claro`) | Primer libre de los **10** ofrecidos |
| Activación con todos ocupados | Error `23514`: **la activación fallaba** | El perfil queda **sin color**; la activación continúa; nunca se repite un color |
| Perfil que ya tiene color | Se conserva | Se conserva (incluso si está retirado) |
| Pedir un color ofrecido libre | Aceptado | Aceptado; el anterior queda libre |
| Pedir un color ocupado | `23505` | `23505` |
| Pedir un color retirado | Aceptado si estaba libre | `22023`, salvo que sea el propio actual (se conserva) |
| Asignaciones simultáneas | Bloqueo exclusivo + `UNIQUE` | Igual (probado: un dueño y un rechazo; dos activaciones dan dos colores distintos) |
| Desactivación | Libera el color | Igual |

## Compatibilidad histórica

- Producción (lectura del 24/11, sin repetir consultas): 2 perfiles activos con `azul` y `pizarra`, ambos ofrecidos. **No cambia ninguna asignación.**
- Escenario de actualización probado: 3 perfiles con colores retirados (`azul-claro`, `azul-oscuro`, `azul-acero`) asignados por M17. Tras M18 conservan exactamente su fila (incluido `updated_at`), `internal_card_colors()` los informa con `offered=false` y el frontend los pinta y avisa. Cada uno puede conservarlo o pasar a uno de los 10. Una vez liberado, un color retirado no vuelve a entregarse.
- El frontend no cambia de comportamiento: ya mostraba 10 opciones y el aviso de capacidad agotada.
