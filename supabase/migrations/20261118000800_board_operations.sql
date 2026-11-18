-- M12: approved board rules. No data conversion/backfill; no SLA or deadlines.
BEGIN;

-- NULL identifies historical projects. Only future inserts receive version 2.
ALTER TABLE public.projects ADD COLUMN workflow_version smallint CHECK (workflow_version = 2);
CREATE OR REPLACE FUNCTION app_private.valid_phase(flow_type text, phase text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE flow_type
    WHEN 'development' THEN phase = ANY(ARRAY['backlog','analysis','design','dev','code_review','testing','deploy','done'])
    WHEN 'administrative' THEN phase = ANY(ARRAY['backlog','ready_to_start','discovery','design','build','uat_validation','deployed'])
    ELSE false END;
$$;
CREATE FUNCTION app_private.board_phases(p_type text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_type WHEN 'development' THEN ARRAY['backlog','analysis','design','dev','code_review','testing','deploy','done']
    WHEN 'administrative' THEN ARRAY['backlog','ready_to_start','discovery','design','build','uat_validation','deployed'] END;
$$;

ALTER TABLE public.request_events DROP CONSTRAINT request_events_action_check;
ALTER TABLE public.request_events ADD CONSTRAINT request_events_action_check CHECK(action IN (
  'submitted','classified','approved','rejected','requester_corrected','review_started','status_changed',
  'phase_changed','blocked','unblocked','block_reason_changed','assigned','reassigned','unassigned',
  'priority_changed','checklist_added','checklist_updated','checklist_deleted','completed','reopened',
  'archived','restored','bulk_updated','evidence_reserved','evidence_uploaded'));

-- Trusted, transaction-scoped command context. A client-set GUC is NOT authority.
CREATE TABLE app_private.board_command_context (
  backend_pid integer NOT NULL, transaction_id bigint NOT NULL,
  project_id uuid NOT NULL, actor_id uuid NOT NULL, command_id uuid NOT NULL,
  action text NOT NULL, is_bulk boolean NOT NULL DEFAULT false,
  PRIMARY KEY(backend_pid, transaction_id)
);
ALTER TABLE app_private.board_command_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.board_command_context FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.board_context(p_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM app_private.board_command_context WHERE backend_pid=pg_backend_pid()
    AND transaction_id=txid_current() AND project_id=p_project_id AND actor_id=auth.uid());
$$;
CREATE FUNCTION app_private.board_event(p_request_id uuid,p_action text,p_details jsonb DEFAULT '{}'::jsonb,p_actor_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ctx app_private.board_command_context; actor jsonb;
BEGIN
  SELECT * INTO ctx FROM app_private.board_command_context WHERE backend_pid=pg_backend_pid()
    AND transaction_id=txid_current() AND project_id=(SELECT id FROM public.projects WHERE request_id=p_request_id);
  SELECT jsonb_build_object('actor_name',full_name,'actor_role',role) INTO actor FROM public.users WHERE id=coalesce(p_actor_id,auth.uid());
  INSERT INTO public.request_events(request_id,actor_id,action,details,created_at)
    VALUES(p_request_id,coalesce(p_actor_id,auth.uid()),p_action,coalesce(p_details,'{}'::jsonb)||coalesce(actor,'{}'::jsonb)||
      CASE WHEN ctx.command_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('command_id',ctx.command_id,'bulk',ctx.is_bulk) END,
      clock_timestamp());
END $$;

CREATE FUNCTION app_private.board_project_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Projects and operational history cannot be purged' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.project_type <> 'development' OR NEW.status <> 'active' OR NEW.is_blocked THEN
      RAISE EXCEPTION 'New projects require one active Development flow' USING ERRCODE='23514';
    END IF;
    NEW.workflow_version:=2;
  ELSE
    IF NEW.workflow_version IS DISTINCT FROM OLD.workflow_version OR NEW.project_type IS DISTINCT FROM OLD.project_type THEN
      RAISE EXCEPTION 'Workflow identity is immutable; historical flows are preserved' USING ERRCODE='23514';
    END IF;
    IF ROW(NEW.status,NEW.priority,NEW.is_blocked,NEW.blocked_reason,NEW.blocked_since)
       IS DISTINCT FROM ROW(OLD.status,OLD.priority,OLD.is_blocked,OLD.blocked_reason,OLD.blocked_since)
       AND NOT app_private.board_context(NEW.id) THEN
      RAISE EXCEPTION 'Use an authorized board command' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.is_blocked AND app_private.normalize_requester_name(NEW.blocked_reason) IS NULL THEN
    RAISE EXCEPTION 'Blocking reason required' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER board_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION app_private.board_project_guard();

CREATE FUNCTION app_private.board_flow_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.projects;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Existing flows and checklists cannot be removed' USING ERRCODE='23514'; END IF;
  SELECT * INTO p FROM public.projects WHERE id=NEW.project_id FOR NO KEY UPDATE;
  IF TG_OP='INSERT' THEN
    IF p.workflow_version=2 AND (NEW.flow_type<>'development' OR NEW.current_phase<>'backlog' OR NEW.assigned_to IS NULL) THEN
      RAISE EXCEPTION 'New Development ticket requires a principal assignee and Backlog' USING ERRCODE='23514';
    END IF;
  ELSE
    IF ROW(NEW.project_id,NEW.flow_type) IS DISTINCT FROM ROW(OLD.project_id,OLD.flow_type) THEN
      RAISE EXCEPTION 'Flow identity cannot change' USING ERRCODE='23514';
    END IF;
    IF NEW.progress IS DISTINCT FROM OLD.progress THEN
      RAISE EXCEPTION 'Legacy progress is read-only; phase and checklist progress are separate' USING ERRCODE='42501';
    END IF;
    IF ROW(NEW.current_phase,NEW.assigned_to) IS DISTINCT FROM ROW(OLD.current_phase,OLD.assigned_to)
       AND NOT app_private.board_context(p.id) THEN
      RAISE EXCEPTION 'Use an authorized board command' USING ERRCODE='42501';
    END IF;
    IF p.is_blocked AND NEW.current_phase IS DISTINCT FROM OLD.current_phase THEN
      RAISE EXCEPTION 'Blocked work cannot change phase or finish' USING ERRCODE='23514';
    END IF;
    IF p.is_blocked AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       AND NOT app_private.has_role(ARRAY['superadmin','admin']) THEN
      RAISE EXCEPTION 'Only administrators may reassign blocked work' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER board_flow_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_flows
  FOR EACH ROW EXECUTE FUNCTION app_private.board_flow_guard();

CREATE FUNCTION app_private.board_assignment_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rid uuid; previous uuid; kind text;
BEGIN
  SELECT request_id INTO rid FROM public.projects WHERE id=NEW.project_id;
  IF TG_OP='UPDATE' THEN previous:=OLD.assigned_to; END IF;
  IF NEW.assigned_to IS DISTINCT FROM previous THEN
    kind:=CASE WHEN NEW.assigned_to IS NULL THEN 'unassigned' WHEN previous IS NULL THEN 'assigned' ELSE 'reassigned' END;
    PERFORM app_private.board_event(rid,kind,jsonb_build_object('project_id',NEW.project_id,'flow_id',NEW.id,
      'previous_assignee',previous,'new_assignee',NEW.assigned_to));
    IF TG_OP='UPDATE' AND NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.notifications(user_id,type,title,project_id) VALUES(NEW.assigned_to,'project_assigned','Ticket asignado',NEW.project_id);
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER board_assignment_audit AFTER INSERT OR UPDATE OF assigned_to ON public.project_flows
  FOR EACH ROW EXECUTE FUNCTION app_private.board_assignment_audit();
CREATE FUNCTION app_private.board_priority_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM app_private.board_event(NEW.request_id,'priority_changed',jsonb_build_object('project_id',NEW.id,'from',NULL,'to',NEW.priority));
  ELSIF NEW.priority IS DISTINCT FROM OLD.priority THEN
    PERFORM app_private.board_event(NEW.request_id,'priority_changed',jsonb_build_object('project_id',NEW.id,'from',OLD.priority,'to',NEW.priority));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER board_priority_audit AFTER INSERT OR UPDATE OF priority ON public.projects
  FOR EACH ROW EXECUTE FUNCTION app_private.board_priority_audit();

CREATE FUNCTION app_private.board_checklist_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE fid uuid;
BEGIN
  IF TG_OP='DELETE' THEN fid:=OLD.project_flow_id; ELSE fid:=NEW.project_flow_id; END IF;
  PERFORM 1 FROM public.projects WHERE id=(SELECT project_id FROM public.project_flows WHERE id=fid) FOR NO KEY UPDATE;
  IF TG_OP='UPDATE' AND ROW(NEW.project_flow_id,NEW.phase) IS DISTINCT FROM ROW(OLD.project_flow_id,OLD.phase) THEN
    RAISE EXCEPTION 'Checklist identity is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER board_checklist_lock BEFORE INSERT OR UPDATE OR DELETE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION app_private.board_checklist_lock();
CREATE FUNCTION app_private.board_checklist_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE fid uuid; rid uuid; previous jsonb; next_row jsonb;
BEGIN
  IF TG_OP<>'INSERT' THEN previous:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN next_row:=to_jsonb(NEW); END IF;
  IF previous IS NOT DISTINCT FROM next_row THEN RETURN NULL; END IF;
  fid:=coalesce((next_row->>'project_flow_id')::uuid,(previous->>'project_flow_id')::uuid);
  SELECT p.request_id INTO rid FROM public.project_flows f JOIN public.projects p ON p.id=f.project_id WHERE f.id=fid;
  PERFORM app_private.board_event(rid,CASE TG_OP WHEN 'INSERT' THEN 'checklist_added' WHEN 'DELETE' THEN 'checklist_deleted' ELSE 'checklist_updated' END,
    jsonb_build_object('previous',previous,'new',next_row));
  RETURN NULL;
END $$;
CREATE TRIGGER board_checklist_audit AFTER INSERT OR UPDATE OR DELETE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION app_private.board_checklist_audit();

-- Durable audit: no application role can append arbitrary entries, edit, delete or truncate.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.activity_logs,public.request_events FROM authenticated,anon,service_role;
REVOKE INSERT(project_id,user_id,action,details) ON public.activity_logs FROM authenticated;
CREATE FUNCTION app_private.immutable_board_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Operational history is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_board_history BEFORE UPDATE OR DELETE ON public.request_events
  FOR EACH ROW EXECUTE FUNCTION app_private.immutable_board_history();
CREATE TRIGGER immutable_board_history BEFORE UPDATE OR DELETE ON public.activity_logs
  FOR EACH ROW EXECUTE FUNCTION app_private.immutable_board_history();
CREATE TRIGGER immutable_board_history BEFORE UPDATE OR DELETE ON app_private.security_events
  FOR EACH ROW EXECUTE FUNCTION app_private.immutable_board_history();
CREATE TRIGGER immutable_board_history_truncate BEFORE TRUNCATE ON public.request_events
  FOR EACH STATEMENT EXECUTE FUNCTION app_private.immutable_board_history();
CREATE TRIGGER immutable_board_history_truncate BEFORE TRUNCATE ON public.activity_logs
  FOR EACH STATEMENT EXECUTE FUNCTION app_private.immutable_board_history();
CREATE TRIGGER immutable_board_history_truncate BEFORE TRUNCATE ON app_private.security_events
  FOR EACH STATEMENT EXECUTE FUNCTION app_private.immutable_board_history();
ALTER TABLE public.request_events DROP CONSTRAINT request_events_actor_id_fkey;
ALTER TABLE public.request_events ADD CONSTRAINT request_events_actor_id_fkey FOREIGN KEY(actor_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.activity_logs DROP CONSTRAINT activity_logs_project_id_fkey;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_project_id_fkey FOREIGN KEY(project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;
ALTER TABLE public.activity_logs DROP CONSTRAINT activity_logs_user_id_fkey;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY(user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

-- Remove alternate application write paths. Checklist CRUD remains allowed under RLS.
REVOKE INSERT(completed_at), UPDATE(completed_at) ON public.checklist_items FROM authenticated;
REVOKE UPDATE(current_phase,progress,assigned_to) ON public.project_flows FROM authenticated;
REVOKE UPDATE(status,priority,is_blocked,blocked_reason,blocked_since) ON public.projects FROM authenticated;

CREATE FUNCTION app_private.board_snapshot(p_project_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('project_id',p.id,'request_id',p.request_id,'request_number',p.project_number,
    'workflow_version',p.workflow_version,'project_status',p.status,'general_status',app_private.request_general_status(p.request_id),
    'priority',p.priority,'is_blocked',p.is_blocked,'blocked_reason',p.blocked_reason,
    'flows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'flow_type',f.flow_type,'phase',f.current_phase,
      'phase_index',array_position(app_private.board_phases(f.flow_type),f.current_phase)-1,
      'phase_count',cardinality(app_private.board_phases(f.flow_type)),
      'phase_progress_percent',round(100.0*(array_position(app_private.board_phases(f.flow_type),f.current_phase)-1)
        /(cardinality(app_private.board_phases(f.flow_type))-1),2),
      'assignee_id',f.assigned_to,'checklist_total',(SELECT count(*) FROM public.checklist_items WHERE project_flow_id=f.id),
      'checklist_completed',(SELECT count(*) FROM public.checklist_items WHERE project_flow_id=f.id AND completed),
      'checklist_progress_percent',(SELECT round(100.0*count(*) FILTER(WHERE completed)/nullif(count(*),0),2)
        FROM public.checklist_items WHERE project_flow_id=f.id)) ORDER BY f.flow_type)
      FROM public.project_flows f WHERE f.project_id=p.id),'[]'::jsonb),
    'pending_items',pend.items,'pending_fingerprint',md5(pend.items::text))
  FROM public.projects p CROSS JOIN LATERAL (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'flow_id',f.id,'phase',i.phase,'description',i.description) ORDER BY i.id),'[]'::jsonb) AS items
    FROM public.project_flows f JOIN public.checklist_items i ON i.project_flow_id=f.id WHERE f.project_id=p.id AND NOT i.completed
  ) pend WHERE p.id=p_project_id;
