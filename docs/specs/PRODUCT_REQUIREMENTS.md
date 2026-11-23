# Requisitos del producto — Ticketera Procont

Revisión: **20/11/2026** · Código de referencia: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Autoridad, alcance y estados

Este documento es la **única fuente oficial de requisitos funcionales aprobados**. Las demás especificaciones explican su implementación y evidencias; los documentos anteriores son antecedentes, no otra lista normativa. Una nueva decisión debe actualizar aquí el requisito y su trazabilidad; no cambiar SQL aplicado ni reinterpretar una captura antigua como estado actual.

Ticketera centraliza solicitudes de clientes y trabajo interno de Procont Business: recepción, validación, priorización, responsable, ejecución, evidencia y seguimiento. Una solicitud (`requests`) no es un proyecto operativo (`projects`); una cuenta cliente no es un usuario interno de Supabase Auth. `catalog_systems` identifica productos, no proyectos de tablero.

**Usuarios:** cliente individual Quipu; cuenta empresarial QuipuFac; personal interno activo superadmin/admin/developer/viewer; visitante que consulta un REQ; operador SQL/infraestructura autorizado, fuera de los roles de aplicación. Responsabilidades concretas en [PERMISSIONS_SPEC.md](PERMISSIONS_SPEC.md).

**Objetivos:** eliminar creación anónima, separar identidades, conservar históricos, auditar el trabajo desde servidor y medir tiempos sin inventarlos. El piloto público está autorizado con proveedores **de desarrollo**; publicar en el dominio oficial no convierte esas API en producción del proveedor.

| Estado | Interpretación en este registro |
|---|---|
| CUMPLE | Criterio demostrado por evidencia identificada, dentro de su alcance indicado. Una prueba local real sigue siendo local. |
| PARCIAL | Implementación validada en parte; falta activación externa, prueba alojada o existe una limitación expresa. |
| NO CUMPLE | Una condición actual contradice el criterio aprobado; se documenta sin corregirla en esta tarea. |
| NO VERIFICADO | Falta una prueba suficiente; existencia de código no basta. |
| PENDIENTE DE DECISIÓN | Requiere definición/confirmación del usuario o proveedor; no autoriza inventar una solución. |

Los requisitos de creación, cuenta y adjuntos mantienen pendientes **posteriores a M15** aun cuando antes funcionaron. El alcance detallado de cada evidencia está en [TESTING_SPEC.md](TESTING_SPEC.md). No se suman resultados entre commits.

## Decisiones backend actualizadas — 23/11/2026 (M16 + M16b)

> **Producción 23/11/2026 15:55 UTC:** M16 (`20261123000100_client_request_data_security.sql`, sha256 `ecec0b9a…3f102`) y M16b (`20261123000200_client_legacy_payload_compat.sql`, sha256 `8adce4bb…d036`) **aplicadas** en `xsxdpaiivklqeudgqoqf`; historial 17/17 y funciones remotas idénticas a la instalación probada (107/107). [Activación](../validation/m16-activation-20261123/REPORT.md).

Esta actualización usa base `a61450c93f5180ecd623d945b100424a47a3a5d3`; prevalece sobre
los textos históricos más abajo cuando difieran. No modifica su fecha/evidencia remota.
[Contrato de integración](../validation/client-experience-contract-handoff.md), [validación](../../REPORT-backend-codex1.md).

| ID | Decisión final | Aceptación / estado local |
|---|---|---|
| AUTH-003 | Quipu conserva aislamiento por RUC/proveedor/username exacto. Un provider_id nunca reemplaza otro username. No reasignar propiedad histórica ambigua. | CUMPLE local: dos casos sensibles a mayúsculas y colisión provider_id probados; remoto NO VERIFICADO. |
| AUTH-004 / CLIENT-004 | QuipuFac es cuenta empresarial por RUC. Sus sesiones comparten todos los tickets de la empresa, con el nombre declarado de cada ticket; otro RUC y Quipu están separados. | CUMPLE local en listado y detalle; remoto NO VERIFICADO. |
| TICKET-002 | Quipu obtiene nombre de verified_name confiable o username autenticado readonly; QuipuFac mantiene nombre declarado obligatorio, sin conceder permisos. | CUMPLE local: suplantación/requeridos y procedencia probados. |
| TICKET-004 | urgent_requested conserva bandera booleana y métricas propias. No inferirla desde prioridad solicitada ni a la inversa. | CUMPLE local: cuatro prioridades × dos booleanos y métricas existentes. |
| TICKET-013 | requested_priority admite low/medium/high/urgent, default medium para nuevas solicitudes, null histórico; independiente e inmutable frente a projects.priority administrativa. | CUMPLE local: persistencia, validación, lectura interna y aprobación sin alteración. |
| TICKET-014 | Subproyecto pertenece al producto catalog_systems identificado por system_id, no a projects operativo. RPC de hijos activos autorizados y validación nuevamente al crear. | CUMPLE local: pertenencia/actividad/permiso y selección original conservada. |
| CLIENT-007 | limit 1..100, offset0..100000 y orden created_at desc/id desc. Aislamiento en todas las páginas; sin total nuevo ni snapshot transaccional. | CUMPLE local por RPC sobre106 solicitudes; controles visuales son del Agente2. |

| TICKET-002b (M16b) | Compatibilidad con el frontend anterior: si un cliente Quipu envía `requester_name`, solo se valida su forma (string 1–200) y se descarta; el nombre siempre proviene de la identidad y el valor enviado no se almacena. QuipuFac sin cambios. | CUMPLE local (matriz antiguo/nuevo y batería 21/21, 26/26); en producción, código idéntico al probado. Creación real NO VERIFICADA (sin tickets autorizados). |
| TICKET-014b (M16b) | Si el payload no incluye la clave `subsystem_id` (frontend anterior), se acepta NULL al crear y el subproyecto se exige al aprobar, como en M11. Con la clave, pertenencia/actividad se validan y `null` explícito se rechaza si el producto lo exige. | CUMPLE local; en producción, código idéntico al probado. |

Estado: M16 y M16b **aplicadas en producción** el 23/11/2026. Los criterios marcados «CUMPLE local» se ejecutaron sobre el mismo
código SQL hoy desplegado (comparación 107/107), pero no con sesiones reales de clientes: los flujos autenticados con proveedores
siguen NO VERIFICADOS en producción hasta una prueba autorizada.

## Dependencias y restricciones

Frontend React/TypeScript/Vite; Supabase PostgreSQL con M1–M15; Edge `client-login`; Storage privado; Supabase Auth y Edge `admin-users` para personal; catálogos activos; asociación RUC→estudio; proveedor externo accesible con contrato explícito; origen autorizado. Vercel sirve la SPA y GitHub conserva el código. No hay un servidor Node de aplicación en producción.

No forman parte del alcance: cambiar las plataformas externas, migrar datos de otro proyecto, convertir flujos históricos, una identidad universal entre proveedores, SSO automático entre personas, una política SLA nueva, un directorio por cada estudio, sincronización de todos los datos empresariales del proveedor, ni garantías de exportación con snapshot transaccional único. Ninguna operación documental autoriza tickets, despliegues o cambios de configuración.

## Recorridos aprobados

1. Visitante → `/portal` → Nueva Solicitud → `/cliente` → elige **uno** de los dos métodos → sesión Ticketera → `/cliente/nuevo` → formulario → recibo REQ → Mis tickets → detalle propio → Salir.
2. Visitante → Mis tickets → ingreso si es necesario → listado de su identidad. La identidad QuipuFac empresarial no hereda los tickets del usuario Quipu aunque coincidan RUC y estudio.
3. Visitante → Rastrear Solicitud → `/tracking` → REQ → número y estado exclusivamente.
4. Plataforma → servidor con secreto propio → código temporal → enlace con fragmento → `/cliente/acceso/{proveedor}` → canje/confirmación → formulario de producto fijo.
5. Personal → ingreso interno → Requests/Pendientes → clasificación → aceptar con responsable y prioridad o rechazar con motivo público → Development → trabajo/checklist/evidencias → Done → reapertura explícita si corresponde.

## Estados y transiciones

| Capa | Valores y significado |
|---|---|
| Decisión de solicitud | `pending → approved` o `pending → rejected`; nunca escribir `done` en `requests.status`. |
| Proyecto | `active`, `completed`, `archived`, `deleted` histórico. Los comandos controlan transiciones; no hay purga de aplicación. |
| Estado general público | `received`, `in_review`, `approved_backlog`, `in_progress`, `done`, `blocked`, `rejected`; derivado por servidor. |
| Flujo Development | `backlog → analysis → design → dev → code_review → testing → deploy → done`; saltos y retrocesos válidos bajo reglas BOARD. |
| Histórico Administrative | `backlog`, `ready_to_start`, `discovery`, `design`, `build`, `uat_validation`, `deployed`. Dual conserva ambos flujos. |

Clasificar o iniciar revisión lleva a `in_review`; aprobar deja en Backlog; salir de Backlog inicia trabajo; bloqueo prevalece sin mover fase; desbloquear recupera estado derivado; cierre exige condiciones Done; reapertura deja trabajo activo y registra motivo. La función exacta de precedencia es `app_private.request_general_status`, M10; M12 controla las escrituras que alimentan ese cálculo.

## Registro de requisitos

Cada entrada contiene nombre, descripción/regla, comportamiento esperado, aceptación, implementación, evidencia y estado. Los ejemplos describen resultados exigidos; no son instrucciones para crear datos remotos.

### PORTAL-001

**Tres entradas del portal**

