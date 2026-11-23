# Handoff backend → frontend: reconstrucción de experiencia de clientes

Revisión: 23/11/2026. Base comprobada: `a61450c93f5180ecd623d945b100424a47a3a5d3`.
Rama backend: `rebuild/ticketera-client-data-security-20261123`.
Estado inicial: contrato definido; M16 y pruebas locales en preparación. **No desplegado**.
Las decisiones nuevas del usuario prevalecen sobre documentos históricos de main.
Este archivo versionado y su copia `.agent-coordination/client-experience-contract-handoff.md`
son la referencia de integración. Backend no modifica `src/**` ni `contracts/client-access-client.*`.

## 1. Sesión e identidad: contrato de login M13 sin campos nuevos

```ts
type UUID = string;
type Provider = 'quipu' | 'quipufac';
type Session = {
  expires_at: string; entry_context: 'direct' | 'platform';
  identity: {
    id: UUID; provider: Provider; kind: 'user' | 'company';
    username: string | null; subject_source: 'username' | 'provider_id' | 'company';
    verified_name: string | null; name_verified: boolean;
  };
  company: { ruc: string; studio_id: UUID | null; studio_mapping: 'resolved' | 'required' };
};
type LoginReceipt = { session_token: string; session: Session };
```

Mismas acciones Edge y firmas RPC `client_session_info`, `client_products`, `client_logout`.
La capacidad cliente tiene formato M13 de 64 hex y viaja solo en body, nunca en URL/logs.
No es JWT interno. No enviar `identity_id`, `company_id`, `studio_id` ni roles elegidos.

**Quipu:** identidad individual delimitada por proveedor/RUC/username exacto, sensible a
mayúsculas. El UUID de identidad Ticketera y el subject del proveedor siguen siendo internos;
un provider_id nunca puede agrupar usernames distintos. No se unen cuentas por nombre/estudio.
Nombre readonly: `verified_name` si `name_verified === true` y no vacío; si no, username exacto,
etiquetado «Usuario autenticado», sin afirmar que sea nombre personal verificado. El servidor
deriva el mismo valor. Si falta una etiqueta confiable, no inventarla y no enviar solicitud.

**QuipuFac:** identidad empresarial por proveedor/RUC; dos sesiones del mismo RUC comparten
todos los tickets de la cuenta. Quipu y otro RUC permanecen separados. `requester_name` es
nombre declarado obligatorio, editable al crear y guardado por ticket; no otorga permisos.
`businessName` no identifica a una persona. No se introduce identidad individual ni otro login.

Límite existente de nombre guardado: 200 caracteres. Quipu no se trunca ni sustituye libremente;
si su etiqueta autenticada supera el límite, devolver 22023. Normalización existente M11 rechaza
nombres invisibles/vacíos; no transforma username a minúsculas para autorizar.

## 2. Prioridad y urgencia son campos independientes

```ts
type RequestedPriority = 'low' | 'medium' | 'high' | 'urgent';
const labels = {low:'Bajo', medium:'Medio', high:'Alto', urgent:'Urgente'};
```

Nuevo campo `requested_priority`, default para **nuevas** solicitudes `medium`. Omitido → medium;
null explícito/tipo incorrecto/otro valor → 22023. Históricos → null, sin rellenarlos ni inferirlos.

`urgent_requested` conserva su semántica M13/M11: booleano independiente, default false si se
omite. **No calcularlo a partir de requested_priority, ni al revés.** `urgent` + false y `low`
+ true son combinaciones válidas. No inferir una selección del cliente a partir de la otra.
La prioridad administrativa `projects.priority` sigue siendo asignada por el personal autorizado.

## 3. Producto/sistema y subproyectos

`catalog_systems` es el catálogo de productos, enviado como `system_id`.
`catalog_subsystems.system_id` determina sus hijos. `public.projects` es trabajo operativo del
tablero y no alimenta este selector. No fijar ejemplos universales ni crear asociaciones.

