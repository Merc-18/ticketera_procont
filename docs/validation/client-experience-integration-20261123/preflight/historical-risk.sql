WITH i AS (SELECT * FROM app_private.client_identities),
l AS (SELECT l.*, i.subject_source, i.subject, i.username FROM app_private.client_request_links l JOIN app_private.client_identities i ON i.id=l.identity_id),
dup AS (SELECT company_id, provider, username, count(*) n FROM i WHERE provider='quipu' GROUP BY 1,2,3 HAVING count(*)>1)
SELECT jsonb_build_object(
 'companies', (SELECT count(*) FROM app_private.client_companies),
 'identities_by_provider_source', (SELECT jsonb_object_agg(k,n) FROM (SELECT provider||'/'||subject_source k, count(*) n FROM i GROUP BY 1) x),
 'quipu_identities_provider_id', (SELECT count(*) FROM i WHERE provider='quipu' AND subject_source='provider_id'),
 'quipu_identities_username_subject_mismatch', (SELECT count(*) FROM i WHERE provider='quipu' AND subject_source='username' AND subject IS DISTINCT FROM username),
 'quipu_usernames_with_multiple_identities', (SELECT count(*) FROM dup),
 'identities_in_multi_username_groups', (SELECT coalesce(sum(n),0) FROM dup),
 'links_total', (SELECT count(*) FROM l),
 'links_by_provider', (SELECT jsonb_object_agg(provider,n) FROM (SELECT provider, count(*) n FROM l GROUP BY 1) x),
 'quipu_links_hidden_after_m16', (SELECT count(*) FROM l WHERE provider='quipu' AND NOT (subject_source='username' AND subject=username)),
 'quipu_links_kept_after_m16', (SELECT count(*) FROM l WHERE provider='quipu' AND subject_source='username' AND subject=username),
 'quipufac_links_kept_after_m16', (SELECT count(*) FROM l WHERE provider='quipufac'),
 'sessions_active', (SELECT count(*) FROM app_private.client_sessions s WHERE revoked_at IS NULL AND expires_at>now()),
 'sessions_active_revoked_by_m16', (SELECT count(*) FROM app_private.client_sessions s JOIN i ON i.id=s.identity_id WHERE s.revoked_at IS NULL AND s.expires_at>now() AND i.provider='quipu' AND NOT (i.subject_source='username' AND i.subject=i.username)),
 'entry_codes_pending', (SELECT count(*) FROM app_private.client_entry_codes WHERE used_at IS NULL AND expires_at>now())
) AS risk;
