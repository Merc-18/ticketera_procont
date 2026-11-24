# Color personal: paleta de 10

## 1. Inspección

- **Catálogo M17** (`app_private.internal_card_color_catalog`): 24 identificadores en 6 familias (azul, celeste, dorado, ámbar, grafito, pizarra) con 4 tonos cada una. Los 6 originales aprobados en D-043 conservan sus HEX.
- **Asignaciones reales** (Supabase `xsxdpaiivklqeudgqoqf`, consulta de **solo lectura** del 24/11/2026, sin nombres ni correos): 2 perfiles internos activos (1 superadmin y 1 admin) con los colores **`azul`** y **`pizarra`**.
- **Autoasignación actual** (`ensure_internal_card_color`): entrega el primer color libre por `sort_order` entre los 24. Con `azul` ocupado, el siguiente perfil recibiría `azul-claro`, que es un color retirado. Si no queda ninguno, lanza `23514` y la activación del perfil falla.

## 2. Selección (sin paleta nueva)

1. Se conservan los **6 originales aprobados**, que incluyen las 2 asignaciones reales.
2. Los 4 restantes salen de los 18 tonos del catálogo por **máxima distancia CIELAB** (algoritmo voraz del punto más lejano), tomando en cada par la distancia **mínima entre tema claro y oscuro**, para que se distingan en ambos temas.

| # | id | Etiqueta | Claro | Oscuro | Motivo |
|---|---|---|---|---|---|
| 1 | `azul` | Azul Procont | `#1E3A8A` | `#3B82F6` | Original; **asignado** |
| 2 | `celeste` | Celeste | `#60A5FA` | `#93C5FD` | Original |
| 3 | `dorado` | Dorado | `#EEBB31` | `#EEBB31` | Original |
| 4 | `ambar` | Ámbar | `#A16207` | `#CA8A04` | Original |
| 5 | `grafito` | Grafito | `#374151` | `#CBD5E1` | Original |
| 6 | `pizarra` | Pizarra | `#94A3B8` | `#64748B` | Original; **asignado** |
| 7 | `dorado-claro` | Dorado claro | `#E2C77F` | `#EED896` | ΔE mínimo 32,3 |
| 8 | `ambar-bronce` | Ámbar bronce | `#8E6A3A` | `#BD9867` | ΔE mínimo 23,8 |
| 9 | `celeste-oscuro` | Celeste intenso | `#28628F` | `#5895C5` | ΔE mínimo 18,9 |
| 10 | `pizarra-acero` | Pizarra acero | `#63778B` | `#91A6BB` | ΔE mínimo 17,4 |

Sin violeta. Los 14 identificadores retirados siguen en el catálogo y en el CSS: una asignación previa a uno de ellos **se sigue pintando** igual (no se cambia a nadie sin necesidad) y el selector avisa «Tu color actual (X) ya no forma parte de la paleta de 10. Se mantiene hasta que elijas otro.».

La franja y el anillo conservan su contorno de alto contraste (`--p-ink`), así que los tonos claros no dependen solo del matiz (D-048).

## 3. Comportamiento (frontend, ya implementado)

- «Mi color de tarjeta» muestra **exactamente 10** opciones (`OWNER_PALETTE`, `src/lib/card-palette.ts`).
- Un color ocupado por otro miembro aparece deshabilitado («asignado a otro miembro»). El servidor sigue garantizando la unicidad (`UNIQUE(color_id)`, bloqueo y error `23505`).
- `setOwnerColor` rechaza localmente cualquier id fuera de los 10.
- **Capacidad agotada**: si los 10 están ocupados por otros, el panel informa «Los 10 colores ya están asignados a otros miembros. No se repiten colores: pide a un administrador liberar uno.». Nunca se repite un color.
- Kanban y Tabla leen la misma fuente (`internal_card_colors`). El cliente nunca monta el selector (prueba existente de `dashboard-boards`).

## 4. Límite que requiere backend — migración **propuesta, no aplicada**

El frontend no puede impedir que la **autoasignación del servidor** entregue un color retirado a un perfil nuevo. Hoy hay 2 perfiles; el tercero recibiría `azul-claro`. Cambio mínimo preparado:

`proposed-migration/20261124000100_internal_card_palette_10.sql` (fuera de `supabase/migrations` para que ningún `db push` la aplique por accidente):

1. Columna `offered` en el catálogo y exactamente 10 en `true` (la migración lo verifica).
2. `ensure_internal_card_color`: la autoasignación solo usa colores ofrecidos y, **sin capacidad, deja al perfil sin color** (`RETURN NULL`) en vez de fallar la activación o repetir. Una petición explícita solo acepta colores ofrecidos, o conservar el propio actual.
3. `internal_card_colors`: devuelve los ofrecidos, los retirados aún asignados y `capacity`.
4. No borra filas, no reasigna a nadie y conserva `UNIQUE`, el bloqueo, las validaciones y los permisos.

Para aplicarla hace falta autorización expresa y, antes, el ensayo en PostgreSQL local, `db push --dry-run` y la verificación de RLS/RPC.
