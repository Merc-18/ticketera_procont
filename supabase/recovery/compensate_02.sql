-- Migration 2 compensation BODY: execute only via the guarded offline builder.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_temp.procont_recovery_guard WHERE stage=2) THEN
    RAISE EXCEPTION 'Missing reviewed recovery context';
  END IF;
END $$;
DELETE FROM pg_temp.procont_recovery_guard WHERE stage=2;
DROP POLICY editor_activity ON public.activity_logs RESTRICT;
DROP POLICY member_read ON public.activity_logs RESTRICT;
DROP POLICY editor_delete ON public.checklist_items RESTRICT;
DROP POLICY editor_insert ON public.checklist_items RESTRICT;
DROP POLICY editor_update ON public.checklist_items RESTRICT;
DROP POLICY member_read ON public.checklist_items RESTRICT;
DROP POLICY admin_templates ON public.checklist_templates RESTRICT;
DROP POLICY member_read ON public.checklist_templates RESTRICT;
DROP POLICY editor_comment ON public.comments RESTRICT;
DROP POLICY member_read ON public.comments RESTRICT;
DROP POLICY editor_notification ON public.notifications RESTRICT;
DROP POLICY own_notification_read ON public.notifications RESTRICT;
DROP POLICY own_notifications ON public.notifications RESTRICT;
DROP POLICY editor_update ON public.project_flows RESTRICT;
DROP POLICY member_read ON public.project_flows RESTRICT;
DROP POLICY editor_update ON public.projects RESTRICT;
DROP POLICY member_read ON public.projects RESTRICT;
DROP POLICY member_read ON public.requests RESTRICT;
DROP POLICY member_read ON public.users RESTRICT;
DROP POLICY own_profile ON public.users RESTRICT;
DROP FUNCTION app_private.has_role(allowed text[]) RESTRICT;
DROP FUNCTION app_private.can_read_project(p_id uuid) RESTRICT;