$$;
CREATE FUNCTION public.get_board_ticket(p_project_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer','viewer']);
  IF NOT app_private.can_read_project(p_project_id) THEN RAISE EXCEPTION 'Ticket unavailable' USING ERRCODE='42501'; END IF;
  RETURN app_private.board_snapshot(p_project_id);
END $$;

CREATE FUNCTION app_private.board_apply(p_project_id uuid,p_action text,p_payload jsonb,p_command_id uuid,p_bulk boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.projects; f public.project_flows; before_phase text; target text; reason text;
  snapshot jsonb; pending jsonb; closing boolean; assignee uuid; previous_completion bigint; from_status text;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket unavailable' USING ERRCODE='22023'; END IF;
  IF p.status='deleted' AND p_action<>'restore' THEN RAISE EXCEPTION 'Restore archived/deleted work first' USING ERRCODE='23514'; END IF;
  INSERT INTO app_private.board_command_context VALUES(pg_backend_pid(),txid_current(),p.id,auth.uid(),p_command_id,p_action,p_bulk);
  IF p_action IN ('move_phase','reopen','assign') THEN
    PERFORM app_private.assert_payload(p_payload,CASE p_action WHEN 'move_phase' THEN ARRAY['flow_id','to_phase','confirm_pending','pending_fingerprint']
      WHEN 'reopen' THEN ARRAY['flow_id','to_phase','reason'] ELSE ARRAY['flow_id','assignee_id'] END);
    SELECT * INTO f FROM public.project_flows WHERE project_id=p.id
      AND (p_payload->>'flow_id' IS NULL OR id=(p_payload->>'flow_id')::uuid) ORDER BY id LIMIT 1 FOR UPDATE;
    IF NOT FOUND OR (p_payload->>'flow_id' IS NULL AND (SELECT count(*) FROM public.project_flows WHERE project_id=p.id)>1) THEN
      RAISE EXCEPTION 'Specify one flow belonging to this ticket' USING ERRCODE='22023';
    END IF;
    before_phase:=f.current_phase;
  END IF;
  IF p_action IN ('move_phase','reopen') THEN
    target:=p_payload->>'to_phase';
    IF target IS NULL OR NOT app_private.valid_phase(f.flow_type,target) THEN
      RAISE EXCEPTION 'Invalid target phase' USING ERRCODE='22023'; END IF;
    IF p.is_blocked THEN RAISE EXCEPTION 'Unblock before changing phase or finishing' USING ERRCODE='23514'; END IF;
    IF p_action='reopen' THEN
      reason:=p_payload->>'reason';
      IF app_private.normalize_requester_name(reason) IS NULL OR length(reason)>5000 OR target=app_private.final_phase(f.flow_type) THEN
        RAISE EXCEPTION 'Reopening requires a reason and a non-final phase' USING ERRCODE='22023'; END IF;
      IF app_private.request_general_status(p.request_id)<>'done' THEN
        RAISE EXCEPTION 'Only finished work can be reopened' USING ERRCODE='23514'; END IF;
      SELECT max(id) INTO previous_completion FROM public.request_events WHERE request_id=p.request_id
        AND action='status_changed' AND details->>'to'='done';
      UPDATE public.projects SET status='active' WHERE id=p.id;
      UPDATE public.project_flows SET current_phase=target WHERE id=f.id;
      PERFORM app_private.board_event(p.request_id,'reopened',jsonb_build_object('project_id',p.id,'flow_id',f.id,
        'from_phase',before_phase,'to_phase',target,'reason',reason,'previous_completion_event_id',previous_completion));
    ELSE
      IF p.status<>'active' THEN RAISE EXCEPTION 'Only active work can move; use reopen or restore' USING ERRCODE='23514'; END IF;
      IF target IS DISTINCT FROM before_phase THEN
        IF app_private.request_general_status(p.request_id)='done' THEN
          RAISE EXCEPTION 'Finished work requires explicit reopening' USING ERRCODE='23514'; END IF;
        closing:=target=app_private.final_phase(f.flow_type) AND NOT EXISTS(SELECT 1 FROM public.project_flows other
          WHERE other.project_id=p.id AND other.id<>f.id AND other.current_phase<>app_private.final_phase(other.flow_type));
        IF closing THEN
          snapshot:=app_private.board_snapshot(p.id); pending:=snapshot->'pending_items';
          IF jsonb_array_length(pending)>0 AND (p_payload->'confirm_pending' IS DISTINCT FROM 'true'::jsonb
             OR p_payload->>'pending_fingerprint' IS DISTINCT FROM snapshot->>'pending_fingerprint') THEN
            RAISE EXCEPTION 'Confirm the exact current pending checklist before closing' USING ERRCODE='23514'; END IF;
        END IF;
        UPDATE public.project_flows SET current_phase=target WHERE id=f.id;
        IF closing THEN
          UPDATE public.projects SET status='completed' WHERE id=p.id;
          PERFORM app_private.board_event(p.request_id,'completed',jsonb_build_object('project_id',p.id,'flow_id',f.id,
            'from_phase',before_phase,'to_phase',target,'pending_confirmed',jsonb_array_length(pending)>0,
            'pending_items',pending,'pending_fingerprint',snapshot->>'pending_fingerprint',
            'completed_at',(SELECT created_at FROM public.request_events WHERE request_id=p.request_id
              AND action='status_changed' AND details->>'to'='done' ORDER BY id DESC LIMIT 1)));
        END IF;
      END IF;
    END IF;
  ELSIF p_action='assign' THEN
    IF NOT p_payload ? 'assignee_id' THEN RAISE EXCEPTION 'Explicit assignee or null required' USING ERRCODE='22023'; END IF;
    assignee:=nullif(p_payload->>'assignee_id','')::uuid;
    UPDATE public.project_flows SET assigned_to=assignee WHERE id=f.id;
  ELSIF p_action='set_priority' THEN
    PERFORM app_private.assert_payload(p_payload,ARRAY['priority']);
    IF p_payload->>'priority' IS NULL THEN RAISE EXCEPTION 'Priority required' USING ERRCODE='22023'; END IF;
    UPDATE public.projects SET priority=p_payload->>'priority' WHERE id=p.id;
  ELSIF p_action='block' THEN
    PERFORM app_private.assert_payload(p_payload,ARRAY['reason']); reason:=p_payload->>'reason';
    IF app_private.normalize_requester_name(reason) IS NULL OR length(reason)>5000 THEN RAISE EXCEPTION 'Blocking reason required' USING ERRCODE='22023'; END IF;
    IF p.status<>'active' OR app_private.request_general_status(p.request_id)='done' THEN
      RAISE EXCEPTION 'Only unfinished active work can be blocked' USING ERRCODE='23514'; END IF;
    UPDATE public.projects SET is_blocked=true,blocked_reason=reason,blocked_since=coalesce(blocked_since,clock_timestamp()) WHERE id=p.id;
    IF p.is_blocked AND p.blocked_reason IS DISTINCT FROM reason THEN
      PERFORM app_private.board_event(p.request_id,'block_reason_changed',jsonb_build_object('previous_reason',p.blocked_reason,'reason',reason));
    END IF;
    IF NOT p.is_blocked THEN
      INSERT INTO public.notifications(user_id,type,title,project_id)
        SELECT DISTINCT assigned_to,'project_blocked','Ticket bloqueado',p.id FROM public.project_flows
        WHERE project_id=p.id AND assigned_to IS NOT NULL;
    END IF;
  ELSIF p_action='unblock' THEN
    PERFORM app_private.assert_payload(p_payload,ARRAY[]::text[]);
    UPDATE public.projects SET is_blocked=false,blocked_reason=NULL,blocked_since=NULL WHERE id=p.id;
  ELSIF p_action='archive' THEN
    PERFORM app_private.assert_payload(p_payload,ARRAY[]::text[]);
    IF p.status<>'archived' THEN
      UPDATE public.projects SET status='archived' WHERE id=p.id;
      PERFORM app_private.board_event(p.request_id,'archived',jsonb_build_object('from_status',p.status,'to_status','archived'));
    END IF;
  ELSIF p_action='restore' THEN
    PERFORM app_private.assert_payload(p_payload,ARRAY[]::text[]);
    IF p.status NOT IN ('archived','deleted') THEN RAISE EXCEPTION 'Ticket is not archived or deleted' USING ERRCODE='23514'; END IF;
    IF p.status='deleted' THEN PERFORM app_private.require_role(ARRAY['superadmin','admin']); END IF;
    -- Restoring final phases keeps the ticket completed; reopening always needs its own reason.
    from_status:=CASE WHEN NOT EXISTS(SELECT 1 FROM public.project_flows WHERE project_id=p.id
      AND current_phase<>app_private.final_phase(flow_type)) THEN 'completed' ELSE 'active' END;
    UPDATE public.projects SET status=from_status WHERE id=p.id;
    PERFORM app_private.board_event(p.request_id,'restored',jsonb_build_object('from_status',p.status,'to_status',from_status));
  ELSE RAISE EXCEPTION 'Unknown board action' USING ERRCODE='22023';
  END IF;
  IF p_bulk THEN PERFORM app_private.board_event(p.request_id,'bulk_updated',jsonb_build_object('action',p_action)); END IF;
  DELETE FROM app_private.board_command_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
  RETURN app_private.board_snapshot(p.id);
END $$;

CREATE FUNCTION public.operate_board_ticket(p_project_id uuid,p_action text,p_payload jsonb,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE input jsonb; result jsonb;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':board_command:'||p_idempotency_key::text,0));
  input:=jsonb_build_object('project_id',p_project_id,'action',p_action,'payload',p_payload);
  result:=app_private.replay('board_command',p_idempotency_key,input);
  IF result IS NOT NULL THEN RETURN result; END IF;
  result:=app_private.board_apply(p_project_id,p_action,p_payload,p_idempotency_key);
  RETURN app_private.remember('board_command',p_idempotency_key,input,result);
END $$;
CREATE FUNCTION public.operate_board_tickets(p_project_ids uuid[],p_action text,p_payload jsonb,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ids uuid[]; pid uuid; input jsonb; result jsonb; item jsonb;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  IF p_action NOT IN ('set_priority','archive') OR p_action IS NULL THEN RAISE EXCEPTION 'Unsupported bulk action' USING ERRCODE='22023'; END IF;
  IF cardinality(p_project_ids) IS NULL OR cardinality(p_project_ids) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 tickets' USING ERRCODE='22023'; END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO ids FROM unnest(p_project_ids) x;
  IF cardinality(ids)<>cardinality(p_project_ids) OR array_position(ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Unique non-null ticket IDs required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':board_bulk:'||p_idempotency_key::text,0));
  input:=jsonb_build_object('ids',ids,'action',p_action,'payload',p_payload);
  result:=app_private.replay('board_bulk',p_idempotency_key,input);
  IF result IS NOT NULL THEN RETURN result; END IF;
  PERFORM 1 FROM public.projects WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.projects WHERE id=ANY(ids))<>cardinality(ids) THEN
    RAISE EXCEPTION 'Some selected tickets are unavailable' USING ERRCODE='22023'; END IF;
  result:='[]'::jsonb;
  FOREACH pid IN ARRAY ids LOOP
    item:=app_private.board_apply(pid,p_action,p_payload,p_idempotency_key,true);
    result:=result||jsonb_build_array(item);
  END LOOP;
  RETURN app_private.remember('board_bulk',p_idempotency_key,input,result);
