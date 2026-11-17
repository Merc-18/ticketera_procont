-- Fresh Supabase database only. Historical root SQL files are not migrations.
BEGIN;

CREATE SCHEMA app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

CREATE FUNCTION app_private.valid_phase(flow_type text, phase text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE flow_type
    WHEN 'development' THEN phase = ANY (ARRAY['backlog','design','dev','testing','deploy','done'])
    WHEN 'administrative' THEN phase = ANY (ARRAY['backlog','ready_to_start','discovery','design','build','uat_validation','deployed'])
    ELSE false END;
$$;
REVOKE ALL ON FUNCTION app_private.valid_phase(text,text) FROM PUBLIC, anon, authenticated;

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 200),
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('superadmin','admin','developer','viewer')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number_series text NOT NULL DEFAULT 'REQ' CHECK (number_series IN ('REQ','INT')),
  request_number text NOT NULL UNIQUE CHECK (request_number ~ '^(REQ|INT)[0-9]{2}-[0-9]{3,}$'),
  requester_name text NOT NULL CHECK (length(btrim(requester_name)) BETWEEN 1 AND 200),
  requester_email text CHECK (length(requester_email) <= 320),
  requester_area text CHECK (length(requester_area) <= 200),
  request_type text NOT NULL CHECK (length(btrim(request_type)) BETWEEN 1 AND 1000),
  origin text NOT NULL DEFAULT 'Interno' CHECK (origin IN ('Interno','Externo','Regulatorio','Cliente','Otro')),
  data_system_involved text CHECK (length(data_system_involved) <= 1000),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 20000),
  observations text CHECK (length(observations) <= 10000),
  request_date date,
  requested_date date,
  needs_code boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason text CHECK (length(rejection_reason) <= 5000),
  project_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'approved') = (project_id IS NOT NULL)),
  CHECK (status <> 'rejected' OR nullif(btrim(rejection_reason),'') IS NOT NULL)
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.requests(id) DEFERRABLE INITIALLY DEFERRED,
  project_number text NOT NULL UNIQUE CHECK (project_number ~ '^(REQ|INT)[0-9]{2}-[0-9]{3,}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 20000),
  project_type text NOT NULL CHECK (project_type IN ('development','administrative','dual')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived','deleted')),
  start_date date,
  due_date date,
  sla_target_date date,
  is_blocked boolean NOT NULL DEFAULT false,
  blocked_reason text CHECK (length(blocked_reason) <= 5000),
  blocked_since timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
);
ALTER TABLE public.requests ADD CONSTRAINT requests_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.project_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  flow_type text NOT NULL CHECK (flow_type IN ('development','administrative')),
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  current_phase text NOT NULL DEFAULT 'backlog',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, flow_type),
  CHECK (app_private.valid_phase(flow_type, current_phase))
);

CREATE TABLE public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type text NOT NULL CHECK (flow_type IN ('development','administrative')),
  phase text NOT NULL,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
  order_index integer NOT NULL CHECK (order_index >= 0),
  UNIQUE (flow_type, phase, order_index),
  CHECK (app_private.valid_phase(flow_type, phase))
);
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_flow_id uuid NOT NULL REFERENCES public.project_flows(id) ON DELETE CASCADE,
  phase text NOT NULL,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
  completed boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (completed = (completed_at IS NOT NULL))
);

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(btrim(action)) BETWEEN 1 AND 100),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 20000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('project_assigned','project_blocked','mention','sla_warning')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  message text CHECK (length(message) <= 2000),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_private.number_counters (
  series text NOT NULL CHECK (series IN ('REQ','INT')),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 9999),
  last_value bigint NOT NULL CHECK (last_value > 0),
  PRIMARY KEY (series, year)
);
CREATE TABLE app_private.request_access (
  request_id uuid PRIMARY KEY REFERENCES public.requests(id) ON DELETE CASCADE,
  tracking_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE
);
CREATE TABLE app_private.rpc_calls (
  operation text NOT NULL,
  actor_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operation, actor_id, idempotency_key)
);
CREATE TABLE app_private.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  subject_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX requests_created_idx ON public.requests(created_at DESC);
CREATE INDEX requests_status_created_idx ON public.requests(status, created_at DESC);
CREATE INDEX projects_status_created_idx ON public.projects(status, created_at DESC);
CREATE INDEX projects_sla_idx ON public.projects(sla_target_date) WHERE status = 'active';
CREATE INDEX flows_assigned_idx ON public.project_flows(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX checklist_flow_phase_idx ON public.checklist_items(project_flow_id, phase, order_index);
CREATE INDEX comments_project_idx ON public.comments(project_id, created_at DESC);
CREATE INDEX comments_user_idx ON public.comments(user_id);
CREATE INDEX activity_project_idx ON public.activity_logs(project_id, created_at DESC);
CREATE INDEX activity_action_idx ON public.activity_logs(action, created_at DESC);
CREATE INDEX activity_user_idx ON public.activity_logs(user_id);
CREATE INDEX notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX notifications_project_idx ON public.notifications(project_id);
CREATE INDEX users_role_active_idx ON public.users(role) WHERE is_active;

-- Fail closed even if the next migration has not yet been applied.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','requests','projects','project_flows','checklist_templates',
      'checklist_items','comments','activity_logs','notifications'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['number_counters','request_access','rpc_calls','security_events'] LOOP
    EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE app_private.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;

COMMIT;
