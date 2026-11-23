# Activación M16 + M16b en producción — 23/11/2026

Autorización expresa del usuario: aplicar M16 y M16b, integrar en main y publicar en Vercel. El usuario decidió no hacer
respaldo lógico adicional. Proyecto `xsxdpaiivklqeudgqoqf` (ticketera-procont), confirmado en `.temp/project-ref` y en cada respuesta de la CLI.

## Base de datos

| Paso | Resultado |
|---|---|
| Verificación previa | Rama `integration/ticketera-client-experience-final` en `449b4bc`, limpia. M16 `ecec0b9a…3f102`, M16b `8adce4bb…d036`. M1–M15 iguales a a61450c. `src`/`contracts` iguales a 947eeee. `origin/main` = a61450c. |
| Dry-run inmediato | Exactamente `20261123000100` y `20261123000200`. Riesgo histórico sin cambios: 0 identidades ambiguas, 0 sesiones activas, 4 solicitudes. |
| `supabase db push --remote=xsxdpaiivklqeudgqoqf --yes` | 15:55:05–15:55:14 UTC; aplicó M16 y luego M16b, salida 0 (`db-push.txt`). |
| Historial | 17/17 migraciones con local = remoto (`migration-list-after.txt`). |
| Postcheck M16 | Todos los valores esperados (`postcheck.txt`): 4 solicitudes; 4 históricas con campos nuevos NULL; 1 urgente conservada; identidades quipu 2 / quipufac 1; vínculos quipu 1 / quipufac 2; 3/3 vínculos siguen siendo propiedad de su identidad; 3 columnas; default `'medium'`; 3 triggers; unicidad nueva presente y la de M13 retirada. |
| Postcheck M16b | Historial 2/2; regla de subproyecto heredado y descarte del nombre Quipu presentes; `submit_client_request` sin EXECUTE público; `client_submit_request` EXECUTE para anon/authenticated/service_role. |
| Restricciones | `requested_priority ∈ {low, medium, high, urgent}`; `requester_name_source ∈ {verified_name, username, declared, internal_correction}`; FK `(requested_subsystem_id, system_id) → catalog_subsystems(id, system_id)` (`constraints.txt`). |
| Huella de funciones | 107/107 funciones `public`/`app_private` idénticas (cuerpo, firma, `SECURITY DEFINER`, volatilidad, configuración, EXECUTE) a una instalación local M1–M16b (`functions-compare-after.json`). |
| RPC HTTP reales sin sesión (clave publicable del bundle público) | `client_subprojects`, `client_list_tickets`, `client_ticket_detail` y `client_session_info` → 401 PT401. `submit_client_request` → 42501. Lectura directa de `requests` → 401/42501 (`http-rpc-smoke.txt`). |

Nota: el postcheck original de M16 usaba `app_private.client_owns_request`, que M16 revoca a todos los roles.
El rol de solo lectura de la CLI recibió 42501, lo que confirma la revocación.
Se ejecutó `m16-postcheck-readonly.sql`, con la misma regla de propiedad escrita inline.

### Qué está verificado y con qué clase de prueba

- **Remoto real:** historial, estructura, restricciones, permisos, huella de funciones y rechazo HTTP sin sesión.
- **Local real (PostgreSQL 17, sobre el mismo código SQL desplegado según la huella 107/107):**
  - Aislamiento Quipu, compartición QuipuFac por RUC y separación entre proveedores.
  - Nombre Quipu derivado de la identidad y nombre QuipuFac declarado.
  - Las cuatro prioridades y su default; subproyectos y pertenencia.
  - Sesiones, logout, idempotencia y concurrencia.
  - Compatibilidad del frontend anterior y del nuevo.
- **No verificado en producción:** login real, creación, Mis tickets con sesión, detalle, adjuntos y logout con cuentas de clientes.
  No había sesiones reutilizables, no se pidieron contraseñas y no se autorizaron tickets reales.

## GitHub y Vercel

| Paso | Resultado |
|---|---|
| Push de la rama | `integration/ticketera-client-experience-final` (push normal, sin force). |
| PR | #2 hacia main. Diff de migraciones: solo M16 y M16b; M1–M15 sin cambios. Vercel Preview OK. |
| Merge | Merge normal: main `718ab04be4db7454ace26e138b9bac96bd6bcad4`, padres `a61450c` y `5814a6d`. |
| Vercel Production | Estado del commit `718ab04`: «Deployment has completed». No se cambiaron variables. |
| Dominio oficial | Bundle `index-gFRAUPZx.js` (453.010 bytes, en local 452.982), **Versión 202611231058** (hora de Lima). Contiene `client_subprojects` y «Prioridad solicitada». |
| Navegador (Chromium, solo navegación) | Portal con dos tarjetas; selectores Quipu/QuipuFac habilitados (`VITE_CLIENT_LOGIN_ENABLED` activo); formularios RUC/usuario/contraseña y RUC/contraseña; `/cliente/tickets` sin sesión redirige al ingreso; ingreso del personal disponible. 0 errores JS, 0 peticiones POST (`live-ui-smoke.json`). |

No verificado en producción, por falta de sesiones reales autorizadas: Mis tickets, formulario con prioridad y subproyectos,
detalle, adjuntos, logout, bandeja interna y RequestValidationModal con datos reales. Esas pantallas pasaron 36/36 y 31/31 en
Chromium con servicios simulados.
