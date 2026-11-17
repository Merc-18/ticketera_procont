-- Ticketera Procont 2B.3D. Follow-up metadata only; PREPARED, NOT EXECUTED.
-- Run in the actual authorized migration connection; linked db query may use Management API.
-- UNA consulta SELECT, solo catalogos, para una futura conexion de migracion autorizada.
-- SQL Editor o db query enlazado via Management API no prueban la conexion de db push.
-- Preparada, NO ejecutada por el agente. No requiere URL, claves ni contrasenas.
-- No lee filas de public/auth/storage/realtime ni del historial de migraciones.
-- No lee cuerpos/defaults/expresiones SQL, opciones de conexion, passwords o tokens.
-- No invoca RPC, funciones de aplicacion, SQL dinamico ni cambia la sesion.
-- Detalle: objetos de esquemas no internos; esquemas del motor: nombres y conteos.
-- Exportar TODAS las filas: metadata_row_number debe llegar a total_metadata_rows.
-- El resultado es un preflight catalogal, NO es procont-recovery-v1 ni 0.json.
WITH
context AS (
  SELECT r.oid AS actor_oid, r.rolname AS actor_name,
         r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb,
         r.rolcanlogin, r.rolreplication, r.rolbypassrls,
         d.oid AS database_oid, d.datname, d.datdba, d.datacl,
         pg_catalog.current_setting('server_version_num')::integer AS server_version_num
  FROM pg_catalog.pg_roles r
  CROSS JOIN pg_catalog.pg_database d
  WHERE r.rolname = CURRENT_USER AND d.datname = pg_catalog.current_database()
),
namespaces AS (
  SELECT oid, nspname, nspowner, nspacl,
         nspname !~ '^pg_' AND nspname <> 'information_schema' AS in_scope
  FROM pg_catalog.pg_namespace
),
relations AS (
  SELECT r.oid, r.relnamespace, n.nspname, r.relname, r.relkind, r.relowner,
         r.relacl, r.relrowsecurity, r.relforcerowsecurity, r.relreplident,
         r.relpersistence, r.relispartition
  FROM pg_catalog.pg_class r
  JOIN namespaces n ON n.oid = r.relnamespace AND n.in_scope
),
columns AS (
  SELECT r.oid AS relation_oid, r.nspname, r.relname, r.relowner,
         a.attnum, a.attname, a.atttypid, a.atttypmod, a.attnotnull,
         a.atthasdef, a.attidentity, a.attgenerated, a.attacl
  FROM relations r
  JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid
  WHERE a.attnum > 0 AND NOT a.attisdropped
    AND r.relkind IN ('r', 'p', 'v', 'm', 'f')
),
routines AS (
  SELECT p.oid, p.pronamespace, n.nspname, p.proname, p.proowner, p.proacl,
         p.proargtypes, p.prorettype, p.proretset, p.pronargs, p.prokind,
         p.prolang, p.prosecdef, p.provolatile, p.proparallel
  FROM pg_catalog.pg_proc p
  JOIN namespaces n ON n.oid = p.pronamespace AND n.in_scope
),
types AS (
  SELECT t.oid, n.nspname, t.typname, t.typowner, t.typacl,
         t.typtype, t.typrelid, t.typbasetype, t.typelem
  FROM pg_catalog.pg_type t
  JOIN namespaces n ON n.oid = t.typnamespace AND n.in_scope
),
other_schema_objects(kind, namespace_oid, object_oid, object_name, owner_oid) AS (
  SELECT 'operator', oprnamespace, oid, oprname::text, oprowner FROM pg_catalog.pg_operator
  UNION ALL SELECT 'operator_class', opcnamespace, oid, opcname::text, opcowner FROM pg_catalog.pg_opclass
  UNION ALL SELECT 'operator_family', opfnamespace, oid, opfname::text, opfowner FROM pg_catalog.pg_opfamily
  UNION ALL SELECT 'collation', collnamespace, oid, collname::text, collowner FROM pg_catalog.pg_collation
  UNION ALL SELECT 'conversion', connamespace, oid, conname::text, conowner FROM pg_catalog.pg_conversion
  UNION ALL SELECT 'text_search_config', cfgnamespace, oid, cfgname::text, cfgowner FROM pg_catalog.pg_ts_config
  UNION ALL SELECT 'text_search_dictionary', dictnamespace, oid, dictname::text, dictowner FROM pg_catalog.pg_ts_dict
  UNION ALL SELECT 'text_search_parser', prsnamespace, oid, prsname::text, NULL::oid FROM pg_catalog.pg_ts_parser
  UNION ALL SELECT 'text_search_template', tmplnamespace, oid, tmplname::text, NULL::oid FROM pg_catalog.pg_ts_template
  UNION ALL SELECT 'statistics_definition', stxnamespace, oid, stxname::text, stxowner FROM pg_catalog.pg_statistic_ext
),
-- A mapping row depends on both its namespace and its publication. Resolving
-- its catalog OID avoids a direct reference to the PG15-only catalog on PG14.
publication_schemas AS (
  SELECT DISTINCT p.oid AS publication_oid, p.pubname, n.nspname
  FROM pg_catalog.pg_depend dn
  JOIN pg_catalog.pg_depend dp
    ON dp.classid = dn.classid AND dp.objid = dn.objid
   AND dp.refclassid = 'pg_catalog.pg_publication'::pg_catalog.regclass
  JOIN pg_catalog.pg_publication p ON p.oid = dp.refobjid
  JOIN namespaces n ON n.oid = dn.refobjid
  WHERE dn.classid = pg_catalog.to_regclass('pg_catalog.pg_publication_namespace')
    AND dn.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
),
-- These names are taken from the unchanged four-file migration/recovery scope.
expected_relation_names(name) AS (
  VALUES
    ('activity_logs'), ('checklist_items'), ('checklist_templates'), ('comments'),
    ('notifications'), ('project_flows'), ('projects'), ('requests'), ('users'),
    ('activity_action_idx'), ('activity_logs_pkey'), ('activity_project_idx'),
    ('activity_user_idx'), ('checklist_flow_phase_idx'), ('checklist_items_pkey'),
    ('checklist_templates_flow_type_phase_order_index_key'), ('checklist_templates_pkey'),
    ('comments_pkey'), ('comments_project_idx'), ('comments_user_idx'),
    ('flows_assigned_idx'), ('notifications_pkey'), ('notifications_project_idx'),
    ('notifications_user_created_idx'), ('project_flows_pkey'),
    ('project_flows_project_id_flow_type_key'), ('projects_pkey'),
    ('projects_project_number_key'), ('projects_request_id_key'), ('projects_sla_idx'),
    ('projects_status_created_idx'), ('requests_created_idx'), ('requests_pkey'),
    ('requests_project_id_key'), ('requests_request_number_key'),
    ('requests_status_created_idx'), ('users_pkey'), ('users_role_active_idx')
),
expected_type_names(name) AS (
  VALUES ('activity_logs'), ('checklist_items'), ('checklist_templates'), ('comments'),
    ('notifications'), ('project_flows'), ('projects'), ('requests'), ('users'),
    ('_activity_logs'), ('_checklist_items'), ('_checklist_templates'), ('_comments'),
    ('_notifications'), ('_project_flows'), ('_projects'), ('_requests'), ('_users')
),
expected_routine_names(name) AS (
  VALUES ('submit_request'), ('track_request'), ('create_internal_project'),
    ('approve_request'), ('reject_request'), ('change_project_type'),
    ('update_request_details'), ('admin_update_user'), ('purge_project'),
    ('requests'), ('projects')
),
collisions(kind, object_name, object_oid) AS (
  SELECT 'relation', pg_catalog.format('%I.%I', r.nspname, r.relname), r.oid
  FROM relations r JOIN expected_relation_names e ON e.name = r.relname
  WHERE r.nspname = 'public'
  UNION ALL
  SELECT 'type', pg_catalog.format('%I.%I', t.nspname, t.typname), t.oid
  FROM types t JOIN expected_type_names e ON e.name = t.typname
  WHERE t.nspname = 'public'
  UNION ALL
  SELECT 'routine', pg_catalog.format('%I.%I(%s)', p.nspname, p.proname,
         pg_catalog.pg_get_function_identity_arguments(p.oid)), p.oid
  FROM routines p JOIN expected_routine_names e ON e.name = p.proname
  WHERE p.nspname = 'public'
),
auth_users AS (
  SELECT r.oid, r.relowner FROM relations r
  WHERE r.nspname = 'auth' AND r.relname = 'users' AND r.relkind IN ('r', 'p')
),
auth_uid AS (
  SELECT p.oid FROM routines p
  WHERE p.nspname = 'auth' AND p.proname = 'uid' AND p.pronargs = 0
    AND p.prokind = 'f' AND NOT p.proretset
    AND p.prorettype = 'pg_catalog.uuid'::pg_catalog.regtype
),
ledger AS (
  SELECT r.oid, r.relowner FROM relations r
  WHERE r.nspname = 'supabase_migrations' AND r.relname = 'schema_migrations'
    AND r.relkind = 'r'
),
checks AS (
  SELECT q.check_name, q.satisfied, q.purpose
  FROM context c
  CROSS JOIN LATERAL (VALUES
    ('postgresql_15_or_newer', c.server_version_num >= 150000,
     'Version minima del inventario/recuperacion 2B.3B; no valida servicios alojados'),
    ('platform_roles_present',
     (SELECT pg_catalog.count(*) = 3 FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role')),
     'Roles de plataforma requeridos, sin crear ninguno'),
    ('database_create', pg_catalog.has_database_privilege(c.actor_oid, c.database_oid, 'CREATE'),
     'Crear app_private; se comprueba el rol actual, no un futuro rol CLI'),
    ('database_temporary', pg_catalog.has_database_privilege(c.actor_oid, c.database_oid, 'TEMPORARY'),
     'Tabla temporal del bundle de compensacion'),
    ('public_usage_and_create', COALESCE((SELECT
       pg_catalog.has_schema_privilege(c.actor_oid,n.oid,'USAGE')
       AND pg_catalog.has_schema_privilege(c.actor_oid,n.oid,'CREATE')
       FROM namespaces n WHERE n.nspname='public'), false),
     'Crear y referenciar objetos public'),
    ('public_owner_privileges_available', COALESCE((SELECT
       c.rolsuper OR pg_catalog.pg_has_role(c.actor_oid,n.nspowner,'USAGE')
       FROM namespaces n WHERE n.nspname='public'), false),
     'Administrar permisos de public sin presumir que CREATE equivale a propiedad'),
    ('public_acl_owner_grantors_only', NOT EXISTS (SELECT 1 FROM namespaces n
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
       WHERE n.nspname='public' AND a.grantor<>n.nspowner),
     'La compensacion preparada rechaza grantors ajenos al propietario en ACL que debe restaurar'),
    ('private_schema_absent', NOT EXISTS (SELECT 1 FROM namespaces WHERE nspname='app_private'),
     'No apropiarse de un esquema app_private preexistente'),
    ('target_names_absent', NOT EXISTS (SELECT 1 FROM collisions),
     'Incluye tablas, indices, tipos de fila/array y TODAS las sobrecargas de nombres RPC'),
    ('auth_schema_usage', COALESCE((SELECT pg_catalog.has_schema_privilege(c.actor_oid,n.oid,'USAGE')
       FROM namespaces n WHERE n.nspname='auth'), false),
     'Referencias al esquema de plataforma, sin leer cuentas'),
    ('auth_users_shape', EXISTS (SELECT 1 FROM auth_users u WHERE
       EXISTS (SELECT 1 FROM columns a WHERE a.relation_oid=u.oid AND a.attname='id'
         AND a.atttypid='pg_catalog.uuid'::pg_catalog.regtype AND a.attnotnull)
       AND EXISTS (SELECT 1 FROM columns a WHERE a.relation_oid=u.oid AND a.attname='email'
         AND a.atttypid IN ('pg_catalog.text'::pg_catalog.regtype,'pg_catalog.varchar'::pg_catalog.regtype))
       AND EXISTS (SELECT 1 FROM columns a WHERE a.relation_oid=u.oid AND a.attname='raw_user_meta_data'
         AND a.atttypid='pg_catalog.jsonb'::pg_catalog.regtype)
       AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k JOIN columns a
         ON a.relation_oid=k.conrelid AND a.attname='id'
         WHERE k.conrelid=u.oid AND k.contype IN ('p','u')
           AND k.conkey=ARRAY[a.attnum] AND NOT k.condeferrable)),
     'Columnas y clave de Auth esperadas; no prueba ausencia de usuarios'),
    ('auth_id_references', COALESCE((SELECT pg_catalog.has_column_privilege(
       c.actor_oid,a.relation_oid,a.attnum,'REFERENCES') FROM columns a
       JOIN auth_users u ON u.oid=a.relation_oid WHERE a.attname='id'), false),
     'FK hacia auth.users(id), comprobacion de privilegio sin leer filas'),
    ('auth_profile_source_select', EXISTS (SELECT 1 FROM auth_users u WHERE
       NOT pg_catalog.row_security_active(u.oid)
       AND (SELECT pg_catalog.count(*)=3 AND pg_catalog.bool_and(pg_catalog.has_column_privilege(
         c.actor_oid,a.relation_oid,a.attnum,'SELECT')) FROM columns a
         WHERE a.relation_oid=u.oid AND a.attname IN ('id','email','raw_user_meta_data'))),
     'Provision privada: SELECT de tres columnas y sin RLS que oculte cuentas; no se lee ninguna cuenta'),
    ('auth_uid_uuid_and_execute', COALESCE((SELECT pg_catalog.has_function_privilege(c.actor_oid,u.oid,'EXECUTE')
       FROM auth_uid u), false),
     'auth.uid() existe con retorno uuid y EXECUTE; no se invoca'),
    ('builtin_uuid_available', COALESCE(pg_catalog.has_function_privilege(c.actor_oid,
       pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()'),'EXECUTE'), false),
     'Generador UUID de PostgreSQL; no se ejecuta'),
    ('trusted_languages_usage', (SELECT pg_catalog.count(*)=2 AND COALESCE(pg_catalog.bool_and(l.lanpltrusted
       AND pg_catalog.has_language_privilege(c.actor_oid,l.oid,'USAGE')),false)
       FROM pg_catalog.pg_language l WHERE l.lanname IN ('sql','plpgsql')),
     'Lenguajes requeridos por las funciones preparadas'),
    ('realtime_publication_present_and_not_all', EXISTS (SELECT 1 FROM pg_catalog.pg_publication
       WHERE pubname='supabase_realtime' AND NOT puballtables),
     'Requisito del plan de recuperacion; no crea ni cambia la publicacion'),
    ('realtime_owner_privileges_available', COALESCE((SELECT
       c.rolsuper OR pg_catalog.pg_has_role(c.actor_oid,p.pubowner,'USAGE')
       FROM pg_catalog.pg_publication p WHERE p.pubname='supabase_realtime'), false),
     'ALTER PUBLICATION requiere propiedad; las tablas nuevas deben pertenecer al operador'),
    ('no_all_tables_publications', NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE puballtables),
     'Evitar incorporacion automatica de tablas nuevas a otra publicacion'),
    ('no_schema_wide_publications', NOT EXISTS (SELECT 1 FROM publication_schemas),
     'El plan de recuperacion requiere revisar aparte publicaciones por esquema'),
    ('ledger_structure_ready', CASE WHEN NOT EXISTS (SELECT 1 FROM ledger) THEN NULL::boolean ELSE EXISTS (SELECT 1 FROM ledger h WHERE
       EXISTS (SELECT 1 FROM columns a WHERE a.relation_oid=h.oid AND a.attname='version'
         AND a.atttypid='pg_catalog.text'::pg_catalog.regtype AND a.attnotnull)
       AND EXISTS (SELECT 1 FROM columns a WHERE a.relation_oid=h.oid AND a.attname='name'
         AND a.atttypid='pg_catalog.text'::pg_catalog.regtype)
       AND EXISTS (SELECT 1 FROM columns a WHERE a.relation_oid=h.oid AND a.attname='statements'
         AND a.atttypid='pg_catalog.text[]'::pg_catalog.regtype)
       AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k JOIN columns a
         ON a.relation_oid=k.conrelid AND a.attname='version'
         WHERE k.conrelid=h.oid AND k.contype='p' AND k.conkey=ARRAY[a.attnum]
           AND NOT k.condeferrable)) END,
     'Si falta es normal en proyecto nuevo: lo inicializa CLI; no crear manualmente'),
    ('ledger_select_insert_delete', CASE WHEN NOT EXISTS (SELECT 1 FROM ledger) THEN NULL::boolean ELSE COALESCE((SELECT
       pg_catalog.has_table_privilege(c.actor_oid,h.oid,'SELECT')
       AND pg_catalog.has_table_privilege(c.actor_oid,h.oid,'INSERT')
       AND pg_catalog.has_table_privilege(c.actor_oid,h.oid,'DELETE') FROM ledger h), false) END,
     'Historial nativo futuro: si no existe, privilegios quedan pendientes de inicializacion CLI'),
    ('ddl_event_trigger_effects_reviewed', CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_event_trigger
       WHERE evtenabled<>'D') THEN NULL::boolean ELSE true END,
     'Seis handlers identificados y revisados por fuente publica en 2B.3D; igualdad con codigo alojado no comprobada'),
    ('business_and_auth_rows_empty', NULL::boolean,
     'Fuera de alcance: no se consultan cuentas ni registros de negocio'),
    ('migration_history_empty', NULL::boolean,
     'Fuera de alcance: no se consultan versiones/filas del ledger; se conserva la declaracion Dashboard previa'),
    ('same_identity_as_future_cli', NULL::boolean,
     'No se presupone que SQL Editor y una futura conexion CLI ejecuten como el mismo rol')
  ) q(check_name,satisfied,purpose)
),
acl_objects(category, schema_name, object_name, owner_oid, acl) AS (
  SELECT 'database', NULL::text, c.datname::text, c.datdba,
         COALESCE(c.datacl,pg_catalog.acldefault('d',c.datdba)) FROM context c
  UNION ALL
  SELECT 'schema', n.nspname::text, n.nspname::text, n.nspowner,
         COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner)) FROM namespaces n WHERE n.in_scope
  UNION ALL
  SELECT 'relation', r.nspname::text, pg_catalog.format('%I.%I',r.nspname,r.relname), r.relowner,
         COALESCE(r.relacl,pg_catalog.acldefault(CASE WHEN r.relkind='S' THEN 'S' ELSE 'r' END::pg_catalog."char",r.relowner))
  FROM relations r WHERE r.relkind IN ('r','p','v','m','f','S')
  UNION ALL
  SELECT 'column', a.nspname::text, pg_catalog.format('%I.%I.%I',a.nspname,a.relname,a.attname),
         a.relowner, a.attacl FROM columns a WHERE a.attacl IS NOT NULL
  UNION ALL
  SELECT 'routine', p.nspname::text, pg_catalog.format('%I.%I(%s)',p.nspname,p.proname,
         pg_catalog.pg_get_function_identity_arguments(p.oid)), p.proowner,
         COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner)) FROM routines p
  UNION ALL
  SELECT 'type', t.nspname::text, pg_catalog.format('%I.%I',t.nspname,t.typname), t.typowner,
         COALESCE(t.typacl,pg_catalog.acldefault('T',t.typowner)) FROM types t
),
metadata(section, schema_name, object_name, details) AS (
  SELECT '00_context', NULL::text, 'execution', pg_catalog.jsonb_build_object(
    'format','procont-catalog-preflight-v2-2b3d','base_commit','11b2c15',
    'captured_at',CURRENT_TIMESTAMP,'server_version_num',c.server_version_num,
    'server_version',pg_catalog.current_setting('server_version'),
    'major_version',c.server_version_num/10000,'database',c.datname,'database_oid',c.database_oid,
    'current_user',CURRENT_USER,'session_user',SESSION_USER,
    'transaction_read_only',pg_catalog.current_setting('transaction_read_only'),
    'statement_is_catalog_select_only',true,'recovery_baseline_compatible',false,
    'object_scope','All schema names; detailed non-system objects, including managed platform schemas',
    'omitted','Business/Auth/history rows; credentials; settings; SQL bodies/defaults/expressions; engine object details')
  FROM context c
  UNION ALL
  SELECT '01_summary', NULL, 'catalog_compatibility', pg_catalog.jsonb_build_object(
    'result',CASE WHEN EXISTS (SELECT 1 FROM checks WHERE satisfied IS false)
      THEN 'BLOCKERS_IN_CATALOG_METADATA' ELSE 'NO_CATALOG_BLOCKER_DETECTED_REVIEW_STILL_REQUIRED' END,
    'failed_checks',(SELECT pg_catalog.count(*) FROM checks WHERE satisfied IS false),
    'pending_checks',(SELECT pg_catalog.count(*) FROM checks WHERE satisfied IS NULL),
    'authorization_to_apply',false,'counts_are_catalog_metadata_not_business_rows',true)
  UNION ALL
  SELECT '02_checks', NULL, check_name, pg_catalog.jsonb_build_object(
    'status',CASE WHEN satisfied IS NULL THEN 'PENDING' WHEN satisfied THEN 'PASS' ELSE 'BLOCKER' END,
    'satisfied',satisfied,'purpose',purpose) FROM checks
  UNION ALL
  SELECT '03_collisions', 'public', object_name, pg_catalog.jsonb_build_object('kind',kind,'oid',object_oid)
  FROM collisions
  UNION ALL
  SELECT '10_schemas', n.nspname, n.nspname, pg_catalog.jsonb_build_object(
    'oid',n.oid,'owner',pg_catalog.pg_get_userbyid(n.nspowner),'objects_detailed',n.in_scope,
    'usage',pg_catalog.has_schema_privilege(c.actor_oid,n.oid,'USAGE'),
    'create',pg_catalog.has_schema_privilege(c.actor_oid,n.oid,'CREATE'),
    'owner_privileges_available',c.rolsuper OR pg_catalog.pg_has_role(c.actor_oid,n.nspowner,'USAGE'),
    'relation_count',(SELECT pg_catalog.count(*) FROM pg_catalog.pg_class r WHERE r.relnamespace=n.oid),
    'routine_count',(SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p WHERE p.pronamespace=n.oid),
    'type_count',(SELECT pg_catalog.count(*) FROM pg_catalog.pg_type t WHERE t.typnamespace=n.oid))
  FROM namespaces n CROSS JOIN context c
  UNION ALL
  SELECT '20_relations', r.nspname, r.relname, pg_catalog.jsonb_build_object(
    'oid',r.oid,'kind',r.relkind,'owner',pg_catalog.pg_get_userbyid(r.relowner),
    'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,'replica_identity',r.relreplident,
    'persistence',r.relpersistence,'partition',r.relispartition,
    'owner_privileges_available',c.rolsuper OR pg_catalog.pg_has_role(c.actor_oid,r.relowner,'USAGE'),
    'select',CASE WHEN r.relkind IN ('r','p','v','m','f') THEN pg_catalog.has_table_privilege(c.actor_oid,r.oid,'SELECT') END,
    'trigger',CASE WHEN r.relkind IN ('r','p','v','f') THEN pg_catalog.has_table_privilege(c.actor_oid,r.oid,'TRIGGER') END)
  FROM relations r CROSS JOIN context c
  UNION ALL
  SELECT '21_columns', a.nspname, pg_catalog.format('%I.%I',a.relname,a.attname), pg_catalog.jsonb_build_object(
    'relation_oid',a.relation_oid,'number',a.attnum,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
    'type_oid',a.atttypid,'not_null',a.attnotnull,'has_default_or_generation',a.atthasdef,
    'identity',a.attidentity,'generated',a.attgenerated,
    'select',pg_catalog.has_column_privilege(c.actor_oid,a.relation_oid,a.attnum,'SELECT'),
    'references',pg_catalog.has_column_privilege(c.actor_oid,a.relation_oid,a.attnum,'REFERENCES'))
  FROM columns a CROSS JOIN context c
  UNION ALL
  SELECT '22_constraints', r.nspname, pg_catalog.format('%I.%I',r.relname,k.conname), pg_catalog.jsonb_build_object(
    'oid',k.oid,'kind',k.contype,'columns',k.conkey,'referenced_relation_oid',k.confrelid,
    'referenced_columns',k.confkey,'validated',k.convalidated,'deferrable',k.condeferrable,
    'initially_deferred',k.condeferred)
  FROM pg_catalog.pg_constraint k JOIN relations r ON r.oid=k.conrelid
  UNION ALL
  SELECT '23_indexes', r.nspname, r.relname, pg_catalog.jsonb_build_object(
    'oid',r.oid,'table_oid',i.indrelid,'unique',i.indisunique,'primary',i.indisprimary,
    'valid',i.indisvalid,'ready',i.indisready,'keys',i.indkey::text,
    'partial',i.indpred IS NOT NULL,'has_expressions',i.indexprs IS NOT NULL)
  FROM pg_catalog.pg_index i JOIN relations r ON r.oid=i.indexrelid
  UNION ALL
  SELECT '24_types', t.nspname, t.typname, pg_catalog.jsonb_build_object(
    'oid',t.oid,'kind',t.typtype,'owner',pg_catalog.pg_get_userbyid(t.typowner),
    'relation_oid',t.typrelid,'base_type_oid',t.typbasetype,'element_type_oid',t.typelem,
    'usage',pg_catalog.has_type_privilege(c.actor_oid,t.oid,'USAGE'))
  FROM types t CROSS JOIN context c
  UNION ALL
  SELECT '25_routines', p.nspname, pg_catalog.format('%I(%s)',p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid)), pg_catalog.jsonb_build_object(
    'oid',p.oid,'kind',p.prokind,'owner',pg_catalog.pg_get_userbyid(p.proowner),
    'language_oid',p.prolang,'return_type',pg_catalog.format_type(p.prorettype,NULL),
    'returns_set',p.proretset,'security_definer',p.prosecdef,'volatility',p.provolatile,
    'parallel',p.proparallel,'execute',pg_catalog.has_function_privilege(c.actor_oid,p.oid,'EXECUTE'))
  FROM routines p CROSS JOIN context c
  UNION ALL
  SELECT '26_other_schema_objects', n.nspname, pg_catalog.format('%s:%I#%s',o.kind,o.object_name,o.object_oid),
    pg_catalog.jsonb_build_object('oid',o.object_oid,'kind',o.kind,
      'owner',CASE WHEN o.owner_oid IS NOT NULL THEN pg_catalog.pg_get_userbyid(o.owner_oid) END)
  FROM other_schema_objects o JOIN namespaces n ON n.oid=o.namespace_oid AND n.in_scope
  UNION ALL
  SELECT '30_policies', r.nspname, pg_catalog.format('%I.%I',r.relname,p.polname), pg_catalog.jsonb_build_object(
    'oid',p.oid,'command',p.polcmd,'permissive',p.polpermissive,
    'roles',(SELECT pg_catalog.jsonb_agg(CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x) END ORDER BY x)
             FROM pg_catalog.unnest(p.polroles) x),
    'using_present',p.polqual IS NOT NULL,'with_check_present',p.polwithcheck IS NOT NULL)
  FROM pg_catalog.pg_policy p JOIN relations r ON r.oid=p.polrelid
  UNION ALL
  SELECT '31_triggers', r.nspname, pg_catalog.format('%I.%I',r.relname,t.tgname), pg_catalog.jsonb_build_object(
    'oid',t.oid,'enabled',t.tgenabled,'internal',t.tgisinternal,'type_bits',t.tgtype,
    'function',pg_catalog.format('%I.%I',n.nspname,p.proname),'function_oid',p.oid,
    'deferrable',t.tgdeferrable,'initially_deferred',t.tginitdeferred,'constraint_oid',t.tgconstraint)
  FROM pg_catalog.pg_trigger t JOIN relations r ON r.oid=t.tgrelid
  JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN namespaces n ON n.oid=p.pronamespace
  UNION ALL
  SELECT '32_event_triggers', n.nspname, e.evtname, pg_catalog.jsonb_build_object(
    'oid',e.oid,'owner',pg_catalog.pg_get_userbyid(e.evtowner),'event',e.evtevent,
    'enabled',e.evtenabled,'tags',e.evttags,'function',pg_catalog.format('%I.%I',n.nspname,p.proname))
  FROM pg_catalog.pg_event_trigger e JOIN pg_catalog.pg_proc p ON p.oid=e.evtfoid
  JOIN namespaces n ON n.oid=p.pronamespace
  UNION ALL
  SELECT '33_rules', r.nspname, pg_catalog.format('%I.%I',r.relname,w.rulename), pg_catalog.jsonb_build_object(
    'oid',w.oid,'event_type',w.ev_type,'enabled',w.ev_enabled,'instead',w.is_instead)
  FROM pg_catalog.pg_rewrite w JOIN relations r ON r.oid=w.ev_class
  UNION ALL
  SELECT '40_acl', a.schema_name, a.object_name, pg_catalog.jsonb_build_object(
    'category',a.category,'owner',pg_catalog.pg_get_userbyid(a.owner_oid),
    'grantor',pg_catalog.pg_get_userbyid(g.grantor),
    'grantee',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(g.grantee) END,
    'privilege',g.privilege_type,'grantable',g.is_grantable,
    'grant_available_to_current_role',CASE WHEN g.grantee=0 THEN true
      ELSE pg_catalog.pg_has_role(c.actor_oid,g.grantee,'USAGE') END)
  FROM acl_objects a CROSS JOIN LATERAL pg_catalog.aclexplode(a.acl) g CROSS JOIN context c
  UNION ALL
  SELECT '41_default_acl', n.nspname, pg_catalog.format('%I:%s',pg_catalog.pg_get_userbyid(d.defaclrole),d.defaclobjtype),
    pg_catalog.jsonb_build_object('oid',d.oid,'global',d.defaclnamespace=0,'object_kind',d.defaclobjtype,
      'owner',pg_catalog.pg_get_userbyid(d.defaclrole),'grantor',pg_catalog.pg_get_userbyid(g.grantor),
      'grantee',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(g.grantee) END,
      'privilege',g.privilege_type,'grantable',g.is_grantable)
  FROM pg_catalog.pg_default_acl d LEFT JOIN namespaces n ON n.oid=d.defaclnamespace
  LEFT JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) g ON true
  UNION ALL
  SELECT '42_roles', NULL, r.rolname, pg_catalog.jsonb_build_object(
    'oid',r.oid,'superuser',r.rolsuper,'inherit',r.rolinherit,'create_role',r.rolcreaterole,
    'create_database',r.rolcreatedb,'login',r.rolcanlogin,'replication',r.rolreplication,
    'bypass_rls',r.rolbypassrls,'is_current_user',r.oid=c.actor_oid,
    'privileges_available_without_set_role',pg_catalog.pg_has_role(c.actor_oid,r.oid,'USAGE'),
    'member',pg_catalog.pg_has_role(c.actor_oid,r.oid,'MEMBER'))
  FROM pg_catalog.pg_roles r CROSS JOIN context c
  UNION ALL
  SELECT '43_role_memberships', NULL, pg_catalog.format('%I -> %I',
    pg_catalog.pg_get_userbyid(m.member),pg_catalog.pg_get_userbyid(m.roleid)),
    pg_catalog.jsonb_build_object('member_oid',m.member,'role_oid',m.roleid,
      'grantor',pg_catalog.pg_get_userbyid(m.grantor),'admin_option',m.admin_option,
      'inherit_option',pg_catalog.to_jsonb(m)->'inherit_option','set_option',pg_catalog.to_jsonb(m)->'set_option')
  FROM pg_catalog.pg_auth_members m
  UNION ALL
  SELECT '44_languages', NULL, l.lanname, pg_catalog.jsonb_build_object(
    'oid',l.oid,'owner',pg_catalog.pg_get_userbyid(l.lanowner),'trusted',l.lanpltrusted,
    'usage',pg_catalog.has_language_privilege(c.actor_oid,l.oid,'USAGE'))
  FROM pg_catalog.pg_language l CROSS JOIN context c
  UNION ALL
  SELECT '50_publications', NULL, p.pubname, pg_catalog.jsonb_build_object(
    'oid',p.oid,'owner',pg_catalog.pg_get_userbyid(p.pubowner),'all_tables',p.puballtables,
    'insert',p.pubinsert,'update',p.pubupdate,'delete',p.pubdelete,'truncate',p.pubtruncate,
    'via_partition_root',p.pubviaroot,'owner_privileges_available',
    c.rolsuper OR pg_catalog.pg_has_role(c.actor_oid,p.pubowner,'USAGE'))
  FROM pg_catalog.pg_publication p CROSS JOIN context c
  UNION ALL
  SELECT '51_publication_tables', n.nspname, pg_catalog.format('%I:%I',p.pubname,r.relname),
    pg_catalog.jsonb_build_object('publication',p.pubname,'table',r.relname,
      'relation_oid',r.oid,'membership_oid',m.oid,'membership_mode','explicit',
      'row_and_column_filters_inspected',false,
      'automatic_memberships','See all_tables and publication_schemas; not expanded here')
  FROM pg_catalog.pg_publication_rel m JOIN pg_catalog.pg_publication p ON p.oid=m.prpubid
  JOIN pg_catalog.pg_class r ON r.oid=m.prrelid JOIN namespaces n ON n.oid=r.relnamespace
  UNION ALL
  SELECT '52_publication_schemas', s.nspname, s.pubname,
    pg_catalog.jsonb_build_object('publication_oid',s.publication_oid) FROM publication_schemas s
  UNION ALL
  SELECT '60_extensions', n.nspname, e.extname, pg_catalog.jsonb_build_object(
    'oid',e.oid,'owner',pg_catalog.pg_get_userbyid(e.extowner),'version',e.extversion,
    'relocatable',e.extrelocatable)
  FROM pg_catalog.pg_extension e JOIN namespaces n ON n.oid=e.extnamespace
  UNION ALL
  SELECT '61_extension_members', NULL, e.extname, pg_catalog.jsonb_build_object(
    'catalog',d.classid::pg_catalog.regclass::text,'object_oid',d.objid,'subobject',d.objsubid,
    'extension_oid',e.oid)
  FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_extension e ON e.oid=d.refobjid
  WHERE d.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass AND d.deptype='e'
)
SELECT pg_catalog.row_number() OVER (ORDER BY section,schema_name NULLS FIRST,object_name,details::text)
         AS metadata_row_number,
       pg_catalog.count(*) OVER () AS total_metadata_rows,
       section, schema_name, object_name, details
FROM metadata
ORDER BY metadata_row_number;
