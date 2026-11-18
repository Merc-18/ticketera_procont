-- Security corrections on top of Claude's eight migrations; NOT applied remotely.
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='request-attachments'
      AND public=false AND allowed_mime_types IS NOT NULL) THEN
    RAISE EXCEPTION 'Expected private attachment bucket with explicit MIME types' USING ERRCODE='23514';
  END IF;
END $$;
-- Decimal bytes, not MiB. Historical files remain intact; new uploads use this cap.
UPDATE storage.buckets SET file_size_limit=2500000 WHERE id='request-attachments';

-- A random upload capability is issued only after checking the private tracking token.
-- The caller's upload key is for idempotency, never the capability in the object path.
CREATE TABLE app_private.request_attachment_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id),
  upload_key uuid NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 0 AND 2500000),
  object_name text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  UNIQUE(request_id,upload_key)
);
ALTER TABLE app_private.request_attachment_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.request_attachment_grants FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.reserve_request_attachment(p_request_id uuid,p_tracking_token uuid,
  p_upload_key uuid,p_file_name text,p_size_bytes bigint,p_mime_type text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests; g app_private.request_attachment_grants; capability uuid := gen_random_uuid();
  n bigint; reserved_bytes numeric; legacy_bytes numeric;
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
      OR p_file_name ~ '[[:cntrl:]]' OR p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 0 AND 2500000
      OR NOT coalesce((SELECT p_mime_type=ANY(allowed_mime_types) FROM storage.buckets
        WHERE id='request-attachments' AND public=false AND file_size_limit=2500000),false) THEN
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
        size_bytes,object_name,expires_at)
      VALUES(capability,r.id,p_upload_key,btrim(p_file_name),p_mime_type,p_size_bytes,
        r.id::text||'/'||capability::text||'-'||regexp_replace(btrim(p_file_name),'[^A-Za-z0-9._-]','_','g'),
        r.created_at+interval '30 minutes') RETURNING * INTO g;
  END IF;
  RETURN jsonb_build_object('bucket','request-attachments','path',g.object_name,
    'mime_type',g.mime_type,'size_bytes',g.size_bytes,'expires_at',g.expires_at);
END $$;

-- Recommended client contract: reserve the complete compressed batch atomically.
-- A rejected item rolls back the whole batch, without consuming partial slots.
CREATE FUNCTION public.reserve_request_attachments(p_request_id uuid,p_tracking_token uuid,p_files jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; result jsonb := '[]'::jsonb;
BEGIN
  IF p_files IS NULL OR jsonb_typeof(p_files)<>'array' OR octet_length(p_files::text)>10000 THEN
    RAISE EXCEPTION 'Expected bounded attachment array' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_files) NOT BETWEEN 1 AND 4 OR
      (SELECT count(DISTINCT value->>'upload_key') FROM jsonb_array_elements(p_files))<>jsonb_array_length(p_files) THEN
    RAISE EXCEPTION 'Expected one to four distinct upload keys' USING ERRCODE='22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_files) LOOP
    PERFORM app_private.assert_payload(item,ARRAY['upload_key','file_name','size_bytes','mime_type']);
    IF jsonb_typeof(item->'size_bytes') IS DISTINCT FROM 'number'
        OR coalesce(item->>'size_bytes','') !~ '^[0-9]{1,7}$' THEN
      RAISE EXCEPTION 'Expected integer file size' USING ERRCODE='22023';
    END IF;
    result := result || jsonb_build_array(public.reserve_request_attachment(p_request_id,p_tracking_token,
      (item->>'upload_key')::uuid,item->>'file_name',(item->>'size_bytes')::bigint,item->>'mime_type'));
  END LOOP;
  RETURN result;
END $$;

-- M8's existing Storage INSERT policy calls this function. Its policy, private
-- bucket and read policy are retained; its single-file maximum is now 2,500,000.
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
REVOKE ALL ON FUNCTION public.reserve_request_attachments(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reserve_request_attachments(uuid,uuid,jsonb) TO anon,authenticated;

-- Storage probes INSERT permission in rolled-back transactions before it knows
-- the actual streamed size. Check final server metadata at COMMIT, including
-- Storage's privileged final write. Client user_metadata is never consulted.
CREATE FUNCTION app_private.enforce_attachment_bytes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE obj record; g app_private.request_attachment_grants; r public.requests;
  actual_size bigint; n bigint; actual_total numeric;
BEGIN
  SELECT * INTO obj FROM storage.objects WHERE id=NEW.id AND bucket_id='request-attachments';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO g FROM app_private.request_attachment_grants WHERE object_name=obj.name;
  IF NOT FOUND THEN RAISE EXCEPTION 'Final attachment requires an authorized reservation' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.requests WHERE id=g.request_id FOR UPDATE;
  IF r.status<>'pending' OR r.created_at<=clock_timestamp()-interval '30 minutes' OR g.expires_at<=clock_timestamp() THEN
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
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app_private.enforce_attachment_bytes() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER procont_attachment_final_size
  AFTER INSERT OR UPDATE ON storage.objects DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.bucket_id='request-attachments')
  EXECUTE FUNCTION app_private.enforce_attachment_bytes();

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
