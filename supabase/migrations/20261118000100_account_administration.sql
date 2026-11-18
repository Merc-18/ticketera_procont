-- Prepared only. Requires separate authorization before remote application.
BEGIN;

CREATE TABLE app_private.account_bootstrap (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  subject_id uuid NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_private.account_admin_jobs (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('create','invite')),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 200),
  requested_role text NOT NULL CHECK (requested_role IN ('superadmin','admin','developer','viewer')),
  auth_user_id uuid,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','auth_created','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE app_private.account_bootstrap ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.account_admin_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.account_bootstrap, app_private.account_admin_jobs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.authorize_account_actor(p_actor uuid,p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users;
BEGIN
  PERFORM pg_advisory_xact_lock(743921001);
  IF p_role IS NULL OR p_role NOT IN ('superadmin','admin','developer','viewer') THEN
    RAISE EXCEPTION 'Invalid role' USING ERRCODE='22023';
  END IF;
  SELECT * INTO actor FROM public.users WHERE id=p_actor;
  IF NOT FOUND OR NOT actor.is_active OR actor.role NOT IN ('superadmin','admin') THEN
    RAISE EXCEPTION 'Active administrator required' USING ERRCODE='42501';
  END IF;
  IF actor.role='admin' AND p_role NOT IN ('developer','viewer') THEN
    RAISE EXCEPTION 'Superadmin required for administrative roles' USING ERRCODE='42501';
  END IF;
END $$;

CREATE FUNCTION app_private.set_account_permissions(p_actor uuid,p_user uuid,p_role text,p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.users;
BEGIN
  PERFORM app_private.authorize_account_actor(p_actor,p_role);
  IF p_active IS NULL THEN RAISE EXCEPTION 'Activation required' USING ERRCODE='22023'; END IF;
  SELECT * INTO target FROM public.users WHERE id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='22023'; END IF;
  IF target.role IN ('superadmin','admin') AND NOT EXISTS
      (SELECT 1 FROM public.users WHERE id=p_actor AND role='superadmin' AND is_active) THEN
    RAISE EXCEPTION 'Superadmin required for administrative targets' USING ERRCODE='42501';
  END IF;
  IF p_active AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Auth email confirmation required before activation' USING ERRCODE='23514';
  END IF;
  IF target.role='superadmin' AND target.is_active AND (p_role<>'superadmin' OR NOT p_active)
      AND (SELECT count(*) FROM public.users WHERE role='superadmin' AND is_active)<=1 THEN
    RAISE EXCEPTION 'Cannot remove the last active superadmin' USING ERRCODE='23514';
  END IF;
  UPDATE public.users SET role=p_role,is_active=p_active WHERE id=p_user;
  INSERT INTO app_private.security_events(actor_id,subject_id,action,details)
    VALUES(p_actor,p_user,'profile_permissions_changed',jsonb_build_object('role',p_role,'is_active',p_active));
END $$;

-- Existing frontend RPC signature and authenticated grant remain compatible.
CREATE OR REPLACE FUNCTION public.admin_update_user(p_user_id uuid,p_role text,p_is_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM app_private.set_account_permissions(auth.uid(),p_user_id,p_role,p_is_active);
END $$;

-- Owner-only local initialization. Sticky marker has no cascading FK to Auth.
CREATE OR REPLACE FUNCTION app_private.bootstrap_superadmin(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(743921001);
  IF EXISTS(SELECT 1 FROM app_private.account_bootstrap)
      OR EXISTS(SELECT 1 FROM app_private.security_events WHERE action='superadmin_bootstrap')
      OR EXISTS(SELECT 1 FROM public.users) THEN
    RAISE EXCEPTION 'Bootstrap unavailable; explicit owner recovery required' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM auth.users)<>1 OR NOT EXISTS
      (SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one confirmed Auth identity required' USING ERRCODE='23514';
  END IF;
  PERFORM app_private.provision_auth_profile(p_user_id);
  UPDATE public.users SET role='superadmin',is_active=true WHERE id=p_user_id;
  INSERT INTO app_private.account_bootstrap(singleton,subject_id) VALUES(true,p_user_id);
  INSERT INTO app_private.security_events(subject_id,action) VALUES(p_user_id,'superadmin_bootstrap');
END $$;

-- These RPCs are callable only by the trusted backend's service credential.
CREATE FUNCTION public.admin_account_begin(p_actor_id uuid,p_request_id uuid,p_mode text,
  p_email text,p_full_name text,p_role text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job app_private.account_admin_jobs; inserted boolean;
BEGIN
  PERFORM app_private.authorize_account_actor(p_actor_id,p_role);
  IF p_request_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('create','invite')
      OR p_email IS NULL OR length(btrim(p_email)) NOT BETWEEN 3 AND 320 OR position('@' IN p_email)=0
      OR p_full_name IS NULL OR length(btrim(p_full_name)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid account request' USING ERRCODE='22023';
  END IF;
  INSERT INTO app_private.account_admin_jobs(request_id,actor_id,mode,email,full_name,requested_role)
    VALUES(p_request_id,p_actor_id,p_mode,lower(btrim(p_email)),btrim(p_full_name),p_role)
    ON CONFLICT DO NOTHING;
  inserted := FOUND;
  SELECT * INTO job FROM app_private.account_admin_jobs WHERE request_id=p_request_id FOR UPDATE;
  IF job.actor_id<>p_actor_id OR job.mode<>p_mode OR job.email<>lower(btrim(p_email))
      OR job.full_name<>btrim(p_full_name) OR job.requested_role<>p_role THEN
    RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('claimed',inserted,'state',job.state,'user_id',job.auth_user_id);
END $$;

CREATE FUNCTION public.admin_account_record(p_actor_id uuid,p_request_id uuid,p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job app_private.account_admin_jobs;
BEGIN
  PERFORM pg_advisory_xact_lock(743921001);
  SELECT * INTO job FROM app_private.account_admin_jobs WHERE request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR p_actor_id IS NULL OR job.actor_id<>p_actor_id OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Account request not available' USING ERRCODE='42501';
  END IF;
  IF job.state<>'reserved' OR EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id)
      OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND lower(email)=job.email) THEN
    RAISE EXCEPTION 'Unexpected Auth identity or job state' USING ERRCODE='23514';
  END IF;
  UPDATE app_private.account_admin_jobs SET auth_user_id=p_user_id,state='auth_created' WHERE request_id=p_request_id;
END $$;

CREATE FUNCTION public.admin_account_finish(p_actor_id uuid,p_request_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job app_private.account_admin_jobs;
BEGIN
  PERFORM pg_advisory_xact_lock(743921001);
  SELECT * INTO job FROM app_private.account_admin_jobs WHERE request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR p_actor_id IS NULL OR job.actor_id<>p_actor_id THEN
    RAISE EXCEPTION 'Account request not available' USING ERRCODE='42501';
  END IF;
  PERFORM app_private.authorize_account_actor(p_actor_id,job.requested_role);
  IF job.state='completed' THEN RETURN job.auth_user_id; END IF;
  IF job.state<>'auth_created' THEN RAISE EXCEPTION 'Auth outcome requires manual reconciliation' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.users WHERE id=job.auth_user_id) THEN
    RAISE EXCEPTION 'Existing profiles cannot be replaced' USING ERRCODE='23514';
  END IF;
  PERFORM app_private.provision_auth_profile(job.auth_user_id);
  UPDATE public.users SET full_name=job.full_name WHERE id=job.auth_user_id;
  PERFORM app_private.set_account_permissions(p_actor_id,job.auth_user_id,job.requested_role,job.mode='create');
  UPDATE app_private.account_admin_jobs SET state='completed',completed_at=now() WHERE request_id=p_request_id;
  INSERT INTO app_private.security_events(actor_id,subject_id,action)
    VALUES(p_actor_id,job.auth_user_id,'account_'||job.mode);
  RETURN job.auth_user_id;
END $$;

REVOKE ALL ON FUNCTION app_private.authorize_account_actor(uuid,text),
  app_private.set_account_permissions(uuid,uuid,text,boolean),app_private.bootstrap_superadmin(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_account_begin(uuid,uuid,text,text,text,text),
  public.admin_account_record(uuid,uuid,uuid),public.admin_account_finish(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_account_begin(uuid,uuid,text,text,text,text),
  public.admin_account_record(uuid,uuid,uuid),public.admin_account_finish(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
