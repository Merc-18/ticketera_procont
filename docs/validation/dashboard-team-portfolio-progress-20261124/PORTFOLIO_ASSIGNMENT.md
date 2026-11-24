# Asociación de portafolio al aprobar y crear

Revisión 24/11/2026 · M19 existente; M20 aplicada en Supabase `xsxdpaiivklqeudgqoqf` (historial 21/21).

Flujo canónico: Portafolio → Proyecto/Iniciativa → tickets → checklist. M19 ya contiene catálogos y relaciones. `PortfolioProjectFields` presenta selección dependiente y opción «Ticket independiente / Sin portafolio».

Al aprobar una solicitud, el cliente envía la elección explícita junto al payload existente a `approve_request_with_portfolio(p_request_id uuid,p_payload jsonb,p_portfolio jsonb,p_idempotency_key uuid)`. `mode=portfolio` requiere portfolio UUID y valida en servidor la iniciativa; `mode=independent` rechaza UUID asociados. Reutiliza la aprobación y asociación existentes, en la misma transacción; auditoría, permisos admin/superadmin e idempotencia preservados. Fallo de una fase revierte toda la operación.

Las dos modalidades de `create_internal_ticket` M19 se conservan. Pruebas de contrato/UI ficticias cubren opción independiente, selección dependiente y payload. La evidencia PostgreSQL local previa cubrió pertenencia incorrecta, atomicidad, auditoría y reintento; no se reejecutó en esta sesión. No hubo escrituras remotas.
