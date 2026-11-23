# Pruebas, evidencias y reproducción segura

Revisión: **20/11/2026** · Código de referencia: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## M16 + M16b — integración y activación del 23/11/2026

| Suite | Resultado | Clase / alcance |
|---|---|---|
| Integración Codex 1 + Codex 2 | Node 173/173, Python 52/52, build, UI 31/31 y 36/36, PG 21/21 y 25/25 | Local; UI con servicios simulados. [Informe](../validation/client-experience-integration-20261123/REPORT.md). |
| Matriz frontend antiguo/nuevo × M15/M16/M16+M16b | Antiguo 7/7 creaciones con M16b | PostgreSQL 17 local real con adaptadores reales. [Preparación](../validation/m16b-preparation-20261123/REPORT.md). |
| M1–M16b limpia / M15→M16b | 21/21 y 26/26 | PostgreSQL 17 local real; incluye rollback de M16b = estado M16. |
| Producción: historial y postchecks | 17/17; valores esperados | Remoto, solo lectura. |
| Producción: huella de funciones | 107/107 idénticas a local M1–M16b | Remoto, solo lectura. |
| Producción: RPC HTTP sin sesión | 401 PT401 / 42501 | Remoto real, sin escrituras. |
| Creación/listado con sesiones reales | NO VERIFICADO | Sin sesiones reutilizables ni tickets autorizados. |

### Reconstrucción backend M16 — ejecución local del 23/11/2026

Base `a61450c`; no confundir con las ejecuciones históricas que siguen. [Informe](../../REPORT-backend-codex1.md),
[handoff](../validation/client-experience-contract-handoff.md).

| Suite independiente | Resultado | Alcance |
|---|---|---|
| M1–M16 instalación limpia | 21/21 grupos | PostgreSQL17.12 real + adaptador leído del Agente2, Auth/Storage stubs. [JSON](../validation/client-data-security-clean-20261123.json). |
| M15→M16 con históricos | 25/25 grupos | Reproduce colisión anterior, rollback transaccional, datos preservados, sin reasignación. [JSON](../validation/client-data-security-upgrade-20261123.json). |
| Node existente | 171/171 | Unitarias/transportes simulados; no login real ni E2E. |
| Preparación Supabase | 8/8 | Unitarias Python del manifiesto histórico y migraciones actuales. |

Logs separados y fallos iniciales del arnés conservados en
[directorio de evidencias](../validation/client-data-security-20261123/). No sumar suites.
Pruebas propias de M16 no requieren servicios externos ni aceptan DSN remoto. Exigen --work-root
persistente y detienen cada servidor en finally. Versiones/checksums de paquetes oficiales PGDG
se conservan junto al runtime en `.agent-backups/postgresql17-runtime` del workspace anfitrión.
No se ejecutaron UI/Chromium ni se certificó Supabase HTTP real en esta entrega backend.


## Clasificación obligatoria

| Clase | Qué acredita | Qué no acredita |
|---|---|---|
| A — API externa real | Respuesta real HTTP y campos observados, entorno y cuenta autorizados. | Contrato externo exhaustivo, permisos internos o producción si la API es de desarrollo. |
| B — PostgreSQL local real | SQL/ACL/RLS/locks/triggers/idempotencia ejecutados en motor PostgreSQL aislado. | Auth/OAuth/Storage HTTP alojados cuando sus esquemas son fixtures/stubs. |
| C — Supabase remoto | Resultado efectivo del proyecto y fecha indicada; SQL/HTTP reales cuando se hicieron. | Otra fecha, navegación visual no hecha o mutaciones que no se ejecutaron. |
| D — React/Chromium simulado | React/rutas/eventos reales en navegador y frontend con servicios falsos explícitos. | Login del proveedor, Auth/Storage de Supabase o aceptación de producción. |
| E — Unitarias | Adaptador/algoritmo/validación con fixtures; algunas incluyen guardas estáticas de código. | Ejecución real del contrato externo por existencia de un mock. |
| F — Build/TypeScript | Compilación y tipado del árbol indicado. | Permisos remotos o resultado funcional extremo a extremo. |
| G — No verificada | Pendiente explícito, sin evidencia suficiente. | No convertirlo en PASS por intuición o por una prueba de otra clase. |

## Registro de ejecuciones separadas

Los resultados siguientes son **históricos identificados**, no una suite acumulada ni resultados reejecutados en esta tarea. En particular, 50 client-login pueden ser un subconjunto de 171 Node: **no sumar**. Cada cambio puede añadir pruebas y conservar otros resultados anteriores.

