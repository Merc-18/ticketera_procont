SELECT jsonb_build_object(
 'systems', (SELECT jsonb_agg(jsonb_build_object('name',s.name,'active',s.is_active,'requires_subproject',s.requires_subproject,'sort',s.sort_order,
    'subsystems',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.name,'active',c.is_active) ORDER BY c.name),'[]') FROM public.catalog_subsystems c WHERE c.system_id=s.id)) ORDER BY s.sort_order,s.name) FROM public.catalog_systems s),
 'platform_bindings', (SELECT jsonb_object_agg(b.provider,s.name) FROM app_private.client_product_bindings b JOIN public.catalog_systems s ON s.id=b.system_id),
 'request_types_active', (SELECT jsonb_agg(name ORDER BY name) FROM public.request_types WHERE is_active),
 'requests_by_system_subsystem', (SELECT jsonb_agg(jsonb_build_object('system',s.name,'has_subsystem',r.subsystem_id IS NOT NULL,'status',r.status,'n',1)) FROM public.requests r JOIN public.catalog_systems s ON s.id=r.system_id)
) AS catalog;
