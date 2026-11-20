# Despliegue y operación de Ticketera Procont

Revisión: **20/11/2026** · Base **`c857a727c8e7640bbce8daada940f973acbf013e`**.

[Requisitos oficiales](specs/PRODUCT_REQUIREMENTS.md) · **[Runbook completo vigente](specs/DEPLOYMENT_SPEC.md)** · [Estado de una página](PROJECT_STATUS.md).

## Estado actual y alcance

Piloto público en https://ticketera-procont.vercel.app, versión **Versión 202611191900**, login habilitado. main conocido c857a72. Vercel Hobby gratuito elegido por usuario; panel/facturación y automatismos no verificados nuevamente. Supabase único xsxdpaiivklqeudgqoqf; M1–M15 aplicadas, evidencia 15/15 del 20/11. GET actual: **client-login v3**, **admin-users v4** ACTIVE; el reporte anterior v2 no es la lectura vigente.

Las dos APIs externas son **de desarrollo**, autorizadas expresamente para este piloto. No llamarlas APIs de producción ni cambiar a URLs no verificadas. Configuración sin fallback y errores reales documentados en [API_CONTRACTS](specs/API_CONTRACTS.md).

## Qué no volver a ejecutar

No aplicar M14/M15 otra vez, no crear otro proyecto Vercel, no repetir bootstrap, no ejecutar compensaciones M1–M4 ni almacenar secretos en un archivo env de texto plano. La clave de servidor solo permanece en Edge; jamás en VITE_* ni como sustituto de un administrador.

El orden histórico fue M14 → configuración/Edge → frontend habilitado → M15 con dry-run exacto. Para cambios futuros, el runbook diferencia fuente, migraciones, Preview, configuración por entorno, promoción y smoke. Este documento no autoriza ninguna de esas acciones.

## Contingencia obligatoria

Después de M15 se conserva el cierre anónimo. No volver a un frontend que exige submit_client_request directo, no reabrir grants ni restaurar automáticamente una DB anterior. Usar versión compatible o corrección hacia adelante revisada. Deshabilitar UI/CORS no revoca sesiones ni garantiza contención completa.

## Pendientes

Creación autenticada exitosa, Mis tickets/detalle ajeno con sesión, Storage real, bandeja interna visual y logout **posteriores a M15** siguen NO VERIFICADOS. No se solicitan de nuevo contraseñas; usar sesión legítima si existe. Auth Site URL aún localhost y redirecciones vacías; SMTP/invitaciones pendientes. [Pruebas y límites](specs/TESTING_SPEC.md).

Guía anterior conservada con contexto en [history/deployment-before-specs-20261120.md](history/deployment-before-specs-20261120.md). Sus comandos/URLs de ejemplo no son el procedimiento vigente.
