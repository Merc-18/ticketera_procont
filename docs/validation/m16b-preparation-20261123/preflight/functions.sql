SELECT jsonb_object_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
  jsonb_build_object('result',pg_get_function_result(p.oid),'secdef',p.prosecdef,'volatile',p.provolatile,'config',p.proconfig,
    'body_md5',md5(p.prosrc),
    'exec',(SELECT jsonb_agg(r ORDER BY r) FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_function_privilege(r,p.oid,'EXECUTE')))) AS f
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app_private');