```ts
type ClientProduct = {id: UUID; name: string; requires_subproject: boolean};
type ClientSubproject = {id: UUID; system_id: UUID; name: string};
// RPC existente:
client_products({p_session_token: string}): Promise<ClientProduct[]>;
// RPC nueva M16; RETURNS jsonb cuyo valor es un array:
client_subprojects({p_session_token: string, p_system_id: UUID}): Promise<ClientSubproject[]>;
```

Solo productos autorizados y subproyectos activos del producto solicitado. PT401 sesión inválida;
PT403 producto inexistente/inactivo/no autorizado; UUID malformado puede ser 22P02 de PostgREST.
Al cambiar sistema, limpiar `subsystem_id` y descartar resultados tardíos del sistema anterior.
Si `requires_subproject` y existen hijos activos, es obligatorio; si no hay hijos, acepta null
(regla M7 existente). Si requires_subproject=false, elección opcional. Un fallo no equivale a [].
El servidor vuelve a validar existencia/actividad/pertenencia/autorización al crear.

Reglas intactas: Quipu directo todos los productos activos; QuipuFac directo todos excepto Quipu;
platform Quipu solo Quipu; platform QuipuFac solo Quipu_Fac.

## 4. Creación, persistencia e idempotencia

```ts
type ClientSubmitPayload = {
  requester_name?: string; // Quipu opcional/derivado; QuipuFac obligatorio
  system_id: UUID; subsystem_id?: UUID | null; request_type_id: UUID;
  title: string; description: string;
  requested_priority?: RequestedPriority; urgent_requested?: boolean;
};
// Firma existente, no un endpoint adicional:
client_submit_request({
  p_session_token: string, p_payload: ClientSubmitPayload, p_idempotency_key: UUID
}): Promise<{id: UUID; request_number: string; tracking_token: UUID}>;
```

Quipu puede omitir requester_name; si se envía debe coincidir exactamente con el nombre
derivado de identidad autenticada. No acepta un reemplazo libre. QuipuFac exige nombre declarado.
Título trim 1..300; descripción trim 1..20000; tipo activo y todos los UUID válidos.
Estudio lo decide servidor; asociación cero/ambigua exige resolución administrativa, nunca azar.

Ejemplo ficticio QuipuFac:

```json
{
  "p_session_token":"CAPACIDAD_SOLO_EN_MEMORIA",
  "p_payload":{
    "requester_name":"Persona de ejemplo",
    "system_id":"00000000-0000-4000-8000-000000000101",
    "subsystem_id":"00000000-0000-4000-8000-000000000102",
    "request_type_id":"00000000-0000-4000-8000-000000000103",
    "title":"Ejemplo ficticio", "description":"Solicitud ficticia de contrato",
    "requested_priority":"medium", "urgent_requested":false
  },
  "p_idempotency_key":"00000000-0000-4000-8000-000000000104"
}
```

Campos originales nuevos en `public.requests`: `requested_priority`, `requested_subsystem_id`,
`requester_name_source`. El subsystem_id de entrada inicializa `requests.subsystem_id` y se
conserva aparte como `requested_subsystem_id` original. Clasificación interna puede cambiar
`subsystem_id` sin borrar el original. Prioridad solicitada y subproyecto original son inmutables.
No aceptar requester_name_source del navegador. Se deriva `verified_name`, `username` o `declared`;
una corrección interna legítima marca `internal_correction` sin afirmar verificación upstream.

Conservar clave/payload de un envío incierto; mismos datos/identidad/clave → mismo recibo.
Misma clave con payload distinto → 22023; misma clave de otra identidad no revela otro recibo.
Validar sesión antes de replay. No reintentar con otra clave sin resolver resultado anterior.

## 5. Resumen, detalle, paginación y lectura interna

