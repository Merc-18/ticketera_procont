-- Migration 1 compensation BODY: execute only via the guarded offline builder.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_temp.procont_recovery_guard WHERE stage=1) THEN
    RAISE EXCEPTION 'Missing reviewed recovery context';
  END IF;
END $$;
DELETE FROM pg_temp.procont_recovery_guard WHERE stage=1;
DROP TABLE public.users, public.requests, public.projects, public.project_flows, public.checklist_templates, public.checklist_items, public.comments, public.activity_logs, public.notifications, app_private.number_counters, app_private.request_access, app_private.rpc_calls, app_private.security_events RESTRICT;
DROP FUNCTION app_private.valid_phase(flow_type text, phase text) RESTRICT;
DROP SCHEMA app_private RESTRICT;
