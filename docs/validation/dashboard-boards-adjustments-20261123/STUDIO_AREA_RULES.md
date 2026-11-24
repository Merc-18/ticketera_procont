# Regla «las áreas solo aplican al estudio PROCONT» (D-041)

## Cómo se identifica PROCONT

En el modelo, **PROCONT no es un estudio, es un código interno** (`studio_codes.code = 'PROCONT'`) del estudio «BUSINESS ACCOMPANYING SAC». Ese estudio tiene además los códigos ARAPA, ASPPMACSU, DISFARMADENT, PROCONT_CUZ y PROCONT_OLICH (`supabase/migrations/20261118000300_ticket_catalogs.sql`). Las áreas del catálogo cuelgan del **estudio**, no del código.

Regla implementada (`src/lib/studio-rules.ts`):

- `procontStudioId(codes)` devuelve el id del estudio dueño del código canónico `PROCONT`, con **coincidencia exacta** del código y sin comparar nombres visibles.
- `areasApply(studioId, codes)` es verdadero solo si el estudio es ese.

## Dónde se aplica

| Lugar | Comportamiento |
|---|---|
| Modal de validación («Código interno del estudio») | Estudio PROCONT: selector de área y subárea dependiente, con sus validaciones. Otro estudio: sin selector, el área no se exige y **área y subárea se envían como `null`** aunque el estado local tuviera ids anteriores |
| Kanban: filtro de área | Con todos los estudios: «Área (solo PROCONT)». Con PROCONT: «Área». Con otro estudio: oculto y **la selección se limpia** |
| Kanban y Tabla: chip y columna de área | Solo en proyectos del estudio PROCONT o internos (sin estudio) |
| Dashboard | Filtro de área solo con el estudio PROCONT (se limpia al cambiar). Sección de áreas: «solo estudio PROCONT», «No aplica» con otro estudio |

No se eliminaron áreas del catálogo ni se modificaron históricos. Los proyectos de otros estudios con un `requester_area` heredado conservan el dato; solo deja de mostrarse.

## Límite: interpretación por **código** (requiere backend)

Si la regla significa «solo el código PROCONT», y no los demás códigos del mismo estudio (ARAPA, DISFARMADENT…), **no puede implementarse solo en el frontend**:

- el disparador de aprobación (`20261118000400_request_intake.sql`) **exige área** a toda solicitud de un estudio con áreas activas («Área requerida para aceptar solicitudes de este estudio»);
- `classify_request` rechaza área en estudios sin áreas.

Ocultar el área para ARAPA haría fallar la aprobación en el servidor. Por eso se detuvo esa parte, como pide el encargo. Para aplicarla habría que cambiar ambas funciones y decidir qué pasa con PROCONT_CUZ y PROCONT_OLICH. **Requiere autorización de backend.**

## Pruebas

`tests/ui/dashboard-boards.ui.test.mjs`, con datos ficticios de un estudio PROCONT simulado con código canónico y dos áreas:

- PROCONT muestra el selector de área con sus opciones; otro estudio no y muestra «no aplican»;
- el filtro del Kanban se oculta y se limpia al pasar a otro estudio;
- en el Dashboard: «No aplica», filtro de área solo con PROCONT y limpieza al cambiar de estudio.

> **Estado actualizado 23/11/2026:** Esta evidencia describe la implementación frontend de la decisión inicial D-041, que identificaba el estudio asociado como PROCONT. D-047 la precisa: solo el código interno canónico exacto `PROCONT` puede usar áreas. El frontend y servidor actuales aplican igualdad exacta; otros códigos del mismo estudio también quedan excluidos. M17 local implementa la validación servidor. La aplicación remota de M17 no está verificada en esta ejecución.