END $$;

CREATE OR REPLACE FUNCTION app_private.sync_request_status(p_request_id uuid, p_cause jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_status text; last_status text;
BEGIN
  IF p_request_id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public.projects WHERE request_id = p_request_id FOR NO KEY UPDATE;
  current_status := app_private.request_general_status(p_request_id);
  SELECT details->>'to' INTO last_status FROM public.request_events
   WHERE request_id = p_request_id AND action = 'status_changed' ORDER BY id DESC LIMIT 1;
  IF current_status IS DISTINCT FROM last_status THEN
    PERFORM app_private.board_event(p_request_id,'status_changed',
      jsonb_build_object('from',last_status,'to',current_status)||coalesce(p_cause,'{}'::jsonb));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_private.trg_flow_phase() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rid uuid;
BEGIN
  SELECT request_id INTO rid FROM public.projects WHERE id = NEW.project_id;
  IF TG_OP = 'UPDATE' AND NEW.current_phase IS DISTINCT FROM OLD.current_phase THEN
    PERFORM app_private.board_event(rid,'phase_changed',jsonb_build_object('project_id',NEW.project_id,
      'flow_id',NEW.id,'flow_type',NEW.flow_type,'from',OLD.current_phase,'to',NEW.current_phase));
  END IF;
  PERFORM app_private.sync_request_status(rid, jsonb_build_object('cause', 'phase', 'flow_type', NEW.flow_type,
    'phase', NEW.current_phase));
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION app_private.trg_project_block() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_blocked AND NOT OLD.is_blocked THEN
    PERFORM app_private.board_event(NEW.request_id,'blocked',jsonb_build_object('project_id',NEW.id,
      'reason',NEW.blocked_reason,'blocked_since',NEW.blocked_since));
  ELSIF OLD.is_blocked AND NOT NEW.is_blocked THEN
    PERFORM app_private.board_event(NEW.request_id,'unblocked',jsonb_build_object('project_id',NEW.id,
      'reason',OLD.blocked_reason,'blocked_since',OLD.blocked_since,'unblocked_at',clock_timestamp()));
  END IF;
  PERFORM app_private.sync_request_status(NEW.request_id,jsonb_build_object('cause','project'));
  RETURN NULL;
END $$;
CREATE FUNCTION app_private.board_creation_payload(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF coalesce(p->>'project_type','development')<>'development' THEN
    RAISE EXCEPTION 'New projects support Development only' USING ERRCODE='22023'; END IF;
  IF nullif(p->>'assigned_dev','') IS NULL THEN RAISE EXCEPTION 'Principal assignee required' USING ERRCODE='22023'; END IF;
  IF p->>'assigned_admin' IS NOT NULL AND p->>'assigned_admin'<>p->>'assigned_dev' THEN
    RAISE EXCEPTION 'New tickets have one principal assignee' USING ERRCODE='22023'; END IF;
  IF p->>'sla_target_date' IS NOT NULL OR p->>'sla_formal_days' IS NOT NULL THEN
    RAISE EXCEPTION 'No SLA is configured for new work' USING ERRCODE='22023'; END IF;
  RETURN p||jsonb_build_object('project_type','development','assigned_admin',NULL);
END $$;
CREATE OR REPLACE FUNCTION public.create_internal_project(p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; rid uuid := gen_random_uuid(); pid uuid := gen_random_uuid(); p public.projects;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  PERFORM app_private.assert_payload(p_payload,ARRAY['title','description','project_type','priority','start_date',
    'due_date','sla_target_date','area','requester_name','assigned_dev','assigned_admin']);
  p_payload := app_private.board_creation_payload(p_payload);
  result := app_private.replay('create_internal_project',p_idempotency_key,p_payload);
  IF result IS NOT NULL THEN RETURN result; END IF;
  INSERT INTO public.requests(id,number_series,requester_name,requester_area,request_type,description,status,project_id)
    VALUES (rid,'INT',coalesce(nullif(btrim(p_payload->>'requester_name'),''),
      (SELECT full_name FROM public.users WHERE id=auth.uid())),nullif(btrim(p_payload->>'area'),''),
      'INT',btrim(p_payload->>'description'),'approved',pid);
  INSERT INTO public.projects(id,request_id,title,description,project_type,priority,start_date,due_date,sla_target_date)
    VALUES (pid,rid,btrim(p_payload->>'title'),btrim(p_payload->>'description'),p_payload->>'project_type',
      coalesce(p_payload->>'priority','medium'),nullif(p_payload->>'start_date','')::date,
      nullif(p_payload->>'due_date','')::date,nullif(p_payload->>'sla_target_date','')::date) RETURNING * INTO p;
  PERFORM app_private.add_flows(pid,p.project_type,nullif(p_payload->>'assigned_dev','')::uuid,
    nullif(p_payload->>'assigned_admin','')::uuid);
  INSERT INTO public.activity_logs(project_id,user_id,action,details)
    VALUES (pid,auth.uid(),'created',jsonb_build_object('title',p.title));
  result := to_jsonb(p);
  RETURN app_private.remember('create_internal_project',p_idempotency_key,p_payload,result);
END $$;

CREATE OR REPLACE FUNCTION public.approve_request(p_request_id uuid,p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; input jsonb; r public.requests; p public.projects; pid uuid := gen_random_uuid();
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  PERFORM app_private.assert_payload(p_payload,ARRAY['title','project_type','priority','start_date','due_date',
    'sla_target_date','sla_formal_days','assigned_dev','assigned_admin']);
  p_payload := app_private.board_creation_payload(p_payload);
  IF p_payload->>'sla_target_date' IS NOT NULL AND
    (p_payload->>'sla_formal_days' IS NULL OR (p_payload->>'sla_formal_days')::integer NOT BETWEEN 1 AND 3650) THEN
    RAISE EXCEPTION 'SLA target requires formal days between 1 and 3650' USING ERRCODE='22023';
  END IF;
  input := jsonb_build_object('request_id',p_request_id,'data',p_payload);
  result := app_private.replay('approve_request',p_idempotency_key,input);
  IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT * INTO r FROM public.requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='22023'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Request is not pending' USING ERRCODE='23514'; END IF;
  INSERT INTO public.projects(id,request_id,title,description,project_type,priority,start_date,due_date,sla_target_date)
    VALUES (pid,r.id,coalesce(nullif(btrim(p_payload->>'title'),''),r.request_type),r.description,
      p_payload->>'project_type',coalesce(p_payload->>'priority','medium'),nullif(p_payload->>'start_date','')::date,
      nullif(p_payload->>'due_date','')::date,nullif(p_payload->>'sla_target_date','')::date) RETURNING * INTO p;
  PERFORM app_private.add_flows(pid,p.project_type,nullif(p_payload->>'assigned_dev','')::uuid,
    nullif(p_payload->>'assigned_admin','')::uuid);
  UPDATE public.requests SET status='approved',project_id=pid WHERE id=r.id;
  INSERT INTO public.activity_logs(project_id,user_id,action,details)
    VALUES (pid,auth.uid(),'created',jsonb_build_object('request_number',r.request_number));
  IF p.priority <> 'low' AND p.sla_target_date IS NOT NULL THEN
    INSERT INTO public.activity_logs(project_id,user_id,action,details)
      VALUES (pid,auth.uid(),'sla_started',jsonb_build_object('request_number',r.request_number,
        'sla_formal_days',(p_payload->>'sla_formal_days')::integer,'sla_target_date',p.sla_target_date));
  ELSIF p.priority='low' THEN
    UPDATE public.projects SET sla_target_date=NULL WHERE id=pid RETURNING * INTO p;
  END IF;
  INSERT INTO public.notifications(user_id,type,title,message,project_id)
    SELECT DISTINCT assigned_to,'project_assigned','Proyecto asignado',p.title,pid
    FROM public.project_flows WHERE project_id=pid AND assigned_to IS NOT NULL;
  result := to_jsonb(p);
  RETURN app_private.remember('approve_request',p_idempotency_key,input,result);
END $$;

CREATE OR REPLACE FUNCTION public.change_project_type(p_project_id uuid,p_project_type text) RETURNS public.projects
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  RAISE EXCEPTION 'Flow identity is immutable; no historical flow/checklist is deleted' USING ERRCODE='0A000';
END $$;
CREATE OR REPLACE FUNCTION public.purge_project(p_project_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  RAISE EXCEPTION 'Operational history cannot be purged by application operations' USING ERRCODE='0A000';
END $$;


-- Internal evidence is authenticated, actor-bound and usable while blocked. Public
-- tracking-token uploads keep their pending-only/original 30-minute window.
ALTER TABLE app_private.request_attachment_grants
  ADD COLUMN internal_actor_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD COLUMN uploaded_object_id uuid;
CREATE FUNCTION public.reserve_board_evidence(p_project_id uuid,p_upload_key uuid,p_file_name text,p_size_bytes bigint,p_mime_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests; g app_private.request_attachment_grants; capability uuid:=gen_random_uuid();
  n bigint; reserved_bytes numeric; legacy_bytes numeric; rid uuid;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  SELECT request_id INTO rid FROM public.projects WHERE id=p_project_id AND status<>'deleted' FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.requests WHERE id=rid FOR UPDATE;
  IF p_upload_key IS NULL OR p_file_name IS NULL OR length(btrim(p_file_name)) NOT BETWEEN 1 AND 200
      OR position('/' IN p_file_name)>0 OR position(chr(92) IN p_file_name)>0
      OR p_file_name ~ '[[:cntrl:]]' OR p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 0 AND 2500000
      OR NOT coalesce((SELECT p_mime_type=ANY(allowed_mime_types) FROM storage.buckets
        WHERE id='request-attachments' AND public=false AND file_size_limit=2500000),false) THEN
    RAISE EXCEPTION 'Invalid attachment metadata' USING ERRCODE='22023';
  END IF;
  SELECT * INTO g FROM app_private.request_attachment_grants
    WHERE request_id=r.id AND upload_key=p_upload_key;
  IF FOUND THEN
    IF g.internal_actor_id IS DISTINCT FROM auth.uid() OR g.expires_at<=clock_timestamp() THEN
      RAISE EXCEPTION 'Evidence reservation unavailable' USING ERRCODE='42501'; END IF;
    IF ROW(g.file_name,g.mime_type,g.size_bytes) IS DISTINCT FROM
        ROW(btrim(p_file_name),p_mime_type,p_size_bytes) THEN
      RAISE EXCEPTION 'Upload key already bound to different metadata' USING ERRCODE='23505';
    END IF;
  ELSE
    -- Unknown historical sizes require review, never an assumed zero-byte value.
    IF EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='request-attachments'
        AND split_part(o.name,'/',1)=r.id::text
        AND NOT EXISTS (SELECT 1 FROM app_private.request_attachment_grants a WHERE a.object_name=o.name)
        AND coalesce(o.metadata->>'size','') !~ '^[0-9]{1,18}$') THEN
      RAISE EXCEPTION 'Historical attachment size requires review' USING ERRCODE='23514';
    END IF;
    -- Count reservations plus legacy objects; uploaded reserved paths count once.
    SELECT (SELECT count(*) FROM app_private.request_attachment_grants WHERE request_id=r.id)
      + (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='request-attachments'
        AND split_part(o.name,'/',1)=r.id::text AND NOT EXISTS
          (SELECT 1 FROM app_private.request_attachment_grants a WHERE a.object_name=o.name)) INTO n;
    SELECT coalesce(sum(size_bytes),0) INTO reserved_bytes
      FROM app_private.request_attachment_grants WHERE request_id=r.id;
    SELECT coalesce(sum((o.metadata->>'size')::bigint),0) INTO legacy_bytes
      FROM storage.objects o WHERE o.bucket_id='request-attachments' AND split_part(o.name,'/',1)=r.id::text
        AND NOT EXISTS (SELECT 1 FROM app_private.request_attachment_grants a WHERE a.object_name=o.name);
    IF n>=4 OR reserved_bytes+legacy_bytes+p_size_bytes>2500000 THEN
      RAISE EXCEPTION 'Attachment count or combined byte limit reached' USING ERRCODE='23514';
    END IF;
    INSERT INTO app_private.request_attachment_grants(id,request_id,upload_key,file_name,mime_type,
        size_bytes,object_name,expires_at,internal_actor_id)
      VALUES(capability,r.id,p_upload_key,btrim(p_file_name),p_mime_type,p_size_bytes,
        r.id::text||'/'||capability::text||'-'||regexp_replace(btrim(p_file_name),'[^A-Za-z0-9._-]','_','g'),
        clock_timestamp()+interval '30 minutes',auth.uid()) RETURNING * INTO g;
    PERFORM app_private.board_event(r.id,'evidence_reserved',jsonb_build_object('upload_key',p_upload_key,'file_name',g.file_name,'size_bytes',g.size_bytes));
  END IF;
  RETURN jsonb_build_object('bucket','request-attachments','path',g.object_name,
    'mime_type',g.mime_type,'size_bytes',g.size_bytes,'expires_at',g.expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.request_attachment_allowed(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM app_private.request_attachment_grants g JOIN public.requests r ON r.id=g.request_id
    WHERE g.object_name=p_name AND g.expires_at>clock_timestamp()
      AND ((g.internal_actor_id IS NULL AND r.status='pending' AND r.created_at>clock_timestamp()-interval '30 minutes')
        OR (g.internal_actor_id=auth.uid() AND app_private.has_role(ARRAY['superadmin','admin','developer'])
          AND EXISTS(SELECT 1 FROM public.projects WHERE request_id=r.id AND status<>'deleted')))
      AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='request-attachments' AND name=p_name));
$$;
CREATE OR REPLACE FUNCTION app_private.enforce_attachment_bytes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE obj record; g app_private.request_attachment_grants; r public.requests;
  actual_size bigint; n bigint; actual_total numeric;
BEGIN
  SELECT * INTO obj FROM storage.objects WHERE id=NEW.id AND bucket_id='request-attachments';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO g FROM app_private.request_attachment_grants WHERE object_name=obj.name;
  IF NOT FOUND THEN RAISE EXCEPTION 'Final attachment requires an authorized reservation' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.requests WHERE id=g.request_id FOR UPDATE;
  IF g.expires_at<=clock_timestamp() OR
    (g.internal_actor_id IS NULL AND (r.status<>'pending' OR r.created_at<=clock_timestamp()-interval '30 minutes')) OR
    (g.internal_actor_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.users WHERE id=g.internal_actor_id AND is_active
      AND role IN ('superadmin','admin','developer')) OR NOT EXISTS(SELECT 1 FROM public.projects WHERE request_id=r.id AND status<>'deleted'))) THEN
    RAISE EXCEPTION 'Attachment authorization expired' USING ERRCODE='42501';
  END IF;
  IF coalesce(obj.metadata->>'size','') !~ '^[0-9]{1,18}$' THEN
    RAISE EXCEPTION 'Actual Storage size is required' USING ERRCODE='23514';
  END IF;
  actual_size := (obj.metadata->>'size')::bigint;
  IF actual_size<>g.size_bytes OR actual_size>2500000 OR
      obj.metadata->>'mimetype' IS DISTINCT FROM g.mime_type THEN
    RAISE EXCEPTION 'Actual attachment differs from its reservation' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='request-attachments'
      AND split_part(o.name,'/',1)=g.request_id::text
      AND coalesce(o.metadata->>'size','') !~ '^[0-9]{1,18}$') THEN
    RAISE EXCEPTION 'Stored attachment size requires review' USING ERRCODE='23514';
  END IF;
  SELECT count(*),coalesce(sum((o.metadata->>'size')::bigint),0) INTO n,actual_total
    FROM storage.objects o WHERE o.bucket_id='request-attachments' AND split_part(o.name,'/',1)=g.request_id::text;
  IF n>4 OR actual_total>2500000 THEN
    RAISE EXCEPTION 'Actual combined attachment quota exceeded' USING ERRCODE='23514';
  END IF;
  UPDATE app_private.request_attachment_grants SET uploaded_object_id=obj.id WHERE id=g.id AND uploaded_object_id IS NULL;
  IF FOUND THEN
    PERFORM app_private.board_event(r.id,'evidence_uploaded',jsonb_build_object('object_id',obj.id,'file_name',g.file_name,
      'size_bytes',actual_size),g.internal_actor_id);
  END IF;
  RETURN NULL;
END $$;

-- No new helper is executable by application roles. Existing helper ACLs are preserved.
DO $$ DECLARE signature regprocedure; BEGIN
  FOR signature IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='app_private' AND p.proname IN ('board_phases','board_context','board_event','board_project_guard',
      'board_flow_guard','board_assignment_audit','board_priority_audit','board_checklist_lock','board_checklist_audit',
      'immutable_board_history','board_snapshot','board_apply','board_creation_payload'))
      OR (n.nspname='public' AND p.proname IN ('get_board_ticket','operate_board_ticket','operate_board_tickets','reserve_board_evidence'))
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.get_board_ticket(uuid), public.operate_board_ticket(uuid,text,jsonb,uuid),
  public.operate_board_tickets(uuid[],text,jsonb,uuid), public.reserve_board_evidence(uuid,uuid,text,bigint,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