```ts
type RequesterNameSource = 'verified_name'|'username'|'declared'|'internal_correction'|null;
type GeneralStatus = 'received'|'in_review'|'approved_backlog'|'in_progress'|'done'|'blocked'|'rejected';
type TicketSummary = {
  id: UUID; request_number: string; title: string; created_at: string;
  status: 'pending'|'approved'|'rejected'; general_status: GeneralStatus; system_id: UUID;
  requester_name: string; requester_name_verified: boolean; requester_name_source: RequesterNameSource;
  requested_priority: RequestedPriority|null; requested_subsystem_id: UUID|null;
};
type TicketDetail = TicketSummary & {
  description: string; urgent_requested: boolean; rejection_reason: string|null;
  timeline: Array<{action:string;created_at:string;general_status:string|null}>;
};
client_list_tickets({p_session_token:string,p_limit?:number,p_offset?:number}): Promise<TicketSummary[]>;
client_ticket_detail({p_session_token:string,p_request_id:UUID}): Promise<TicketDetail>;
```

Defaults 50/0; limit entero 1..100, offset entero 0..100000. Orden servidor
`created_at DESC,id DESC`, filtrado de propiedad antes de LIMIT/OFFSET. No hay total/count nuevo.
Para listar todas las páginas, avanzar offset por cantidad realmente devuelta hasta respuesta []
(o límite máximo); no asumir total infinito ni tratar fallo como fin. Paginación offset no es
fotografía transaccional: concurrencia puede desplazar filas; deduplicar por id si la UI acumula.
Nunca ampliar identidad para completar una página; empresas QuipuFac comparten su identidad.

Históricos sin nuevos datos devuelven null; no inventar medium ni nombre verificado. Booleano
requester_name_verified true solo para requester_name_source='verified_name'. PT404 para UUID
ajeno o inexistente, sin revocar sesión. Nombre declarado QuipuFac aparece en resumen y detalle.
Seguimiento público REQ sigue exclusivamente número/estado, sin añadir campos privados.

**Bandeja interna:** lectura existente `public.requests` y embedding `requests(public.projects)`
conservan RLS/roles; las columnas nuevas forman parte de sus filas cuando se seleccionan.
Incluir `requested_priority` explícitamente si el adaptador usa proyección de columnas. No se
crea una RPC interna alternativa ni se cambia aprobación. `get_board_ticket` no es el detalle
de la solicitud ni se usa como sustituto. El backend prueba SELECT/embedding internos autorizados.

## 6. Históricos, errores y límites

M13 permite colisión provider_id entre usernames. M16 no reasigna filas ambiguas: enlace antiguo
provider_id sin snapshot del username se deniega hasta revisión con evidencia; username histórico
exacto conserva acceso. Sesiones/códigos antiguos provider_id sin snapshot también fallan cerrados
para impedir que un token antiguo adopte el username sobrescrito. Nuevo login legítimo genera
capacidad segura; no recupera automáticamente propiedad ambigua. Contrato público de login igual.

| SQLSTATE | Comportamiento |
|---|---|
| PT401 | Sesión ausente/incorrecta/vencida/revocada o histórica ambigua; volver al ingreso. |
| PT403 | Producto no autorizado; conservar sesión. |
| PT404 | Ticket ajeno/inexistente/propiedad histórica no demostrada; conservar sesión válida. |
| 22023 | Nombre/prioridad/subproyecto/payload/paginación inválidos; no cerrar sesión. |
| 22P02 | UUID malformado rechazado por transporte/SQL; tratar como entrada inválida. |
| 23514 | Asociación estudio pendiente o intento de alterar entradas originales; no inventar datos. |
| 42501 | ACL/RLS o autorización de capacidad/ventana; no deducir expiración automáticamente. |

No cambiar contratos de adjuntos M9/M13, cuotas, M14 ni permisos M15. Cero escrituras remotas,
logins externos, credenciales o tickets reales en esta tarea. M16 requiere autorización posterior
antes de aplicación remota. Resultados de pruebas y commit final se publicarán al completar backend.
