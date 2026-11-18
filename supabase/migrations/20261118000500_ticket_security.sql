-- Security corrections on top of Claude's eight migrations; NOT applied remotely.
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='request-attachments'
      AND public=false AND file_size_limit=10485760 AND allowed_mime_types IS NOT NULL) THEN
    RAISE EXCEPTION 'Expected private attachment bucket with 10 MiB limit' USING ERRCODE='23514';
  END IF;
END $$;

-- A random upload capability is issued only after checking the private tracking token.
-- The caller's upload key is for idempotency, never the capability in the object path.
CREATE TABLE app_private.request_attachment_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id),
  upload_key uuid NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 0 AND 10485760),
  object_name text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  UNIQUE(request_id,upload_key)
);
ALTER TABLE app_private.request_attachment_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.request_attachment_grants FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.reserve_request_attachment(p_request_id uuid,p_tracking_token uuid,
  p_upload_key uuid,p_file_name text,p_size_bytes bigint,p_mime_type text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests; g app_private.request_attachment_grants; capability uuid := gen_random_uuid(); n bigint;
BEGIN
  -- Serialize slot reservations for the same ticket, including concurrent clients.
  SELECT * INTO r FROM public.requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM app_private.request_access
      WHERE request_id=r.id AND tracking_token=p_tracking_token)
      OR r.status<>'pending' OR r.request_type_id IS NULL
      OR r.created_at<=now()-interval '30 minutes' THEN
    RAISE EXCEPTION 'Attachment authorization unavailable' USING ERRCODE='42501';
  END IF;
  IF p_upload_key IS NULL OR p_file_name IS NULL OR length(btrim(p_file_name)) NOT BETWEEN 1 AND 200
      OR position('/' IN p_file_name)>0 OR position(chr(92) IN p_file_name)>0
      OR p_file_name ~ '[[:cntrl:]]' OR p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 0 AND 10485760
      OR NOT coalesce((SELECT p_mime_type=ANY(allowed_mime_types) FROM storage.buckets
        WHERE id='request-attachments' AND public=false AND file_size_limit=10485760),false) THEN
    RAISE EXCEPTION 'Invalid attachment metadata' USING ERRCODE='22023';
  END IF;
  SELECT * INTO g FROM app_private.request_attachment_grants
    WHERE request_id=r.id AND upload_key=p_upload_key;
  IF FOUND THEN
    IF ROW(g.file_name,g.mime_type,g.size_bytes) IS DISTINCT FROM
        ROW(btrim(p_file_name),p_mime_type,p_size_bytes) THEN
      RAISE EXCEPTION 'Upload key already bound to different metadata' USING ERRCODE='23505';
    END IF;
  ELSE
    -- Existing M8 uploads count too, without double-counting uploads with a grant.
    SELECT (SELECT count(*) FROM app_private.request_attachment_grants WHERE request_id=r.id)
      + (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='request-attachments'
        AND split_part(o.name,'/',1)=r.id::text AND NOT EXISTS
          (SELECT 1 FROM app_private.request_attachment_grants a WHERE a.object_name=o.name)) INTO n;
    IF n>=5 THEN RAISE EXCEPTION 'Attachment limit reached' USING ERRCODE='23514'; END IF;
    INSERT INTO app_private.request_attachment_grants(id,request_id,upload_key,file_name,mime_type,
        size_bytes,object_name,expires_at)
      VALUES(capability,r.id,p_upload_key,btrim(p_file_name),p_mime_type,p_size_bytes,
        r.id::text||'/'||capability::text||'-'||regexp_replace(btrim(p_file_name),'[^A-Za-z0-9._-]','_','g'),
        r.created_at+interval '30 minutes') RETURNING * INTO g;
  END IF;
  RETURN jsonb_build_object('bucket','request-attachments','path',g.object_name,
    'mime_type',g.mime_type,'size_bytes',g.size_bytes,'expires_at',g.expires_at);
END $$;