| Ejecución / revisión | Clases | Resultado registrado | Fuente y límite |
|---|---|---|---|
| Integración `b13cbb69` M1–M15 | B/D/E/F | 226/226 grupos PG; 156/156 Node; 29/29 UI; tipado/build PASS | [JSON de integración](../validation/integration-security-client-flow.json) y logs individuales; SQL real, Auth/Storage simulados. |
| Revisión independiente exportación `e528bc7` | D/E/F | 11/11 unitarias y 5/5 UI, TypeScript/build PASS | Revisión reportada en conversación; [evidencia de autor](../validation/client-flow-ui-20261119.md) describe sus ejecuciones 155/26 y 4 casos nuevos más caso existente. No confundirlas. |
| Revisión independiente versión `354fbf4` | D/E/F | 159/159 Node; 31/31 UI; 46 comprobaciones adicionales de bundle; builds correctos | Resultado reportado y requisitos de esta tarea; pruebas [build-version](../../tests/build-version.test.mjs) y UI versionadas; los logs temporales de esa revisión no están en Git. |
| Corrección de login `c857a72` | A/E/F | 171/171 Node y 50/50 client-login reportadas; Deno check | Mensaje del commit y reporte del usuario; [errores observados](../validation/provider-failure-responses-20261119.json). No hay un log completo nuevo que certifique su reejecución hoy. |
| Proveedores de desarrollo | A | HTTP 200 por proveedor y sesión Ticketera real | [Quipu](../validation/client-login-dev-api.json), [QuipuFac](../validation/quipufac-login-dev-api.json), [integración localhost](../validation/client-login-local-integration.json); no son APIs de producción. |
| Logins en dominio oficial previos a M15 | A/C | Ambos funcionan según confirmación del usuario | Evidencia aceptada para activación; no se repitió ingreso ni se generó token en documentación. |
| QA anteriores a M15 | C | REQ26-002 y REQ26-003 creados por formulario, aislamiento y logout históricos | [E2E 19/11](../validation/client-login-e2e-20261119.json); no demostrar así creación post-M15. |
| M15 remota 20/11 | C | Historial 15/15; ACL y negativas SQL/HTTP; preservación de requests | [Resumen depurado](EVIDENCE_20261120.md); creación autenticada exitosa aún pendiente. |
| Revisión documental actual | Lectura / validación documental | GET y validación de Markdown/enlaces/OpenAPI/referencias; sin SQL ni tests de producto | [Estado](../PROJECT_STATUS.md) y [validación documental](DOCUMENTATION_VALIDATION.md). |

## Evidencias normalizadas por requisito

### E-INT

[Integración](../validation/integration-security-client-flow.json), base `44cebeb`, aprobados c4e7252+b21c91c+e528bc7, commit integrado b13cbb69. Nueve ejecuciones PG: M13 20, M14 7, board 74, frontend SQL 26, métricas 38, adjuntos 20, M15 18, instalación limpia 10, upgrade 13 = **226 grupos dentro de esa campaña identificada**. Los 156 Node y 29 UI son otras suites, no sumarlas al total PG.

Escenario A: M1–M15 antes de fixtures de aplicación. Escenario B: histórico Administrative pre-M12, M13 y datos ficticios; aplicar M14/M15 preservando 34/35 tablas. Bridge Node usa adaptadores reales contra PostgreSQL por psql/Unix socket, pero UID de Auth y esquemas Storage son simulados. No es E2E alojado.

Fallos iniciales conservados y resueltos en los logs: conteos rígidos de migraciones históricas M13/M14, nombre de método de arnés, subproyecto requerido en fixture y locator móvil oculto. No ocultarlos ni tomar sus ejecuciones fallidas como el resultado final.

### E-DEV

[Quipu](../validation/client-login-dev-api.json) y [QuipuFac](../validation/quipufac-login-dev-api.json): una autenticación real autorizada por proveedor en desarrollo, sin valores de contraseña/token ni respuesta completa. El adaptador posterior fue probado con esos contratos depurados. Los campos no observados siguen no confirmados.

### E-E2E

[QA 19/11](../validation/client-login-e2e-20261119.json): formulario real localhost con API/DB reales; exactamente dos tickets conservados. UI cliente, aislamiento, seguimiento y cierre se comprobaron antes de M15. La bandeja interna se cerró posteriormente a **nivel de datos**, sin contraseña ni comprobación visual superadmin; no reinterpretar esa frase como login interno real.

### E-EXP

La revisión independiente ejecutó los casos 1000 no done+2 done, 1200 no done+2500 done, error segunda página, total cambiado, páginas recortadas, nulls y ausencia de terminados. Además SDK real contra HTTP local estricto, no Supabase. El defecto original se reproduce en b21c91c y el correctivo lo detecta. La limitación de snapshot bajo cambios con mismo total continúa.

### E-VER

Formato de Lima y cambios de día/medianoche; builds en zonas del host Tokio/Auckland, recarga con hora de navegador futura, pie global sin superposición desktop/móvil. Versiones observadas en revisión: `202611191733` y `202611191735`; versión pública posterior: `202611191900`. Mismo minuto puede generar la misma etiqueta: el identificador no promete unicidad por segundo ni equivale a SHA.

