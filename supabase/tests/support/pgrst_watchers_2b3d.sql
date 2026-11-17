-- LOCAL MODEL ONLY. Not the installed Supabase handlers, never apply remotely.
-- Models schema-cache notifications for the DDL exercised by the new tests.
CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_event_trigger_ddl_commands() AS change
    WHERE change.command_tag = ANY (ARRAY['CREATE SCHEMA','CREATE TABLE',
      'ALTER TABLE','CREATE FUNCTION','CREATE TRIGGER','CREATE TYPE'])
      AND change.schema_name IS DISTINCT FROM 'pg_temp') THEN
    PERFORM pg_catalog.pg_notify('pgrst','reload schema');
  END IF;
END $$;
CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_event_trigger_dropped_objects() AS removed
    WHERE NOT removed.is_temporary AND removed.object_type = ANY (
      ARRAY['table','schema','function','trigger','type','rule'])) THEN
    PERFORM pg_catalog.pg_notify('pgrst','reload schema');
  END IF;
END $$;
