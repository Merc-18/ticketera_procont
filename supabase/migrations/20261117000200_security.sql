BEGIN;

CREATE FUNCTION app_private.has_role(allowed text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND is_active AND role = ANY (allowed));
$$;
REVOKE ALL ON FUNCTION app_private.has_role(text[]) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION app_private.can_read_project(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer']) AND EXISTS (
    SELECT 1 FROM public.projects WHERE id=p_id AND
      (status <> 'deleted' OR app_private.has_role(ARRAY['superadmin','admin'])));
$$;
REVOKE ALL ON FUNCTION app_private.can_read_project(uuid) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(text[]), app_private.valid_phase(text,text),
  app_private.can_read_project(uuid) TO authenticated;

-- Active members share this single workspace. Assignment is not an ACL.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','checklist_templates'] LOOP
    EXECUTE format('CREATE POLICY member_read ON public.%I FOR SELECT TO authenticated
      USING ((SELECT app_private.has_role(ARRAY[''superadmin'',''admin'',''developer'',''viewer''])))', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
  END LOOP;
END $$;
CREATE POLICY member_read ON public.requests FOR SELECT TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer']))
    AND (project_id IS NULL OR app_private.can_read_project(project_id)));
CREATE POLICY member_read ON public.project_flows FOR SELECT TO authenticated
  USING (app_private.can_read_project(project_id));
CREATE POLICY member_read ON public.checklist_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_flows f WHERE f.id=project_flow_id));
CREATE POLICY member_read ON public.comments FOR SELECT TO authenticated
  USING (app_private.can_read_project(project_id));
CREATE POLICY member_read ON public.activity_logs FOR SELECT TO authenticated
  USING (app_private.can_read_project(project_id));
GRANT SELECT ON public.requests, public.project_flows, public.checklist_items,
  public.comments, public.activity_logs TO authenticated;
CREATE POLICY member_read ON public.projects FOR SELECT TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer']))
    AND (status <> 'deleted' OR (SELECT app_private.has_role(ARRAY['superadmin','admin']))));
GRANT SELECT ON public.projects, public.notifications TO authenticated;

CREATE POLICY own_profile ON public.users FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) AND (SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])))
  WITH CHECK (id = (SELECT auth.uid()));
GRANT UPDATE (full_name) ON public.users TO authenticated;

CREATE POLICY editor_update ON public.projects FOR UPDATE TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer']))
    AND (status <> 'deleted' OR (SELECT app_private.has_role(ARRAY['superadmin','admin']))))
  WITH CHECK ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer']))
    AND (status <> 'deleted' OR (SELECT app_private.has_role(ARRAY['superadmin','admin']))));
GRANT UPDATE (title, description, priority, status, start_date, due_date, sla_target_date,
  is_blocked, blocked_reason, blocked_since, updated_at) ON public.projects TO authenticated;

CREATE POLICY editor_update ON public.project_flows FOR UPDATE TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer'])) AND app_private.can_read_project(project_id))
  WITH CHECK ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer'])) AND app_private.can_read_project(project_id));
GRANT UPDATE (assigned_to, current_phase, progress, updated_at) ON public.project_flows TO authenticated;

CREATE POLICY editor_insert ON public.checklist_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer']))
    AND EXISTS (SELECT 1 FROM public.project_flows f WHERE f.id=project_flow_id));
CREATE POLICY editor_update ON public.checklist_items FOR UPDATE TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer']))
    AND EXISTS (SELECT 1 FROM public.project_flows f WHERE f.id=project_flow_id))
  WITH CHECK ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer']))
    AND EXISTS (SELECT 1 FROM public.project_flows f WHERE f.id=project_flow_id));
CREATE POLICY editor_delete ON public.checklist_items FOR DELETE TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer']))
    AND EXISTS (SELECT 1 FROM public.project_flows f WHERE f.id=project_flow_id));
GRANT INSERT (project_flow_id, phase, description, completed, order_index, completed_at),
  UPDATE (description, completed, order_index, completed_at), DELETE ON public.checklist_items TO authenticated;

CREATE POLICY admin_templates ON public.checklist_templates FOR ALL TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin','admin'])))
  WITH CHECK ((SELECT app_private.has_role(ARRAY['superadmin','admin'])));
GRANT INSERT (flow_type, phase, description, order_index),
  UPDATE (description, order_index), DELETE ON public.checklist_templates TO authenticated;

CREATE POLICY editor_comment ON public.comments FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND app_private.can_read_project(project_id)
    AND (SELECT app_private.has_role(ARRAY['superadmin','admin','developer'])));
GRANT INSERT (project_id, content) ON public.comments TO authenticated;

-- Operational history written by the current client; not the security audit.
CREATE POLICY editor_activity ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND app_private.can_read_project(project_id)
    AND (SELECT app_private.has_role(ARRAY['superadmin','admin','developer'])));
GRANT INSERT (project_id, user_id, action, details) ON public.activity_logs TO authenticated;

CREATE POLICY own_notifications ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])));
CREATE POLICY own_notification_read ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY editor_notification ON public.notifications FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer']))
    AND (project_id IS NULL OR app_private.can_read_project(project_id))
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND u.is_active));
GRANT INSERT (user_id, type, title, message, project_id), UPDATE (read) ON public.notifications TO authenticated;

-- No public table access. No client INSERT/DELETE on users or projects.
-- Privileged workflows are explicit RPCs in the following migration.
COMMIT;