-- M8's existing Storage INSERT policy calls this function. Its policy, private
-- bucket, read policy and Storage size/MIME enforcement are left in place.
CREATE OR REPLACE FUNCTION public.request_attachment_allowed(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_private.request_attachment_grants g
    JOIN public.requests r ON r.id=g.request_id
    WHERE g.object_name=p_name AND g.expires_at>now() AND r.status='pending'
      AND r.created_at>now()-interval '30 minutes'
      AND NOT EXISTS(SELECT 1 FROM storage.objects o
        WHERE o.bucket_id='request-attachments' AND o.name=p_name)
  );
$$;
REVOKE ALL ON FUNCTION public.reserve_request_attachment(uuid,uuid,uuid,text,bigint,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reserve_request_attachment(uuid,uuid,uuid,text,bigint,text)
  TO anon,authenticated;

-- Historic rejection_reason values may contain administrative notes. Never
-- publish them automatically. Keep the original data and add an explicit field.
ALTER TABLE public.requests ADD COLUMN public_rejection_reason text
  CHECK (public_rejection_reason IS NULL OR length(btrim(public_rejection_reason)) BETWEEN 1 AND 5000);
COMMENT ON COLUMN public.requests.public_rejection_reason IS 'Explicit message intended for the requester; safe projection in track_request.';
COMMENT ON COLUMN public.requests.rejection_reason IS 'Internal/historical reason; never projected directly by public tracking.';

CREATE FUNCTION app_private.reject_with_public_message(p_request_id uuid,p_public_reason text,p_internal_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  IF p_public_reason IS NULL OR length(btrim(p_public_reason)) NOT BETWEEN 1 AND 5000
      OR (p_internal_notes IS NOT NULL AND length(btrim(p_internal_notes)) NOT BETWEEN 1 AND 5000) THEN
    RAISE EXCEPTION 'Public rejection message required; notes must be bounded' USING ERRCODE='22023';
  END IF;
  UPDATE public.requests SET status='rejected',public_rejection_reason=btrim(p_public_reason),
      rejection_reason=coalesce(btrim(p_internal_notes),btrim(p_public_reason))
    WHERE id=p_request_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending request required' USING ERRCODE='23514'; END IF;
END $$;

-- Existing UI's reason argument is the message intended for the requester.
CREATE OR REPLACE FUNCTION public.reject_request(p_request_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM app_private.reject_with_public_message(p_request_id,p_reason,NULL);
END $$;
CREATE FUNCTION public.reject_request_with_notes(p_request_id uuid,p_public_reason text,p_internal_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM app_private.reject_with_public_message(p_request_id,p_public_reason,p_internal_notes);
END $$;

-- Owner review can publish a safe reason for a historical rejection, without
-- copying or modifying its original administrative notes/classification.
CREATE FUNCTION public.publish_rejection_reason(p_request_id uuid,p_public_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  IF p_public_reason IS NULL OR length(btrim(p_public_reason)) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Public rejection message required' USING ERRCODE='22023';
  END IF;
  UPDATE public.requests SET public_rejection_reason=btrim(p_public_reason)
    WHERE id=p_request_id AND status='rejected';
  IF NOT FOUND THEN RAISE EXCEPTION 'Rejected request required' USING ERRCODE='23514'; END IF;
  INSERT INTO app_private.security_events(actor_id,subject_id,action)
    VALUES(auth.uid(),p_request_id,'public_rejection_message_updated');
END $$;

CREATE OR REPLACE FUNCTION public.track_request(p_request_number text,p_tracking_token uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('request_number',r.request_number,'status',r.status,'created_at',r.created_at,
    'title',r.title,'rejection_reason',CASE WHEN r.status='rejected' THEN coalesce(r.public_rejection_reason,
      'Solicitud rechazada. Solicita al equipo el motivo destinado a ti.') ELSE NULL END)
  FROM public.requests r JOIN app_private.request_access a ON a.request_id=r.id
  WHERE r.request_number=p_request_number AND a.tracking_token=p_tracking_token;
$$;
REVOKE ALL ON FUNCTION app_private.reject_with_public_message(uuid,text,text),
  public.reject_request_with_notes(uuid,text,text),public.publish_rejection_reason(uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reject_request_with_notes(uuid,text,text),
  public.publish_rejection_reason(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
