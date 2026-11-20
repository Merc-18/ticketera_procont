# Supabase — Ticketera Procont

Revisión: **20/11/2026** · Base **`c857a727c8e7640bbce8daada940f973acbf013e`**.

[Requisitos oficiales](../docs/specs/PRODUCT_REQUIREMENTS.md) · [Modelo y M1–M15](../docs/specs/DATABASE_SPEC.md) · [Permisos](../docs/specs/PERMISSIONS_SPEC.md) · [Estado](../docs/PROJECT_STATUS.md).

Proyecto exclusivo **ticketera-procont — xsxdpaiivklqeudgqoqf**. Historial conocido **15/15**, M15 aplicada y verificada el 20/11/2026. Esta revisión documental no ejecutó SQL ni migraciones; usa [evidencia conservada](../docs/specs/EVIDENCE_20261120.md). GET actual: client-login v3 y admin-users v4 ACTIVE.

## Estructura y mantenimiento

- `migrations/`: quince archivos ordenados, fuente de esquema. No editar ni reenviar aplicadas; nueva modificación requiere nueva migración/autorización.
- `functions/`: dos endpoints existentes, client-login y admin-users; handlers compartidos en _shared. No crear otro sistema de autenticación.
- `tests/`: PostgreSQL aislado con Auth/Storage fixture; no equivale a Supabase alojado. [Comandos](../docs/specs/TESTING_SPEC.md).
- `recovery/`: inventarios y compensaciones de fases históricas, no rollback universal. No ejecutar compensate_01..04 sobre historia actual ni usar repair para aparentar una aplicación.
- `bootstrap/`: inicialización excepcional del primer superadmin; ya existe perfil, no repetir ni exponer por HTTP.
- `config.toml`: configuración local de CLI, no prueba de que la configuración remota sea idéntica.

## Reglas vigentes

M15 cierra EXECUTE directo de submit_client_request a PUBLIC/anon/authenticated/service_role; M13 client_submit_request sigue exigiendo capacidad propia de cliente y llamando al helper como propietario. submit_request y submit_classified_request son internas, perfil activo editor antes de replay. M14 registra 10/identidad, 50/IP, 2000/global por 15 minutos.

M12 fija Development nuevo de ocho fases y conserva históricos; auditoría inmutable, bloqueos con motivo, Done y reapertura controlados. M11 calcula Cycle/Lead desde eventos y conserva nulls. M9/M12 validan reservas y bytes reales de Storage, cuota 4/2500000, bucket privado.

No ejecutar archivos SQL de raíz ni seed_data como instalación. Las guías antiguas de cuatro migraciones y sus hashes son evidencia histórica que se conserva. El procedimiento futuro exige plan exacto, destino autorizado y --skip-vault cuando no se autorizan cambios Vault: [DEPLOYMENT_SPEC](../docs/specs/DEPLOYMENT_SPEC.md).

[README anterior conservado](../docs/history/supabase-README-before-specs-20261120.md).