### E-FAIL

[Errores externos](../validation/provider-failure-responses-20261119.json): Quipu 400 y QuipuFac 500 success=false, desarrollo. [Tests de fallo](../../tests/client-login-failures.test.mjs) ejercitan traducción segura y distinguen otros 500/502. Configuración [sin fallback](../../tests/client-login-config.test.mjs). 171/50 son ejecuciones reportadas del cambio, no nuevas pruebas documentales.

### E-M15

[Evidencia remota 20/11](EVIDENCE_20261120.md). SQLSTATE 42501 para anon y authenticated sin perfil en RPC heredadas, superadmin alcanza validación 22023, ACL de PUBLIC cerrada y wrapper M13 conservado. HTTP real sin sesión al wrapper da PT401. Propietario compartido postgres. Los roles de perfil inexistentes en remoto no se simularon alterando datos; quedaron probados en PostgreSQL aislado, no con cuentas reales.

### E-PILOT

GET Management API: proyecto correcto, client-login v3, admin-users v4, configuración no secreta Auth; GET SPA: HTTP 200/login true/versión 202611191900. El usuario autoriza las API de desarrollo para este piloto público. No se leyeron valores privados de URL/contrato ni plan facturado Vercel. El histórico reportado v2 no prevalece sobre GET v3.

## Cómo ejecutar pruebas sin tocar remoto

Ejecutar en una copia aislada del commit que se desea validar; varias suites escriben JSON en `docs/validation`. Ninguna ejecución de esta sección fue realizada como parte de documentación.

```bash
npm ci
node --test tests/*.test.mjs
python3 -B -m unittest discover -s tests -p 'test_*.py'
CHROMIUM_EXECUTABLE=/ruta/a/chromium npm run test:ui
./node_modules/.bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --lib ES2022,DOM tests/client-access-contract.types.mts
npm run build
```

No existe script `npm test` en package.json. Los tests Node importan `.ts` directamente: el entorno reproducido usó Node **26.8.2**; no se fijó `engines` ni se certificó todo Node anterior. UI usa playwright-core **1.62.1** con Chromium instalado, sin descargar navegador por efecto implícito. Realtime simulado puede emitir errores de WebSocket previstos; el arnés no debe ignorar otros errores reales de aplicación.

PostgreSQL **17.12** aislado, binarios y librerías disponibles, usuario local no root y sin rutas remotas:

```bash
python3 -B supabase/tests/security_request_creation_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib --baseline-migrations 14
python3 -B supabase/tests/client_access_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib
python3 -B supabase/tests/client_login_throttle_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib
python3 -B supabase/tests/integrated_security_client_flow_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib --scenario clean
python3 -B supabase/tests/integrated_security_client_flow_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib --scenario upgrade
```

Las suites restantes están inventariadas con rutas en [CODE_INVENTORY.md](CODE_INVENTORY.md); los comandos exactos de la campaña 226 están en su JSON, no mezclarlos con `supabase/tests/run_local.py` que valida un alcance histórico. Un PostgreSQL local con stubs no requiere contraseña de Supabase ni env privados. No ejecutar `probe_client_login.py`, `credentials.py`, bootstrap, scripts apply/activate, ni pruebas con endpoint remoto como parte automática de `npm run build` o documentación.

## Pruebas post-M15 pendientes

| Comprobación | Estado posterior a M15 | Razón |
|---|---|---|
| Creación autenticada exitosa Quipu y QuipuFac | NO VERIFICADO | Sin capacidad cliente activa reutilizable; no se solicitaron nuevamente contraseñas. |
| Mis tickets con sesión activa | NO VERIFICADO | La lectura de enlaces de identidad no equivale a la navegación autenticada. |
| Detalle propio/ajeno conservando sesión | NO VERIFICADO | Cubierto local/históricamente; falta sesión alojada posterior. |
| Subida/lectura real de adjuntos | NO VERIFICADO | QA previos sin archivos; Storage de suites B es simulado. |
| Bandeja interna visual | NO VERIFICADO | Se verificó que registros están dentro del lote de datos pending, sin sesión visual válida. |
| Logout posterior a M15 | NO VERIFICADO | Sin sesión activa que cerrar; no inventar una con clave de servidor. |

Si luego se autoriza y hay sesiones válidas: consultar primero títulos/marcadores para no duplicar; máximo dos QA nuevos (uno por proveedor), un envío por ticket, notificaciones externas verificadas previamente, archivo ficticio pequeño, registrar solo REQ/UUID/estado. Conservar los anteriores. Ante respuesta incierta consultar antes de reenviar. Estas instrucciones **no son una nueva autorización de creación**.
