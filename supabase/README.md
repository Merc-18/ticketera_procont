# Migraciones de Ticketera Procont

La única secuencia nueva de migraciones está en `migrations/`, ordenada por el
prefijo de versión. Está diseñada para un Supabase vacío, con `auth.users`,
`auth.uid()` y los roles de plataforma ya existentes.

1. `20261117000100_schema.sql`: tablas, restricciones, índices y cierre inicial
   de acceso. No contiene cuentas ni registros de negocio.
2. `20261117000200_security.sql`: permisos de columnas y políticas RLS.
3. `20261117000300_operations.sql`: funciones transaccionales, triggers,
   integración Auth, relaciones PostgREST y publicación Realtime.
4. `20261117000400_reference_checklists.sql`: 35 pasos genéricos de checklist,
   configurables por administradores. No contiene datos empresariales.

Cada archivo es transaccional y debe aplicarse una vez mediante un historial de
migraciones. No ejecutar sobre un esquema de negocio existente ni sustituir el
historial con `IF NOT EXISTS`. No ejecutar los SQL históricos de la raíz.

`tests/` contiene exclusivamente soporte y registros ficticios para PostgreSQL
aislado. `tests/support/auth_stub.sql` NO es una migración y NO debe aplicarse a
Supabase: simula solo la parte mínima de Auth utilizada por las pruebas.

En FASE 2A no se ha configurado un enlace remoto, creado `.env.local`, llamado a
Supabase ni aplicado estas migraciones fuera del clúster temporal de pruebas.
No hay credenciales ni un identificador de proyecto remoto en este directorio.

El esquema, la matriz RLS, los contratos de RPC, la reproducción de pruebas y
los requisitos de integración están en
[docs/fase-2a-supabase.md](../docs/fase-2a-supabase.md).