| Campo | Especificación |
|---|---|
| Descripción | Tres entradas del portal. |
| Regla exacta | Ofrecer Nueva Solicitud, Mis tickets y Rastrear Solicitud; las dos primeras requieren cuenta y la tercera es pública. |
| Comportamiento esperado | Tres tarjetas; cada una lleva al destino aprobado. |
| Criterio de aceptación | Tres tarjetas; cada una lleva al destino aprobado. |
| Implementación frontend/servidor | [src/components/requests/PublicLanding.tsx](../../src/components/requests/PublicLanding.tsx); `client_submit_request; track_request_status`; M10 M13. |
| Prueba correspondiente | [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int), [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### PORTAL-002

**Rutas y retorno al destino**

| Campo | Especificación |
|---|---|
| Descripción | Rutas y retorno al destino. |
| Regla exacta | Mantener las rutas aprobadas; sin sesión volver a /cliente?ir=nuevo o /cliente?ir=tickets. No aceptar destinos arbitrarios. |
| Comportamiento esperado | Rutas directas protegidas y retorno después del ingreso; detalle sin sesión regresa a la lista correspondiente. |
| Criterio de aceptación | Rutas directas protegidas y retorno después del ingreso; detalle sin sesión regresa a la lista correspondiente. |
| Implementación frontend/servidor | [src/App.tsx](../../src/App.tsx); [src/components/client/ClientWorkspace.tsx](../../src/components/client/ClientWorkspace.tsx); [src/components/client/ClientHome.tsx](../../src/components/client/ClientHome.tsx); `client_session_info`; M13. |
| Prueba correspondiente | [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### PORTAL-003

**Cerrar el formulario anónimo**

| Campo | Especificación |
|---|---|
| Descripción | Cerrar el formulario anónimo. |
| Regla exacta | /request redirige a /cliente y el navegador no consume submit_client_request para crear. |
| Comportamiento esperado | No hay formulario anónimo ni selección libre de estudio; la RPC antigua está cerrada por M15. |
| Criterio de aceptación | No hay formulario anónimo ni selección libre de estudio; la RPC antigua está cerrada por M15. |
| Implementación frontend/servidor | [src/App.tsx](../../src/App.tsx); [src/lib/operations.ts](../../src/lib/operations.ts); `submit_client_request; client_submit_request`; M13 M15. |
| Prueba correspondiente | [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs); [supabase/tests/security_request_creation_local.py](../../supabase/tests/security_request_creation_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int), [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### PORTAL-004

**Ingreso interno separado**

| Campo | Especificación |
|---|---|
| Descripción | Ingreso interno separado. |
| Regla exacta | El personal usa Supabase Auth mediante el modal Ingreso del personal o /login; una sesión cliente no autoriza el panel interno. |
| Comportamiento esperado | Ingresar como cliente no habilita /; perfil interno activo obligatorio. |
| Criterio de aceptación | Ingresar como cliente no habilita /; perfil interno activo obligatorio. |
| Implementación frontend/servidor | [src/components/auth/LoginForm.tsx](../../src/components/auth/LoginForm.tsx); [src/components/auth/ProtectedRoute.tsx](../../src/components/auth/ProtectedRoute.tsx); [src/hooks/useAuth.ts](../../src/hooks/useAuth.ts); `app_private.has_role`; M2 M5. |
| Prueba correspondiente | [tests/consumers.test.mjs](../../tests/consumers.test.mjs); [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### AUTH-001

**Formulario Quipu**

| Campo | Especificación |
|---|---|
| Descripción | Formulario Quipu. |
| Regla exacta | Solicitar exactamente RUC, usuario y contraseña; RUC de once dígitos y username exacto, sin espacios extremos. |
| Comportamiento esperado | Enviar action=login, provider=quipu, ruc, username y password al endpoint propio. |
| Criterio de aceptación | Enviar action=login, provider=quipu, ruc, username y password al endpoint propio. |
| Implementación frontend/servidor | [src/components/client/ClientHome.tsx](../../src/components/client/ClientHome.tsx); [supabase/functions/_shared/client-login.mjs](../../supabase/functions/_shared/client-login.mjs); `client-login`; M13. |
| Prueba correspondiente | [tests/client-login.test.mjs](../../tests/client-login.test.mjs) |
| Evidencia y alcance | [E-DEV](TESTING_SPEC.md#e-dev), [E-VER](TESTING_SPEC.md#e-ver), [E-PILOT](TESTING_SPEC.md#e-pilot) |
| Estado actual | **CUMPLE** |

### AUTH-002

**Formulario QuipuFac**

| Campo | Especificación |
|---|---|
| Descripción | Formulario QuipuFac. |
| Regla exacta | Solicitar exactamente RUC y contraseña; no pedir username adicional al cliente. |
| Comportamiento esperado | Enviar action=login, provider=quipufac, ruc y password; adaptador upstream usa username=RUC. |
| Criterio de aceptación | Enviar action=login, provider=quipufac, ruc y password; adaptador upstream usa username=RUC. |
| Implementación frontend/servidor | [src/components/client/ClientHome.tsx](../../src/components/client/ClientHome.tsx); [supabase/functions/_shared/client-login.mjs](../../supabase/functions/_shared/client-login.mjs); `client-login`; M13. |
| Prueba correspondiente | [tests/quipufac-login.test.mjs](../../tests/quipufac-login.test.mjs) |
| Evidencia y alcance | [E-DEV](TESTING_SPEC.md#e-dev), [E-VER](TESTING_SPEC.md#e-ver), [E-PILOT](TESTING_SPEC.md#e-pilot) |
| Estado actual | **CUMPLE** |

### AUTH-003

**Identidad individual Quipu**

| Campo | Especificación |
|---|---|
| Descripción | Identidad individual Quipu. |
| Regla exacta | La identidad del piloto es empresa por RUC más proveedor y username con mayúsculas exactas; no hay ID estable adicional confirmado. |
| Comportamiento esperado | Dos usernames no comparten Mis tickets; no normalizar el username a minúsculas. |
| Criterio de aceptación | Dos usernames no comparten Mis tickets; no normalizar el username a minúsculas. |
| Implementación frontend/servidor | [supabase/functions/_shared/client-provider-contracts.mjs](../../supabase/functions/_shared/client-provider-contracts.mjs); [supabase/migrations/20261119000100_client_access.sql](../../supabase/migrations/20261119000100_client_access.sql); `app_private.client_identity`; M13. |
| Prueba correspondiente | [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py); [tests/client-login.test.mjs](../../tests/client-login.test.mjs) |
| Evidencia y alcance | [E-DEV](TESTING_SPEC.md#e-dev), [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### AUTH-004

**Identidad empresarial QuipuFac**

| Campo | Especificación |
|---|---|
| Descripción | Identidad empresarial QuipuFac. |
| Regla exacta | Usar cuenta por RUC con subject=company, subject_source=company y username interno nulo. |
| Comportamiento esperado | Todos los ingresos de esa cuenta empresarial comparten su identidad, distinta de Quipu. |
| Criterio de aceptación | Todos los ingresos de esa cuenta empresarial comparten su identidad, distinta de Quipu. |
| Implementación frontend/servidor | [supabase/migrations/20261119000100_client_access.sql](../../supabase/migrations/20261119000100_client_access.sql); `app_private.client_identity`; M13. |
| Prueba correspondiente | [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py) |
| Evidencia y alcance | [E-DEV](TESTING_SPEC.md#e-dev), [E-INT](TESTING_SPEC.md#e-int), [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### AUTH-005

**Sesión independiente**

| Campo | Especificación |
|---|---|
| Descripción | Sesión independiente. |
| Regla exacta | Descartar token del proveedor y emitir 32 bytes aleatorios representados como 64 hex; guardar SHA-256, con duración Edge de ocho horas. |
| Comportamiento esperado | La respuesta contiene sesión propia; ni contraseña ni token upstream quedan en tablas de clientes. |
| Criterio de aceptación | La respuesta contiene sesión propia; ni contraseña ni token upstream quedan en tablas de clientes. |
| Implementación frontend/servidor | [supabase/functions/_shared/client-login.mjs](../../supabase/functions/_shared/client-login.mjs); [src/lib/client-session-store.ts](../../src/lib/client-session-store.ts); `client_open_session; client_session_info`; M13. |
| Prueba correspondiente | [tests/client-login.test.mjs](../../tests/client-login.test.mjs); [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py) |
| Evidencia y alcance | [E-DEV](TESTING_SPEC.md#e-dev), [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### AUTH-006

**Vencimiento y revocación**

| Campo | Especificación |
|---|---|
| Descripción | Vencimiento y revocación. |
| Regla exacta | Las RPC client_* validan hash, expires_at y revoked_at; logout revoca; sesión ausente/vencida/revocada no crea ni lee recursos. |
| Comportamiento esperado | PT401 se distingue de PT403/PT404; nuevo login solamente cuando hace falta y está autorizado. |
| Criterio de aceptación | PT401 se distingue de PT403/PT404; nuevo login solamente cuando hace falta y está autorizado. |
| Implementación frontend/servidor | [supabase/migrations/20261119000100_client_access.sql](../../supabase/migrations/20261119000100_client_access.sql); [src/components/client/ClientWorkspace.tsx](../../src/components/client/ClientWorkspace.tsx); `app_private.client_session; client_logout`; M13. |
| Prueba correspondiente | [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py); [supabase/tests/security_request_creation_local.py](../../supabase/tests/security_request_creation_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int), [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### AUTH-007

**Acceso mediante plataforma**

| Campo | Especificación |
|---|---|
| Descripción | Acceso mediante plataforma. |
| Regla exacta | Servidor de plataforma emite código de un uso por secreto propio; navegador lo canjea, elimina fragmento y pide confirmación de identidad. |
| Comportamiento esperado | Código de 60 segundos en Edge, consumible una vez para el proveedor; sesión platform con producto fijo. |
| Criterio de aceptación | Código de 60 segundos en Edge, consumible una vez para el proveedor; sesión platform con producto fijo. |
| Implementación frontend/servidor | [src/components/client/ClientLaunch.tsx](../../src/components/client/ClientLaunch.tsx); [supabase/functions/_shared/client-login.mjs](../../supabase/functions/_shared/client-login.mjs); `client_issue_entry_code; client_exchange_entry_code`; M13. |
| Prueba correspondiente | [tests/client-login.test.mjs](../../tests/client-login.test.mjs); [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **PARCIAL** |

### AUTH-008

**Errores reales de credenciales**

| Campo | Especificación |
|---|---|
| Descripción | Errores reales de credenciales. |
| Regla exacta | Quipu HTTP 400 declarado se traduce a 401; QuipuFac HTTP 500 solo con success=false declarado se traduce a 401. Otro 500/502 conserva error de proveedor. |
| Comportamiento esperado | No mostrar indisponibilidad como contraseña incorrecta salvo contrato verificado; no reflejar mensajes privados. |
| Criterio de aceptación | No mostrar indisponibilidad como contraseña incorrecta salvo contrato verificado; no reflejar mensajes privados. |
| Implementación frontend/servidor | [supabase/functions/_shared/client-login.mjs](../../supabase/functions/_shared/client-login.mjs); [supabase/functions/_shared/client-provider-contracts.mjs](../../supabase/functions/_shared/client-provider-contracts.mjs); `client-login`; M13. |
| Prueba correspondiente | [tests/client-login-failures.test.mjs](../../tests/client-login-failures.test.mjs) |
| Evidencia y alcance | [E-FAIL](TESTING_SPEC.md#e-fail) |
| Estado actual | **CUMPLE** |

### AUTH-009

**Piloto explícito con desarrollo**

| Campo | Especificación |
|---|---|
| Descripción | Piloto explícito con desarrollo. |
| Regla exacta | Las URLs de desarrollo solo se admiten con configuración explícita y CLIENT_LOGIN_ALLOW_DEVELOPMENT_PROVIDERS=1; no son producción del proveedor. |
| Comportamiento esperado | Sin URL y contrato explícitos, falla antes de enviar credenciales. No usar fallback automático. |
| Criterio de aceptación | Sin URL y contrato explícitos, falla antes de enviar credenciales. No usar fallback automático. |
| Implementación frontend/servidor | [supabase/functions/_shared/client-login-config.mjs](../../supabase/functions/_shared/client-login-config.mjs); `resolveProviderConfig`; M13. |
| Prueba correspondiente | [tests/client-login-config.test.mjs](../../tests/client-login-config.test.mjs) |
| Evidencia y alcance | [E-FAIL](TESTING_SPEC.md#e-fail), [E-PILOT](TESTING_SPEC.md#e-pilot) |
| Estado actual | **CUMPLE** |

### AUTH-010

**Cuenta interna activa**

| Campo | Especificación |
|---|---|
| Descripción | Cuenta interna activa. |
| Regla exacta | Supabase Auth con correo y contraseña no basta: debe existir public.users activo con uno de los cuatro roles. |
| Comportamiento esperado | Una identidad Auth sin perfil o inactiva no accede al panel; nunca sustituir admin por clave de servidor. |
| Criterio de aceptación | Una identidad Auth sin perfil o inactiva no accede al panel; nunca sustituir admin por clave de servidor. |
| Implementación frontend/servidor | [src/lib/auth-controller.ts](../../src/lib/auth-controller.ts); [src/lib/access.ts](../../src/lib/access.ts); `app_private.has_role; app_private.require_role`; M2 M5. |
| Prueba correspondiente | [tests/consumers.test.mjs](../../tests/consumers.test.mjs) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int), [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### CLIENT-001

**Productos Quipu directo**

| Campo | Especificación |
|---|---|
| Descripción | Productos Quipu directo. |
| Regla exacta | Permitir todos los productos activos devueltos por client_products para ingreso directo Quipu; no mantener una lista fija en el formulario. |
| Comportamiento esperado | Selector coincide con catálogo activo del servidor, incluida Quipu. |
| Criterio de aceptación | Selector coincide con catálogo activo del servidor, incluida Quipu. |
| Implementación frontend/servidor | [src/components/client/ClientNewTicket.tsx](../../src/components/client/ClientNewTicket.tsx); `client_products`; M13. |
| Prueba correspondiente | [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py); [tests/client-portal.test.mjs](../../tests/client-portal.test.mjs) |
| Evidencia y alcance | [E-DEV](TESTING_SPEC.md#e-dev), [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### CLIENT-002

**Productos QuipuFac directo**

| Campo | Especificación |
|---|---|
| Descripción | Productos QuipuFac directo. |
| Regla exacta | Permitir productos activos excepto el binding Quipu; QuipuFac no se limita solo a Quipu_Fac en acceso directo. |
| Comportamiento esperado | Quipu no aparece y un envío manipulado de ese producto obtiene PT403. |
| Criterio de aceptación | Quipu no aparece y un envío manipulado de ese producto obtiene PT403. |
| Implementación frontend/servidor | [src/components/client/ClientNewTicket.tsx](../../src/components/client/ClientNewTicket.tsx); `client_products; client_submit_request`; M13. |
| Prueba correspondiente | [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py); [supabase/tests/security_request_creation_local.py](../../supabase/tests/security_request_creation_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### CLIENT-003

**Producto fijo desde plataforma**

| Campo | Especificación |
|---|---|
| Descripción | Producto fijo desde plataforma. |
| Regla exacta | Entrada platform Quipu fija Quipu; entrada platform QuipuFac fija Quipu_Fac. No mostrar selector alternativo. |
| Comportamiento esperado | Interfaz bloqueada al producto y servidor rechaza otro system_id. |
| Criterio de aceptación | Interfaz bloqueada al producto y servidor rechaza otro system_id. |
| Implementación frontend/servidor | [src/components/client/ClientLaunch.tsx](../../src/components/client/ClientLaunch.tsx); [src/components/requests/PublicRequestForm.tsx](../../src/components/requests/PublicRequestForm.tsx); `client_products; client_submit_request`; M13. |
| Prueba correspondiente | [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py); [tests/client-portal.test.mjs](../../tests/client-portal.test.mjs) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **PARCIAL** |

### CLIENT-004

**Mis tickets privado**

| Campo | Especificación |
|---|---|
| Descripción | Mis tickets privado. |
| Regla exacta | Filtrar exclusivamente por identity_id de la sesión; orden created_at desc y UUID desc; no ampliar al estudio o RUC compartido. |
| Comportamiento esperado | Quipu ve su usuario individual y QuipuFac su cuenta empresarial. |
| Criterio de aceptación | Quipu ve su usuario individual y QuipuFac su cuenta empresarial. |
| Implementación frontend/servidor | [src/components/client/MyTickets.tsx](../../src/components/client/MyTickets.tsx); `client_list_tickets`; M13. |
| Prueba correspondiente | [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py); [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs) |
| Evidencia y alcance | [E-E2E](TESTING_SPEC.md#e-e2e), [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **PARCIAL** |

### CLIENT-005

**Detalle ajeno y sesión**

| Campo | Especificación |
|---|---|
| Descripción | Detalle ajeno y sesión. |
| Regla exacta | Ticket ajeno e inexistente devuelven PT404 y no invalidan una sesión válida. |
| Comportamiento esperado | Mensaje equivalente y después se puede seguir consultando el propio ticket. |
| Criterio de aceptación | Mensaje equivalente y después se puede seguir consultando el propio ticket. |
| Implementación frontend/servidor | [src/components/client/ClientTicketDetail.tsx](../../src/components/client/ClientTicketDetail.tsx); [src/lib/client-portal.ts](../../src/lib/client-portal.ts); `client_ticket_detail`; M13. |
| Prueba correspondiente | [tests/client-portal.test.mjs](../../tests/client-portal.test.mjs); [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py) |
| Evidencia y alcance | [E-E2E](TESTING_SPEC.md#e-e2e), [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **PARCIAL** |

### CLIENT-006

**Cierre de sesión del cliente**

| Campo | Especificación |
|---|---|
| Descripción | Cierre de sesión del cliente. |
| Regla exacta | Revocar en servidor mediante client_logout y limpiar sessionStorage/memoria del navegador. |
| Comportamiento esperado | No se reutiliza una sesión revocada; regresar al ingreso. |
| Criterio de aceptación | No se reutiliza una sesión revocada; regresar al ingreso. |
| Implementación frontend/servidor | [src/components/client/ClientWorkspace.tsx](../../src/components/client/ClientWorkspace.tsx); [src/lib/client-session-store.ts](../../src/lib/client-session-store.ts); `client_logout`; M13. |
| Prueba correspondiente | [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs); [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py) |
| Evidencia y alcance | [E-E2E](TESTING_SPEC.md#e-e2e), [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **PARCIAL** |

### CLIENT-007

**Paginación disponible y límite UI**

| Campo | Especificación |
|---|---|
| Descripción | Paginación disponible y límite UI. |
| Regla exacta | La RPC admite limit 1..100 y offset 0..100000; la interfaz actual solicita 100 y no ofrece navegación de páginas. |
| Comportamiento esperado | No afirmar que la UI lista ilimitadamente; conservar aislamiento también al paginar por API. |
| Criterio de aceptación | No afirmar que la UI lista ilimitadamente; conservar aislamiento también al paginar por API. |
| Implementación frontend/servidor | [src/lib/client-portal.ts](../../src/lib/client-portal.ts); [src/components/client/MyTickets.tsx](../../src/components/client/MyTickets.tsx); `client_list_tickets`; M13. |
| Prueba correspondiente | [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **PARCIAL** |

### TICKET-001

**Campos de solicitud**

| Campo | Especificación |
|---|---|
| Descripción | Campos de solicitud. |
| Regla exacta | Nombre, producto, tipo, título, descripción, urgencia y archivos son los únicos campos funcionales del cliente. |
| Comportamiento esperado | Sin correo, estudio seleccionable, clasificación, prioridad definitiva ni SLA en el formulario. |
| Criterio de aceptación | Sin correo, estudio seleccionable, clasificación, prioridad definitiva ni SLA en el formulario. |
| Implementación frontend/servidor | [src/components/requests/PublicRequestForm.tsx](../../src/components/requests/PublicRequestForm.tsx); `client_submit_request`; M8 M13. |
| Prueba correspondiente | [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs) |
| Evidencia y alcance | [E-E2E](TESTING_SPEC.md#e-e2e), [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **PARCIAL** |

### TICKET-002

**Nombre obligatorio y normalización**

| Campo | Especificación |
|---|---|
| Descripción | Nombre obligatorio y normalización. |
| Regla exacta | El nombre declarado no verifica identidad; no vacío tras NFKC, colapso de espacios Unicode y minúsculas solo para comparación estadística. |
| Comportamiento esperado | Guardar el nombre original y rechazar solo espacios sin alterar nombres históricos. |
| Criterio de aceptación | Guardar el nombre original y rechazar solo espacios sin alterar nombres históricos. |
| Implementación frontend/servidor | [supabase/migrations/20261118000700_business_metrics.sql](../../supabase/migrations/20261118000700_business_metrics.sql); `app_private.normalize_requester_name; app_private.require_public_requester_name`; M11. |
| Prueba correspondiente | [supabase/tests/business_metrics_local.py](../../supabase/tests/business_metrics_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### TICKET-003

**Estudio decidido por servidor**

| Campo | Especificación |
|---|---|
| Descripción | Estudio decidido por servidor. |
| Regla exacta | El payload client_submit_request no acepta studio_id ni identidad elegida por el navegador; deriva estudio de la empresa autenticada. |
| Comportamiento esperado | No poder crear en un UUID arbitrario enviándolo en JSON. |
| Criterio de aceptación | No poder crear en un UUID arbitrario enviándolo en JSON. |
| Implementación frontend/servidor | [src/lib/client-portal.ts](../../src/lib/client-portal.ts); `client_submit_request; app_private.client_studio`; M13. |
| Prueba correspondiente | [supabase/tests/security_request_creation_local.py](../../supabase/tests/security_request_creation_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int), [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### TICKET-004

**Urgencia distinta de prioridad**

| Campo | Especificación |
|---|---|
| Descripción | Urgencia distinta de prioridad. |
| Regla exacta | Cliente envía urgent_requested booleano; prioridad low/medium/high/urgent se asigna internamente al aprobar. |
| Comportamiento esperado | Pedir urgencia no fuerza prioridad; estadísticas usan la bandera original. |
| Criterio de aceptación | Pedir urgencia no fuerza prioridad; estadísticas usan la bandera original. |
| Implementación frontend/servidor | [src/components/requests/PublicRequestForm.tsx](../../src/components/requests/PublicRequestForm.tsx); [src/components/requests/RequestValidationModal.tsx](../../src/components/requests/RequestValidationModal.tsx); `approve_request; get_requester_urgency_month`; M8 M11 M12. |
| Prueba correspondiente | [supabase/tests/business_metrics_local.py](../../supabase/tests/business_metrics_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### TICKET-005

**Número REQ estable**

| Campo | Especificación |
|---|---|
| Descripción | Número REQ estable. |
| Regla exacta | Solicitud cliente recibe UUID y REQ con serie anual; el proyecto aprobado conserva el número. Internos usan INT. |
| Comportamiento esperado | Número y recibo confirmados por servidor; no derivar siguiente número en frontend. |
| Criterio de aceptación | Número y recibo confirmados por servidor; no derivar siguiente número en frontend. |
| Implementación frontend/servidor | [src/lib/rpc-attempt.ts](../../src/lib/rpc-attempt.ts); `app_private.next_number; client_submit_request`; M1 M3 M13. |
| Prueba correspondiente | [supabase/tests/security_request_creation_local.py](../../supabase/tests/security_request_creation_local.py) |
| Evidencia y alcance | [E-E2E](TESTING_SPEC.md#e-e2e), [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### TICKET-006

**Idempotencia y concurrencia**

| Campo | Especificación |
|---|---|
| Descripción | Idempotencia y concurrencia. |
| Regla exacta | Una UUID por intento lógico; identidad más clave única en M13; mismo payload devuelve recibo y otro payload con misma clave falla. |
| Comportamiento esperado | Dos reintentos concurrentes no duplican; autorización antes de replay; tras error incierto consultar antes de reenviar. |
| Criterio de aceptación | Dos reintentos concurrentes no duplican; autorización antes de replay; tras error incierto consultar antes de reenviar. |
| Implementación frontend/servidor | [src/lib/rpc-attempt.ts](../../src/lib/rpc-attempt.ts); `client_submit_request; app_private.replay`; M3 M13 M15. |
| Prueba correspondiente | [supabase/tests/security_request_creation_local.py](../../supabase/tests/security_request_creation_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### TICKET-007

**Clasificación administrativa**

| Campo | Especificación |
|---|---|
| Descripción | Clasificación administrativa. |
| Regla exacta | Admin/superadmin fijan código del estudio, subproyecto, área y subárea mientras pending; requisitos dependen de catálogos activos. |
| Comportamiento esperado | Código obligatorio para decidir en solicitudes clasificadas; área/subproyecto exigidos al aprobar cuando corresponde. |
| Criterio de aceptación | Código obligatorio para decidir en solicitudes clasificadas; área/subproyecto exigidos al aprobar cuando corresponde. |
| Implementación frontend/servidor | [src/components/requests/RequestValidationModal.tsx](../../src/components/requests/RequestValidationModal.tsx); `classify_request; assign_request_studio_code`; M7 M8. |
| Prueba correspondiente | [supabase/tests/request_intake_local.py](../../supabase/tests/request_intake_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### TICKET-008

**Aprobación**

| Campo | Especificación |
|---|---|
| Descripción | Aprobación. |
| Regla exacta | Admin/superadmin aprueban con responsable principal y prioridad; crear un Development, también para solicitud histórica sin clasificación. |
| Comportamiento esperado | Aprobación atómica y número estable; no admitir responsable vacío ni nuevos flujos Administrative/Dual. |
| Criterio de aceptación | Aprobación atómica y número estable; no admitir responsable vacío ni nuevos flujos Administrative/Dual. |
| Implementación frontend/servidor | [src/components/requests/RequestValidationModal.tsx](../../src/components/requests/RequestValidationModal.tsx); `approve_request`; M8 M12. |
| Prueba correspondiente | [supabase/tests/board_frontend_local.py](../../supabase/tests/board_frontend_local.py); [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### TICKET-009

**Rechazo y privacidad**

| Campo | Especificación |
|---|---|
| Descripción | Rechazo y privacidad. |
| Regla exacta | Motivo público obligatorio y notas internas opcionales separadas; conservar rejection_reason histórico; no copiarlo al seguimiento REQ. |
| Comportamiento esperado | Detalle de cliente puede mostrar public_rejection_reason; seguimiento público REQ nunca muestra motivos. |
| Criterio de aceptación | Detalle de cliente puede mostrar public_rejection_reason; seguimiento público REQ nunca muestra motivos. |
| Implementación frontend/servidor | [src/components/requests/RequestValidationModal.tsx](../../src/components/requests/RequestValidationModal.tsx); `reject_request; reject_request_with_notes; publish_rejection_reason`; M9 M10 M13. |
| Prueba correspondiente | [supabase/tests/ticket_security_local.py](../../supabase/tests/ticket_security_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### TICKET-010

**Creación interna**

| Campo | Especificación |
|---|---|
| Descripción | Creación interna. |
| Regla exacta | Editores activos crean proyectos INT mediante create_internal_project con responsable principal y Development. |
| Comportamiento esperado | No habilitar al viewer ni a una identidad Auth externa; no insertar directamente desde UI. |
| Criterio de aceptación | No habilitar al viewer ni a una identidad Auth externa; no insertar directamente desde UI. |
| Implementación frontend/servidor | [src/components/projects/NewProjectModal.tsx](../../src/components/projects/NewProjectModal.tsx); `create_internal_project`; M3 M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### TICKET-011

**Importación Planner**

| Campo | Especificación |
|---|---|
| Descripción | Importación Planner. |
| Regla exacta | Importador XLSX existente conserva flujo de preview/validación y submit_request o submit_classified_request; UI solo admin/superadmin. |
| Comportamiento esperado | M15 no rompe importador; preservar claves de reintento y no elevar al viewer. |
| Criterio de aceptación | M15 no rompe importador; preservar claves de reintento y no elevar al viewer. |
| Implementación frontend/servidor | [src/components/requests/PlannerImportModal.tsx](../../src/components/requests/PlannerImportModal.tsx); [src/lib/operations.ts](../../src/lib/operations.ts); `submit_request; submit_classified_request`; M7 M15. |
| Prueba correspondiente | [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs); [tests/integration/database-client-flows.mjs](../../tests/integration/database-client-flows.mjs) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### TICKET-012

**Seguimiento público mínimo**

| Campo | Especificación |
|---|---|
| Descripción | Seguimiento público mínimo. |
| Regla exacta | Buscar por REQ sin login, devolver solo request_number y estado general; no UUID ni texto privado. |
| Comportamiento esperado | Respuesta con exactamente dos campos para REQ existente; 10 consultas por IP/minuto y 300 globales/minuto. |
| Criterio de aceptación | Respuesta con exactamente dos campos para REQ existente; 10 consultas por IP/minuto y 300 globales/minuto. |
| Implementación frontend/servidor | [src/components/requests/RequestTracking.tsx](../../src/components/requests/RequestTracking.tsx); `track_request_status`; M10. |
| Prueba correspondiente | [supabase/tests/request_tracking_local.py](../../supabase/tests/request_tracking_local.py) |
| Evidencia y alcance | [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### COMPANY-001

**Coincidencia automática única**

| Campo | Especificación |
|---|---|
| Descripción | Coincidencia automática única. |
| Regla exacta | Sin asociación explícita, usar exactamente un estudio activo con RUC igual; cero o varios exige resolución administrativa. |
| Comportamiento esperado | No elegir aleatoriamente ni habilitar creación con studio_mapping=required. |
| Criterio de aceptación | No elegir aleatoriamente ni habilitar creación con studio_mapping=required. |
| Implementación frontend/servidor | [src/components/client/ClientNewTicket.tsx](../../src/components/client/ClientNewTicket.tsx); `app_private.client_studio`; M13. |
| Prueba correspondiente | [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### COMPANY-002

**Asociación administrativa explícita**

| Campo | Especificación |
|---|---|
| Descripción | Asociación administrativa explícita. |
| Regla exacta | set_client_company_studio exige admin/superadmin activo; destino activo y RUC coincidente o nulo; null elimina asociación explícita. |
| Comportamiento esperado | Resolver ambigüedad sin cambiar estudios ni vincular tickets anteriores. |
| Criterio de aceptación | Resolver ambigüedad sin cambiar estudios ni vincular tickets anteriores. |
| Implementación frontend/servidor | [supabase/migrations/20261119000100_client_access.sql](../../supabase/migrations/20261119000100_client_access.sql); `set_client_company_studio`; M13. |
| Prueba correspondiente | [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py) |
| Evidencia y alcance | [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### COMPANY-003

**Historia de empresa preservada**

| Campo | Especificación |
|---|---|
| Descripción | Historia de empresa preservada. |
| Regla exacta | La asociación cambia resolución de futuras creaciones; las solicitudes conservan su studio_id y enlaces originales. |
| Comportamiento esperado | REQ anteriores no se reasignan automáticamente; empresa compartida no fusiona identidades. |
| Criterio de aceptación | REQ anteriores no se reasignan automáticamente; empresa compartida no fusiona identidades. |
| Implementación frontend/servidor | [supabase/migrations/20261119000100_client_access.sql](../../supabase/migrations/20261119000100_client_access.sql); `client_request_links; client_submit_request`; M13. |
| Prueba correspondiente | [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py) |
| Evidencia y alcance | [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### BOARD-001

**Flujo nuevo único**

| Campo | Especificación |
|---|---|
| Descripción | Flujo nuevo único. |
| Regla exacta | Proyectos nuevos son Development con workflow_version=2, una fila de flujo y responsable inicial explícito. |
| Comportamiento esperado | Reject de project_type administrativo/dual nuevo; no backfill sobre históricos. |
| Criterio de aceptación | Reject de project_type administrativo/dual nuevo; no backfill sobre históricos. |
| Implementación frontend/servidor | [src/components/projects/NewProjectModal.tsx](../../src/components/projects/NewProjectModal.tsx); `app_private.board_creation_payload; approve_request`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-002

**Ocho fases aprobadas**

| Campo | Especificación |
|---|---|
| Descripción | Ocho fases aprobadas. |
| Regla exacta | Backlog, Analysis, Design, Development, Code Review, Testing, Deploy, Done; claves backlog/analysis/design/dev/code_review/testing/deploy/done. |
| Comportamiento esperado | SQL, contrato y columnas Kanban coinciden en orden y claves. |
| Criterio de aceptación | SQL, contrato y columnas Kanban coinciden en orden y claves. |
| Implementación frontend/servidor | [src/components/boards/KanbanBoard.tsx](../../src/components/boards/KanbanBoard.tsx); [contracts/board-operations-client.mjs](../../contracts/board-operations-client.mjs); `app_private.board_phases`; M12. |
| Prueba correspondiente | [tests/board-frontend.test.mjs](../../tests/board-frontend.test.mjs); [supabase/tests/board_frontend_local.py](../../supabase/tests/board_frontend_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-003

**Históricos preservados**

| Campo | Especificación |
|---|---|
| Descripción | Históricos preservados. |
| Regla exacta | Administrative/Dual existentes conservan tipo, flujos y checklists; workflow_version nulo identifica histórico. |
| Comportamiento esperado | No convertir ni borrar flujos; mantener tablero Administrative histórico. |
| Criterio de aceptación | No convertir ni borrar flujos; mantener tablero Administrative histórico. |
| Implementación frontend/servidor | [src/components/boards/BoardSelector.tsx](../../src/components/boards/BoardSelector.tsx); `app_private.board_project_guard; app_private.board_flow_guard`; M12. |
| Prueba correspondiente | [supabase/tests/integrated_security_client_flow_local.py](../../supabase/tests/integrated_security_client_flow_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-004

**Saltos y retrocesos**

| Campo | Especificación |
|---|---|
| Descripción | Saltos y retrocesos. |
| Regla exacta | Editores pueden cambiar a fases válidas incluyendo saltos y retrocesos, siempre que esté activo y no bloqueado; terminado requiere reapertura explícita. |
| Comportamiento esperado | Servidor valida fase y ticket; primera salida real de Backlog se conserva para métricas. |
| Criterio de aceptación | Servidor valida fase y ticket; primera salida real de Backlog se conserva para métricas. |
| Implementación frontend/servidor | [src/components/boards/KanbanBoard.tsx](../../src/components/boards/KanbanBoard.tsx); `operate_board_ticket`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-005

**Done como condición de cierre**

| Campo | Especificación |
|---|---|
| Descripción | Done como condición de cierre. |
| Regla exacta | Nuevos proyectos solo finalizan al entrar en Done; históricos con varios flujos cuando todos son finales. |
| Comportamiento esperado | No botón Complete ni UPDATE directo de status que omita el comando. |
| Criterio de aceptación | No botón Complete ni UPDATE directo de status que omita el comando. |
| Implementación frontend/servidor | [src/components/projects/ProjectModal.tsx](../../src/components/projects/ProjectModal.tsx); `operate_board_ticket; app_private.board_apply`; M12. |
| Prueba correspondiente | [tests/board-frontend.test.mjs](../../tests/board-frontend.test.mjs); [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-006

**Confirmar pendientes al finalizar**

| Campo | Especificación |
|---|---|
| Descripción | Confirmar pendientes al finalizar. |
| Regla exacta | Si hay checklist pendiente, confirmar explícitamente la lista actual y pending_fingerprint; rechazar huella obsoleta. |
| Comportamiento esperado | La confirmación queda en evento completed y cambios concurrentes no son ignorados. |
| Criterio de aceptación | La confirmación queda en evento completed y cambios concurrentes no son ignorados. |
| Implementación frontend/servidor | [src/components/projects/BoardDialogs.tsx](../../src/components/projects/BoardDialogs.tsx); `get_board_ticket; operate_board_ticket`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-007

**Reapertura con motivo**

| Campo | Especificación |
|---|---|
| Descripción | Reapertura con motivo. |
| Regla exacta | Solo trabajo terminado, destino no final, motivo no vacío máximo 5000 y actor; no reabrir si bloqueado. |
| Comportamiento esperado | Evento reopened conserva fases y referencia al cierre; no alterar primera salida histórica. |
| Criterio de aceptación | Evento reopened conserva fases y referencia al cierre; no alterar primera salida histórica. |
| Implementación frontend/servidor | [src/components/projects/BoardDialogs.tsx](../../src/components/projects/BoardDialogs.tsx); `operate_board_ticket`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-008

**Bloqueo con motivo y fase conservada**

| Campo | Especificación |
|---|---|
| Descripción | Bloqueo con motivo y fase conservada. |
| Regla exacta | Bloquear trabajo activo no terminado exige motivo; conservar fase, responsable y progresos; impedir mover/finalizar/reabrir. |
| Comportamiento esperado | Estado general blocked y auditoría del motivo; checklist/comentarios/evidencias siguen permitidos. |
| Criterio de aceptación | Estado general blocked y auditoría del motivo; checklist/comentarios/evidencias siguen permitidos. |
| Implementación frontend/servidor | [src/components/projects/ProjectModal.tsx](../../src/components/projects/ProjectModal.tsx); `operate_board_ticket; app_private.board_flow_guard`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-009

**Desbloqueo**

| Campo | Especificación |
|---|---|
| Descripción | Desbloqueo. |
| Regla exacta | Al desbloquear, limpiar bandera y motivo operativo; el historial conserva el motivo anterior y la fase no cambia. |
| Comportamiento esperado | Estado derivado vuelve a approved_backlog o in_progress según la fase. |
| Criterio de aceptación | Estado derivado vuelve a approved_backlog o in_progress según la fase. |
| Implementación frontend/servidor | [src/components/projects/ProjectModal.tsx](../../src/components/projects/ProjectModal.tsx); `operate_board_ticket; app_private.trg_project_block`; M10 M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-010

**Reasignación auditada**

| Campo | Especificación |
|---|---|
| Descripción | Reasignación auditada. |
| Regla exacta | Editores activos pueden reasignar a editor activo o retirar mediante null explícito; registrar anterior/nuevo, actor, reloj y ticket. |
| Comportamiento esperado | Dual histórico exige flow_id; ninguna reasignación silenciosa ni sustituto inventado. |
| Criterio de aceptación | Dual histórico exige flow_id; ninguna reasignación silenciosa ni sustituto inventado. |
| Implementación frontend/servidor | [src/components/boards/ProjectCard.tsx](../../src/components/boards/ProjectCard.tsx); `operate_board_ticket; app_private.board_assignment_audit`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-011

**Reasignación durante bloqueo**

| Campo | Especificación |
|---|---|
| Descripción | Reasignación durante bloqueo. |
| Regla exacta | Solo admin/superadmin puede reasignar trabajo bloqueado; developer puede hacerlo cuando no está bloqueado. |
| Comportamiento esperado | Controles UI y servidor coinciden; viewer nunca reasigna. |
| Criterio de aceptación | Controles UI y servidor coinciden; viewer nunca reasigna. |
| Implementación frontend/servidor | [src/components/projects/ProjectModal.tsx](../../src/components/projects/ProjectModal.tsx); `app_private.board_flow_guard`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-012

**Progreso de fase**

| Campo | Especificación |
|---|---|
| Descripción | Progreso de fase. |
| Regla exacta | Porcentaje=100 por índice cero de fase dividido entre cantidad de fases menos uno, redondeado a dos decimales. |
| Comportamiento esperado | Done 100, Backlog 0; project_flows.progress histórico no se sobrescribe. |
| Criterio de aceptación | Done 100, Backlog 0; project_flows.progress histórico no se sobrescribe. |
| Implementación frontend/servidor | [src/components/projects/ProjectModal.tsx](../../src/components/projects/ProjectModal.tsx); `get_board_ticket`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-013

**Progreso del checklist**

| Campo | Especificación |
|---|---|
| Descripción | Progreso del checklist. |
| Regla exacta | Completadas/total por 100, dos decimales; sin tareas devuelve null, independiente del progreso de fase. |
| Comportamiento esperado | Marcar tarea no mueve fase; mover fase no marca tareas ni escribe progress legado. |
| Criterio de aceptación | Marcar tarea no mueve fase; mover fase no marca tareas ni escribe progress legado. |
| Implementación frontend/servidor | [src/hooks/useChecklist.ts](../../src/hooks/useChecklist.ts); [src/components/projects/ChecklistSection.tsx](../../src/components/projects/ChecklistSection.tsx); `get_board_ticket; RLS checklist_items`; M2 M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-014

**Operaciones masivas atómicas**

| Campo | Especificación |
|---|---|
| Descripción | Operaciones masivas atómicas. |
| Regla exacta | Solo prioridad y archivado; 1..100 UUID únicos no nulos, una transacción y command_id compartido. |
| Comportamiento esperado | Un error revierte todo el lote; auditoría individual y reintento idempotente. |
| Criterio de aceptación | Un error revierte todo el lote; auditoría individual y reintento idempotente. |
| Implementación frontend/servidor | [src/components/boards/KanbanBoard.tsx](../../src/components/boards/KanbanBoard.tsx); `operate_board_tickets`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-015

**Archivar y restaurar**

| Campo | Especificación |
|---|---|
| Descripción | Archivar y restaurar. |
| Regla exacta | Editores archivan/restauran archivados; restaurar un deleted histórico exige admin/superadmin. Restaurar fases finales conserva completed. |
| Comportamiento esperado | No confundir restauración con reapertura; público conserva estado derivado existente. |
| Criterio de aceptación | No confundir restauración con reapertura; público conserva estado derivado existente. |
| Implementación frontend/servidor | [src/components/admin/PapeleraView.tsx](../../src/components/admin/PapeleraView.tsx); `operate_board_ticket`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-016

**Historial desde servidor**

| Campo | Especificación |
|---|---|
| Descripción | Historial desde servidor. |
| Regla exacta | Eventos de comandos, checklist, asignación, bloqueos, reapertura, bulk y evidencia se generan en servidor con actor y fecha. |
| Comportamiento esperado | El navegador no fabrica activity_logs; RequestTimeline conserva registros anteriores. |
| Criterio de aceptación | El navegador no fabrica activity_logs; RequestTimeline conserva registros anteriores. |
| Implementación frontend/servidor | [src/components/requests/RequestTimeline.tsx](../../src/components/requests/RequestTimeline.tsx); `app_private.board_event`; M8 M10 M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### BOARD-017

**Sin borrado del historial**

| Campo | Especificación |
|---|---|
| Descripción | Sin borrado del historial. |
| Regla exacta | Ningún rol de aplicación puede actualizar, borrar o truncar request_events/activity_logs/security_events; purge no permitido. |
| Comportamiento esperado | Superadmin de aplicación tampoco purga; administración SQL fuera del modelo de amenaza. |
| Criterio de aceptación | Superadmin de aplicación tampoco purga; administración SQL fuera del modelo de amenaza. |
| Implementación frontend/servidor | [src/components/admin/PapeleraView.tsx](../../src/components/admin/PapeleraView.tsx); `app_private.immutable_board_history; purge_project`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### METRIC-001

**Cycle Time de eventos**

| Campo | Especificación |
|---|---|
| Descripción | Cycle Time de eventos. |
| Regla exacta | Primera phase_changed de backlog a cualquier fase distinta en el proyecto actual hasta último cierre done válido. |
| Comportamiento esperado | Tiempo continuo en segundos, sin updated_at; bloqueos y retrocesos no descuentan tiempo. |
| Criterio de aceptación | Tiempo continuo en segundos, sin updated_at; bloqueos y retrocesos no descuentan tiempo. |
| Implementación frontend/servidor | [src/lib/metrics-adapter.ts](../../src/lib/metrics-adapter.ts); `get_ticket_performance`; M11. |
| Prueba correspondiente | [supabase/tests/business_metrics_local.py](../../supabase/tests/business_metrics_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### METRIC-002

**Lead Time de eventos**

| Campo | Especificación |
|---|---|
| Descripción | Lead Time de eventos. |
| Regla exacta | Desde requests.created_at al cierre confiable actual; no sumar flujos ni inventar completado. |
| Comportamiento esperado | Segundos/días calendario del servidor y reapertura excluye hasta nuevo cierre. |
| Criterio de aceptación | Segundos/días calendario del servidor y reapertura excluye hasta nuevo cierre. |
| Implementación frontend/servidor | [src/lib/metrics-adapter.ts](../../src/lib/metrics-adapter.ts); `get_ticket_performance`; M11 M12. |
| Prueba correspondiente | [supabase/tests/business_metrics_local.py](../../supabase/tests/business_metrics_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### METRIC-003

**Null e historia desconocida**

| Campo | Especificación |
|---|---|
| Descripción | Null e historia desconocida. |
| Regla exacta | Sin comienzo/cierre confiable o cronología válida conservar null y metric_status; baseline no demuestra finalización real. |
| Comportamiento esperado | CSV deja celdas vacías, panel no sustituye desconocidos por cero. |
| Criterio de aceptación | CSV deja celdas vacías, panel no sustituye desconocidos por cero. |
| Implementación frontend/servidor | [src/lib/ticket-export.ts](../../src/lib/ticket-export.ts); [src/components/metrics/MetricState.tsx](../../src/components/metrics/MetricState.tsx); `get_ticket_performance`; M11. |
| Prueba correspondiente | [tests/ticket-export.test.mjs](../../tests/ticket-export.test.mjs); [supabase/tests/business_metrics_local.py](../../supabase/tests/business_metrics_local.py) |
| Evidencia y alcance | [E-EXP](TESTING_SPEC.md#e-exp), [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### METRIC-004

**Cohorte comparable**

| Campo | Especificación |
|---|---|
| Descripción | Cohorte comparable. |
| Regla exacta | metrics_time_averages calcula ambos promedios solo con metric_status=complete y mismos tickets; periodo por completed_at, filtro estudio opcional. |
| Comportamiento esperado | cohort=paired_complete, tamaños iguales y excluded_count informado; null si no hay muestra. |
| Criterio de aceptación | cohort=paired_complete, tamaños iguales y excluded_count informado; null si no hay muestra. |
| Implementación frontend/servidor | [src/components/admin/WorkloadView.tsx](../../src/components/admin/WorkloadView.tsx); `metrics_time_averages`; M11. |
| Prueba correspondiente | [supabase/tests/metrics_cohort_local.py](../../supabase/tests/metrics_cohort_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### METRIC-005

**Urgencias mensuales por solicitante**

| Campo | Especificación |
|---|---|
| Descripción | Urgencias mensuales por solicitante. |
| Regla exacta | Agrupar nombre normalizado y UUID de estudio, solicitudes REQ de ese mes en America/Lima; incluir pendientes, aprobadas y rechazadas. |
| Comportamiento esperado | No inferir urgencia desde prioridad ni agrupar personas solo por nombre; admin/superadmin ven detalle. |
| Criterio de aceptación | No inferir urgencia desde prioridad ni agrupar personas solo por nombre; admin/superadmin ven detalle. |
| Implementación frontend/servidor | [src/components/metrics/UrgencyStatsPanel.tsx](../../src/components/metrics/UrgencyStatsPanel.tsx); `get_requester_urgency_month; metrics_monthly_urgency`; M11. |
| Prueba correspondiente | [supabase/tests/business_metrics_local.py](../../supabase/tests/business_metrics_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### METRIC-006

**Exportación completa paginada**

| Campo | Especificación |
|---|---|
| Descripción | Exportación completa paginada. |
| Regla exacta | Filtrar done en servidor antes del límite, order request_id asc, count exact, páginas de 1000 avanzando por recibidas; proyectos en lotes de 100. |
| Comportamiento esperado | Más de 2500 terminados sin pérdidas con datos estables; error, duplicado o total cambiado impide CSV parcial. Sin snapshot transaccional único. |
| Criterio de aceptación | Más de 2500 terminados sin pérdidas con datos estables; error, duplicado o total cambiado impide CSV parcial. Sin snapshot transaccional único. |
| Implementación frontend/servidor | [src/lib/ticket-export.ts](../../src/lib/ticket-export.ts); [src/components/dashboard/DashboardView.tsx](../../src/components/dashboard/DashboardView.tsx); `get_ticket_performance`; M11. |
| Prueba correspondiente | [tests/ticket-export.test.mjs](../../tests/ticket-export.test.mjs); [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs) |
| Evidencia y alcance | [E-EXP](TESTING_SPEC.md#e-exp), [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **PARCIAL** |

### METRIC-007

**Sin política SLA automática**

| Campo | Especificación |
|---|---|
| Descripción | Sin política SLA automática. |
| Regla exacta | No adoptar plazos heredados ni alertas automáticas SLA; conservar campos/eventos históricos sin convertirlos en métricas oficiales. |
| Comportamiento esperado | Nuevas RPC rechazan SLA no nulo; Roadmap usa due_date y el hook useSlaWarnings no existe. |
| Criterio de aceptación | Nuevas RPC rechazan SLA no nulo; Roadmap usa due_date y el hook useSlaWarnings no existe. |
| Implementación frontend/servidor | [src/App.tsx](../../src/App.tsx); [src/components/boards/RoadmapView.tsx](../../src/components/boards/RoadmapView.tsx); `app_private.board_creation_payload`; M12. |
| Prueba correspondiente | [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### ATTACH-001

**Cupo decimal compartido**

| Campo | Especificación |
|---|---|
| Descripción | Cupo decimal compartido. |
| Regla exacta | Máximo cuatro archivos y 2500000 bytes combinados por ticket, incluyendo reservas y objetos históricos; no 2.5 MiB ni cinco archivos. |
| Comportamiento esperado | Rechazar exceso concurrente y tamaños históricos desconocidos sin asumir cero. |
| Criterio de aceptación | Rechazar exceso concurrente y tamaños históricos desconocidos sin asumir cero. |
| Implementación frontend/servidor | [src/lib/attachment-prep.ts](../../src/lib/attachment-prep.ts); `reserve_request_attachments; reserve_board_evidence`; M9 M12. |
| Prueba correspondiente | [supabase/tests/ticket_attachment_limits_local.py](../../supabase/tests/ticket_attachment_limits_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### ATTACH-002

**Reserva del cliente autorizada**

| Campo | Especificación |
|---|---|
| Descripción | Reserva del cliente autorizada. |
| Regla exacta | M13 comprueba sesión y propiedad antes de reservar; la ruta opaca la emite servidor, upload_key solo idempotencia. |
| Comportamiento esperado | No usar UUID de ticket como autorización ni token en URL de objeto; upsert=false. |
| Criterio de aceptación | No usar UUID de ticket como autorización ni token en URL de objeto; upsert=false. |
| Implementación frontend/servidor | [src/lib/client-portal.ts](../../src/lib/client-portal.ts); `client_reserve_attachments`; M9 M13. |
| Prueba correspondiente | [tests/ticket-security-client.test.mjs](../../tests/ticket-security-client.test.mjs); [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### ATTACH-003

**MIME y bytes finales**

| Campo | Especificación |
|---|---|
| Descripción | MIME y bytes finales. |
| Regla exacta | Allowlist del bucket, metadatos y tamaño real de Storage coinciden con reserva; constraint trigger diferido verifica al commit. |
| Comportamiento esperado | No basta validación de navegador; rechazar ruta sin reserva, metadatos faltantes y exceso agregado. |
| Criterio de aceptación | No basta validación de navegador; rechazar ruta sin reserva, metadatos faltantes y exceso agregado. |
| Implementación frontend/servidor | [contracts/ticket-security-client.mjs](../../contracts/ticket-security-client.mjs); `app_private.enforce_attachment_bytes`; M9 M12. |
| Prueba correspondiente | [supabase/tests/ticket_attachment_limits_local.py](../../supabase/tests/ticket_attachment_limits_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### ATTACH-004

**Ventana de subida cliente**

| Campo | Especificación |
|---|---|
| Descripción | Ventana de subida cliente. |
| Regla exacta | Solicitud pending, reserva y objeto dentro de los 30 minutos desde creación; reintento conserva upload_key y metadatos. |
| Comportamiento esperado | Expiración no se renueva automáticamente; no crear otro ticket por error de adjunto. |
| Criterio de aceptación | Expiración no se renueva automáticamente; no crear otro ticket por error de adjunto. |
| Implementación frontend/servidor | [src/lib/attachment-delivery.ts](../../src/lib/attachment-delivery.ts); `reserve_request_attachment; request_attachment_allowed`; M9 M13. |
| Prueba correspondiente | [supabase/tests/ticket_security_local.py](../../supabase/tests/ticket_security_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### ATTACH-005

**Evidencia interna separada**

| Campo | Especificación |
|---|---|
| Descripción | Evidencia interna separada. |
| Regla exacta | Editor activo reserva por proyecto, ligada a actor y 30 minutos desde reserva; permite bloqueados y excluye viewer/anon. |
| Comportamiento esperado | Otra persona no usa su ruta; cuota común; lectura privada interna y URL firmada de 600 segundos. |
| Criterio de aceptación | Otra persona no usa su ruta; cuota común; lectura privada interna y URL firmada de 600 segundos. |
| Implementación frontend/servidor | [src/components/projects/EvidenceSection.tsx](../../src/components/projects/EvidenceSection.tsx); [src/lib/attachments.ts](../../src/lib/attachments.ts); `reserve_board_evidence`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### ATTACH-006

**Validación Storage alojado**

| Campo | Especificación |
|---|---|
| Descripción | Validación Storage alojado. |
| Regla exacta | Verificar subida y lectura real después de M15 con archivo QA sin datos personales y autorización específica. |
| Comportamiento esperado | No equiparar schemas Storage simulados a HTTP real; conservar pendiente sin sesión utilizable. |
| Criterio de aceptación | No equiparar schemas Storage simulados a HTTP real; conservar pendiente sin sesión utilizable. |
| Implementación frontend/servidor | [src/components/requests/AttachmentPicker.tsx](../../src/components/requests/AttachmentPicker.tsx); `client_reserve_attachments`; M9 M12 M13. |
| Prueba correspondiente | [supabase/tests/ticket_attachment_limits_local.py](../../supabase/tests/ticket_attachment_limits_local.py) |
| Evidencia y alcance | [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **NO VERIFICADO** |

### SEC-001

**Cerrar creador heredado**

| Campo | Especificación |
|---|---|
| Descripción | Cerrar creador heredado. |
| Regla exacta | Revocar EXECUTE de submit_client_request a PUBLIC, anon, authenticated y service_role; propietario conserva llamada interna de M13. |
| Comportamiento esperado | Permisos efectivos y HTTP deniegan creación directa aunque rol tenga grants heredados. |
| Criterio de aceptación | Permisos efectivos y HTTP deniegan creación directa aunque rol tenga grants heredados. |
| Implementación frontend/servidor | [supabase/migrations/20261119000300_security_request_creation.sql](../../supabase/migrations/20261119000300_security_request_creation.sql); `submit_client_request`; M15. |
| Prueba correspondiente | [supabase/tests/security_request_creation_local.py](../../supabase/tests/security_request_creation_local.py) |
| Evidencia y alcance | [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### SEC-002

**Autorización de RPC internas**

| Campo | Especificación |
|---|---|
| Descripción | Autorización de RPC internas. |
| Regla exacta | submit_request y submit_classified_request requieren perfil activo superadmin/admin/developer antes de validar o reutilizar idempotencia. |
| Comportamiento esperado | Perfil ausente/inactivo/viewer rechazado; rol authenticated solo no autoriza. |
| Criterio de aceptación | Perfil ausente/inactivo/viewer rechazado; rol authenticated solo no autoriza. |
| Implementación frontend/servidor | [src/components/requests/PlannerImportModal.tsx](../../src/components/requests/PlannerImportModal.tsx); `submit_request; submit_classified_request`; M15. |
| Prueba correspondiente | [supabase/tests/security_request_creation_local.py](../../supabase/tests/security_request_creation_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int), [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### SEC-003

**Capacidades cliente y ACL**

| Campo | Especificación |
|---|---|
| Descripción | Capacidades cliente y ACL. |
| Regla exacta | EXECUTE de client_submit_request para anon es intencional: exige token propio válido; no conceder SELECT directo en tablas privadas. |
| Comportamiento esperado | Ausencia de sesión obtiene PT401; solo Edge con credencial servidor puede abrir sesiones/códigos. |
| Criterio de aceptación | Ausencia de sesión obtiene PT401; solo Edge con credencial servidor puede abrir sesiones/códigos. |
| Implementación frontend/servidor | [contracts/client-access-client.mjs](../../contracts/client-access-client.mjs); `client_open_session; client_submit_request`; M13 M15. |
| Prueba correspondiente | [supabase/tests/security_request_creation_local.py](../../supabase/tests/security_request_creation_local.py) |
| Evidencia y alcance | [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### SEC-004

**Límite de login M14**

| Campo | Especificación |
|---|---|
| Descripción | Límite de login M14. |
| Regla exacta | 10 intentos por identidad, 50 por IP y 2000 globales en ventanas fijas de 15 minutos; buckets SHA-256, solo service_role invoca contador. |
| Comportamiento esperado | Antes del proveedor; 429 y Retry-After=900 al exceder; sin contador falla cerrado. |
| Criterio de aceptación | Antes del proveedor; 429 y Retry-After=900 al exceder; sin contador falla cerrado. |
| Implementación frontend/servidor | [supabase/functions/_shared/client-login.mjs](../../supabase/functions/_shared/client-login.mjs); `client_login_throttle`; M14. |
| Prueba correspondiente | [tests/client-login-throttle.test.mjs](../../tests/client-login-throttle.test.mjs); [supabase/tests/client_login_throttle_local.py](../../supabase/tests/client_login_throttle_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int), [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### SEC-005

**Secretos solo servidor**

| Campo | Especificación |
|---|---|
| Descripción | Secretos solo servidor. |
| Regla exacta | No claves privadas en VITE_* ni logs; no guardar credenciales ni exportar tokens a archivos de texto plano, Git o documentación. Error devuelve código seguro; sesión del navegador usa el mecanismo descrito en SECURITY_SPEC. |
| Comportamiento esperado | Navegador solo clave pública y capacidad de su sesión; clave servidor no sustituye identidad de admin. |
| Criterio de aceptación | Navegador solo clave pública y capacidad de su sesión; clave servidor no sustituye identidad de admin. |
| Implementación frontend/servidor | [src/lib/supabase-config.ts](../../src/lib/supabase-config.ts); [supabase/functions/_shared/client-login.mjs](../../supabase/functions/_shared/client-login.mjs); `client-login; admin-users`; M5 M13. |
| Prueba correspondiente | [tests/client-login.test.mjs](../../tests/client-login.test.mjs); [tests/test_client_login_local_launcher.py](../../tests/test_client_login_local_launcher.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### SEC-006

**CORS exacto**

| Campo | Especificación |
|---|---|
| Descripción | CORS exacto. |
| Regla exacta | Lista PROCONT_ALLOWED_ORIGINS compartida por funciones, sin wildcard de aplicación; origen ajeno 403; POST/OPTIONS permitidos. |
| Comportamiento esperado | Dominio oficial OPTIONS 204 con origen exacto y ajeno 403; CORS no es autenticación. |
| Criterio de aceptación | Dominio oficial OPTIONS 204 con origen exacto y ajeno 403; CORS no es autenticación. |
| Implementación frontend/servidor | [supabase/functions/_shared/client-login.mjs](../../supabase/functions/_shared/client-login.mjs); [supabase/functions/_shared/account-admin.mjs](../../supabase/functions/_shared/account-admin.mjs); `client-login; admin-users`; M13. |
| Prueba correspondiente | [tests/client-login.test.mjs](../../tests/client-login.test.mjs) |
| Evidencia y alcance | [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### SEC-007

**Auditoría inmutable de aplicación**

| Campo | Especificación |
|---|---|
| Descripción | Auditoría inmutable de aplicación. |
| Regla exacta | No editar/eliminar/truncar historial operativo por roles app; registrar decisiones en servidor. |
| Comportamiento esperado | Eventos incluyen actor, fecha y valores anterior/nuevo; preservar FKs históricas. |
| Criterio de aceptación | Eventos incluyen actor, fecha y valores anterior/nuevo; preservar FKs históricas. |
| Implementación frontend/servidor | [src/components/requests/RequestTimeline.tsx](../../src/components/requests/RequestTimeline.tsx); `app_private.immutable_board_history`; M12. |
| Prueba correspondiente | [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### SEC-008

**Bucket privado y lectura**

| Campo | Especificación |
|---|---|
| Descripción | Bucket privado y lectura. |
| Regla exacta | request-attachments privado, política de lectura interna; seguimiento público y detalle cliente no crean enlaces de lectura arbitrarios. |
| Comportamiento esperado | No enlaces públicos persistentes ni listado anónimo; URLs internas firmadas expiran. |
| Criterio de aceptación | No enlaces públicos persistentes ni listado anónimo; URLs internas firmadas expiran. |
| Implementación frontend/servidor | [src/lib/attachments.ts](../../src/lib/attachments.ts); `RLS storage.objects`; M8 M9 M12. |
| Prueba correspondiente | [supabase/tests/ticket_security_local.py](../../supabase/tests/ticket_security_local.py) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### OPS-001

**Versión automática**

| Campo | Especificación |
|---|---|
| Descripción | Versión automática. |
| Regla exacta | Mostrar exactamente Versión AAAAMMDDHHmm en pie global; calcular una vez por build usando America/Lima. |
| Comportamiento esperado | Recarga/hora del navegador no cambian etiqueta; compilación de otro minuto corresponde a ese minuto. |
| Criterio de aceptación | Recarga/hora del navegador no cambian etiqueta; compilación de otro minuto corresponde a ese minuto. |
| Implementación frontend/servidor | [src/components/ui/BuildVersion.tsx](../../src/components/ui/BuildVersion.tsx); [src/lib/build-version.ts](../../src/lib/build-version.ts); [vite.config.ts](../../vite.config.ts); `Vite define __BUILD_VERSION__`; —. |
| Prueba correspondiente | [tests/build-version.test.mjs](../../tests/build-version.test.mjs); [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs) |
| Evidencia y alcance | [E-VER](TESTING_SPEC.md#e-ver), [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### OPS-002

**Migraciones ordenadas y preservación**

| Campo | Especificación |
|---|---|
| Descripción | Migraciones ordenadas y preservación. |
| Regla exacta | M1..M15 permanecen íntegras; cambios futuros por nueva migración y autorización; M15 no se revierte reabriendo anon. |
| Comportamiento esperado | Historial 15/15 y huella de solicitudes sin cambios durante activación; sin seeds/roles/Vault ajenos. |
| Criterio de aceptación | Historial 15/15 y huella de solicitudes sin cambios durante activación; sin seeds/roles/Vault ajenos. |
| Implementación frontend/servidor | [supabase/migrations/20261119000300_security_request_creation.sql](../../supabase/migrations/20261119000300_security_request_creation.sql); `Supabase CLI`; M1 M15. |
| Prueba correspondiente | [supabase/tests/integrated_security_client_flow_local.py](../../supabase/tests/integrated_security_client_flow_local.py) |
| Evidencia y alcance | [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **CUMPLE** |

### OPS-003

**Piloto público en Hobby**

| Campo | Especificación |
|---|---|
| Descripción | Piloto público en Hobby. |
| Regla exacta | Elección del usuario: Vercel Hobby gratuito, proyecto ticketera-procont; piloto público con APIs de desarrollo explícitas. |
| Comportamiento esperado | Separar decisión de plan de facturación verificada; no llamar producción a los proveedores del piloto. |
| Criterio de aceptación | Separar decisión de plan de facturación verificada; no llamar producción a los proveedores del piloto. |
| Implementación frontend/servidor | [vercel.json](../../vercel.json); [supabase/functions/_shared/client-login-config.mjs](../../supabase/functions/_shared/client-login-config.mjs); `Vercel; client-login`; —. |
| Prueba correspondiente | [tests/client-login-config.test.mjs](../../tests/client-login-config.test.mjs) |
| Evidencia y alcance | [E-PILOT](TESTING_SPEC.md#e-pilot) |
| Estado actual | **PARCIAL** |

### OPS-004

**Configuración Auth pública**

| Campo | Especificación |
|---|---|
| Descripción | Configuración Auth pública. |
| Regla exacta | Para invitaciones/redirecciones del personal, Site URL y allowlist deben corresponder a destinos HTTPS autorizados. |
| Comportamiento esperado | Estado leído todavía localhost:3000 y allowlist vacía; no declarar invitaciones operativas. |
| Criterio de aceptación | Estado leído todavía localhost:3000 y allowlist vacía; no declarar invitaciones operativas. |
| Implementación frontend/servidor | [supabase/functions/_shared/account-admin.mjs](../../supabase/functions/_shared/account-admin.mjs); `Supabase Auth; admin-users`; M5. |
| Prueba correspondiente | [tests/account-admin.test.mjs](../../tests/account-admin.test.mjs) |
| Evidencia y alcance | [E-PILOT](TESTING_SPEC.md#e-pilot) |
| Estado actual | **NO CUMPLE** |

### OPS-005

**Reutilización segura de sesiones QA**

| Campo | Especificación |
|---|---|
| Descripción | Reutilización segura de sesiones QA. |
| Regla exacta | Reutilizar sesiones vigentes; no solicitar nuevamente contraseñas sin necesidad ni guardar datos en texto plano. Si no hay sesión, marcar prueba pendiente. |
| Comportamiento esperado | No crear identidades de prueba con clave de servidor para evitar login. No hay almacén cifrado reutilizable implementado/verificado. |
| Criterio de aceptación | No crear identidades de prueba con clave de servidor para evitar login. No hay almacén cifrado reutilizable implementado/verificado. |
| Implementación frontend/servidor | [src/lib/client-session-store.ts](../../src/lib/client-session-store.ts); [scripts/run_client_login_local.py](../../scripts/run_client_login_local.py); `client_session_info; Supabase Auth`; M13. |
| Prueba correspondiente | [tests/test_client_login_local_launcher.py](../../tests/test_client_login_local_launcher.py) |
| Evidencia y alcance | [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **PARCIAL** |

### NFR-001

**Interfaz adaptable**

| Campo | Especificación |
|---|---|
| Descripción | Interfaz adaptable. |
| Regla exacta | Portal/formulario/lista legibles en escritorio y móvil; versión en flujo normal, sin tapar controles. |
| Comportamiento esperado | Validación React Chromium 1366x900 y 390x844; no sustituye pruebas de todos los dispositivos. |
| Criterio de aceptación | Validación React Chromium 1366x900 y 390x844; no sustituye pruebas de todos los dispositivos. |
| Implementación frontend/servidor | [src/index.css](../../src/index.css); [src/components/ui/BuildVersion.tsx](../../src/components/ui/BuildVersion.tsx); `—`; —. |
| Prueba correspondiente | [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int), [E-VER](TESTING_SPEC.md#e-ver) |
| Estado actual | **CUMPLE** |

### NFR-002

**Evidencia de pruebas honesta**

| Campo | Especificación |
|---|---|
| Descripción | Evidencia de pruebas honesta. |
| Regla exacta | Clasificar API real, PostgreSQL con stubs, remoto, UI simulada, unidad y build; no sumar ejecuciones distintas ni declarar E2E por mocks. |
| Comportamiento esperado | Cada estado tiene prueba/alcance o NO VERIFICADO; conservar fallos y resultados históricos. |
| Criterio de aceptación | Cada estado tiene prueba/alcance o NO VERIFICADO; conservar fallos y resultados históricos. |
| Implementación frontend/servidor | [tests/ui/fixture-server.mjs](../../tests/ui/fixture-server.mjs); [supabase/tests/integrated_security_client_flow_local.py](../../supabase/tests/integrated_security_client_flow_local.py); `—`; —. |
| Prueba correspondiente | [docs/validation/integration-security-client-flow.json](../../docs/validation/integration-security-client-flow.json) |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **CUMPLE** |

### NFR-003

**No modificar proveedores externos**

| Campo | Especificación |
|---|---|
| Descripción | No modificar proveedores externos. |
| Regla exacta | Integrar mediante adaptadores; no cambiar plataformas Quipu/QuipuFac, contratos externos ni cuentas de otros proyectos Supabase. |
| Comportamiento esperado | Configurar únicamente Ticketera y proyecto xsxdpaiivklqeudgqoqf dentro de autorización. |
| Criterio de aceptación | Configurar únicamente Ticketera y proyecto xsxdpaiivklqeudgqoqf dentro de autorización. |
| Implementación frontend/servidor | [supabase/functions/_shared/client-login.mjs](../../supabase/functions/_shared/client-login.mjs); `client-login`; M13. |
| Prueba correspondiente | [tests/client-login.test.mjs](../../tests/client-login.test.mjs) |
| Evidencia y alcance | [E-DEV](TESTING_SPEC.md#e-dev) |
| Estado actual | **CUMPLE** |

### PENDING-001

**Contratos de producción de proveedores**

| Campo | Especificación |
|---|---|
| Descripción | Contratos de producción de proveedores. |
| Regla exacta | Solicitar endpoints y respuestas verificadas antes de salir del piloto de desarrollo; no inventar URL ni esquema externo completo. |
| Comportamiento esperado | Quipu y QuipuFac confirman URLs, éxito/error, vinculación RUC y condiciones de red por canal autorizado. |
| Criterio de aceptación | Quipu y QuipuFac confirman URLs, éxito/error, vinculación RUC y condiciones de red por canal autorizado. |
| Implementación frontend/servidor | [supabase/functions/_shared/client-login-config.mjs](../../supabase/functions/_shared/client-login-config.mjs); `client-login`; —. |
| Prueba correspondiente | Sin prueba identificada; no inventar resultado. |
| Evidencia y alcance | [E-PILOT](TESTING_SPEC.md#e-pilot) |
| Estado actual | **PENDIENTE DE DECISIÓN** |

### PENDING-002

**Política SLA futura**

| Campo | Especificación |
|---|---|
| Descripción | Política SLA futura. |
| Regla exacta | No existe política SLA oficial; cualquier definición futura de plazos/calendarios exige decisión del usuario. |
| Comportamiento esperado | Conservar campos históricos sin activar cálculos ni promesas de atención nuevas. |
| Criterio de aceptación | Conservar campos históricos sin activar cálculos ni promesas de atención nuevas. |
| Implementación frontend/servidor | [src/lib/metrics-adapter.ts](../../src/lib/metrics-adapter.ts); `app_private.board_creation_payload`; M12. |
| Prueba correspondiente | Sin prueba identificada; no inventar resultado. |
| Evidencia y alcance | [E-INT](TESTING_SPEC.md#e-int) |
| Estado actual | **PENDIENTE DE DECISIÓN** |

### PENDING-003

**Consistencia futura RUC y estudio**

| Campo | Especificación |
|---|---|
| Descripción | Consistencia futura RUC y estudio. |
| Regla exacta | La asociación explícita valida RUC al establecerla; client_studio después solo vuelve a exigir estudio activo, no compara de nuevo el RUC. |
| Comportamiento esperado | Registrar riesgo preventivo si se cambia el RUC del estudio; requiere revisión antes de esa operación, sin reasignación automática. |
| Criterio de aceptación | Registrar riesgo preventivo si se cambia el RUC del estudio; requiere revisión antes de esa operación, sin reasignación automática. |
| Implementación frontend/servidor | [supabase/migrations/20261119000100_client_access.sql](../../supabase/migrations/20261119000100_client_access.sql); `set_client_company_studio; app_private.client_studio`; M13. |
| Prueba correspondiente | Sin prueba identificada; no inventar resultado. |
| Evidencia y alcance | [E-M15](TESTING_SPEC.md#e-m15) |
| Estado actual | **PARCIAL** |

## Pendientes reales y decisiones

- Completar evidencia post-M15 de creación, Mis tickets, detalle ajeno, Storage real, bandeja visual y logout; no crear tickets sin autorización vigente y sin descartar notificaciones externas.
- Confirmar endpoints/contratos de producción antes de salir del piloto; hoy no están definidos en este registro.
- Completar Auth Site URL/redirecciones para personal/invitaciones; GET de revisión aún devuelve localhost y allowlist vacía.
- Confirmar implementación de almacenamiento cifrado para credenciales QA: no existe evidencia de un almacén reutilizable disponible. Las sesiones históricas de clientes estaban vencidas/revocadas en la lectura de M15.
- Riesgo preventivo de cambio posterior del RUC de un estudio explícitamente asociado; no corregirlo mediante reasignaciones automáticas.
- Exportación sin snapshot único y Mis tickets sin controles de paginación más allá de su primer lote: limitaciones visibles, sin inventar cuotas ni prometer exportación consistente bajo toda concurrencia.

Decisiones cronológicas y sustituciones: [DECISION_LOG.md](DECISION_LOG.md). Relación completa ID→documento→código→SQL→prueba→evidencia: [TRACEABILITY_MATRIX.md](TRACEABILITY_MATRIX.md).
