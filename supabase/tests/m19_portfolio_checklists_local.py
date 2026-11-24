#!/usr/bin/env python3
"""M19 (checklist sugerido, Portafolio, alta interna con paridad) en PostgreSQL 17 desechable, solo por socket.

clean:   M1-M18, fixtures, prueba de rollback de M19, M19, idempotencia y comprobaciones.
upgrade: M1-M18 con historia (proyecto con checklist sembrado y completado), M19 y verificación de que nada cambia.
Auth/Storage son stubs locales; nunca se contacta Supabase. Evidencia: docs/validation/m19-portfolio-checklists-cards-20261124/data/.
"""
import argparse, getpass, hashlib, json, os, re, shutil, subprocess, tempfile, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from threading import Barrier

ROOT = Path(__file__).resolve().parents[2]
M19 = '20261124000200_suggested_checklists_portfolios_internal_tickets.sql'
OFFERED = ['azul','celeste','dorado','ambar','grafito','pizarra','dorado-claro','ambar-bronce','celeste-oscuro','pizarra-acero']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
parser.add_argument('--scenario', choices=['clean', 'upgrade'], required=True)
args = parser.parse_args()
work = Path(tempfile.mkdtemp(prefix='procont-m19-', dir='/tmp'))
cluster, socket = work/'cluster', work/'socket'
socket.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-password'), PGSERVICEFILE=str(work/'no-service'))
PORT = '55519'
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq',
        '-h', str(socket), '-p', PORT, '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_m19_owner'
users = {role: f'00000000-0000-4000-8000-{n:012d}' for n, role in enumerate(
    ['superadmin', 'admin', 'developer', 'viewer', 'inactive', 'external'], 181)}
checks, server = [], None


def lit(v):
    return 'NULL' if v is None else "'"+str(v).replace("'", "''")+"'"


def data(v):
    return lit(json.dumps(v))+'::jsonb'


def q(text, role=owner, actor=None):
    prefix = (f'SET ROLE {role};\n' if role else '')+f'SET request.jwt.claim.sub={lit(actor or "")};\n'
    r = subprocess.run(base, input=prefix+text, env=env, text=True, capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


def j(text, role=owner, actor=None):
    return json.loads(q(text, role, actor))


def fails(text, code, role=owner, actor=None):
    try:
        q(text, role, actor)
    except RuntimeError as e:
        assert code in str(e), str(e)
        return
    raise AssertionError(f'expected {code}: {text}')


def passed(name):
    checks.append(name)
    print('PASS '+name, flush=True)


def table_md5(sql):
    return q(f"SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text) FROM ({sql}) t", None)


def snapshot():
    tables = j("SELECT jsonb_agg(format('%I.%I',n.nspname,c.relname)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
               "WHERE c.relkind='r' AND n.nspname IN('public','app_private','auth','storage')", None)
    return {t: table_md5('SELECT * FROM '+t) for t in tables}


def new_profile(uid, active=True):
    q(f"INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES({lit(uid)},{lit(uid+'@fixture.invalid')},"
      "'{\"full_name\":\"Synthetic M18 member\"}',now())", None)
    q(f'SELECT app_private.provision_auth_profile({lit(uid)})')
    if active:
        q(f"UPDATE public.users SET role='developer',is_active=true WHERE id={lit(uid)}")


def staff():
    for role, actor in users.items():
        q(f"INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES({lit(actor)},{lit(role+'@fixture.invalid')},"
          "'{\"full_name\":\"Synthetic staff\"}',now())", None)
        if role != 'external':
            q(f"SELECT app_private.{'bootstrap_superadmin' if role == 'superadmin' else 'provision_auth_profile'}({lit(actor)})")
    for role in ['admin', 'developer', 'viewer', 'inactive']:
        q(f"UPDATE public.users SET role={lit('admin' if role == 'inactive' else role)},"
          f"is_active={'false' if role == 'inactive' else 'true'} WHERE id={lit(users[role])}")



def frontend_templates():
    src = (ROOT/'src/lib/checklist-defaults.ts').read_text()
    out = {}
    for flow in ['development', 'administrative']:
        block = re.search(rf"  {flow}: \{{\n(.*?)\n  \}},", src, re.S).group(1)
        for phase, items in re.findall(r"    (\w+): \[(.*?)\],", block):
            out[(flow, phase)] = re.findall(r"'([^']+)'", items)
    return out


def apply_with_rollback_test(path):
    source = path.read_text()
    inner = source[source.index('BEGIN;')+len('BEGIN;'):].rsplit('COMMIT;', 1)[0]
    before = snapshot()
    q('BEGIN;\n'+inner+'\nROLLBACK;')
    assert snapshot() == before
    assert q("SELECT to_regclass('public.portfolios') IS NULL AND to_regprocedure('public.create_internal_ticket(jsonb,uuid)') IS NULL", None) == 't'
    passed('M19: ejecutada en una transacción y revertida con ROLLBACK, la base queda idéntica (sin portafolios ni RPC nuevas)')
    q(source)
    after = snapshot()
    q(source)
    assert snapshot() == after, 'M19 no es idempotente'
    passed('M19: se aplica y una segunda ejecución no cambia ninguna tabla (idempotente)')


def ids():
    return {
      'procont_study': q("SELECT studio_id FROM public.studio_codes WHERE code='PROCONT' AND is_active", None),
      'procont_code': q("SELECT id FROM public.studio_codes WHERE code='PROCONT' AND is_active", None),
      'system': q("SELECT id FROM public.catalog_systems WHERE is_active AND NOT requires_subproject ORDER BY name LIMIT 1", None),
      'type': q("SELECT id FROM public.request_types WHERE is_active ORDER BY sort_order LIMIT 1", None),
    }


def checklist_checks():
    rows = j("SELECT jsonb_agg(jsonb_build_array(flow_type,phase,order_index,description) ORDER BY flow_type,phase,order_index) FROM public.checklist_templates", None)
    server = {}
    for flow, phase, idx, text in rows: server.setdefault((flow, phase), []).append(text)
    front = frontend_templates()
    assert server == front, (set(server) ^ set(front))
    assert len(rows) == 45 and all(len(v) == 3 for v in server.values()) and len(server) == 15
    passed('Checklist: 15 fases reales con exactamente 3 sugerencias cada una (45), idénticas al frontend')
    pid = j('SELECT public.create_internal_project('+data({'title': 'Tarjeta nueva M19', 'description': 'Fixture M19', 'project_type': 'development',
            'priority': 'medium', 'assigned_dev': users['developer']})+',gen_random_uuid())', 'authenticated', users['admin'])['id']
    assert q(f"SELECT count(*) FROM public.checklist_items i JOIN public.project_flows f ON f.id=i.project_flow_id WHERE f.project_id={lit(pid)}") == '0'
    passed('Checklist: una tarjeta nueva nace sin tareas materializadas (add_flows ya no copia plantillas)')
    flow = q(f"SELECT id FROM public.project_flows WHERE project_id={lit(pid)}")
    j('SELECT public.operate_board_ticket('+lit(pid)+",'move_phase',"+data({'flow_id': flow, 'to_phase': 'analysis'})+',gen_random_uuid())', 'authenticated', users['admin'])
    assert q(f"SELECT count(*) FROM public.checklist_items WHERE project_flow_id={lit(flow)}") == '0'
    for i, t in enumerate(front[('development', 'analysis')]):
        q(f"INSERT INTO public.checklist_items(project_flow_id,phase,description,order_index) VALUES({lit(flow)},'analysis',{lit(t)},{i})", 'authenticated', users['developer'])
    q(f"UPDATE public.checklist_items SET completed=true WHERE project_flow_id={lit(flow)} AND order_index=0", 'authenticated', users['developer'])
    assert q(f"SELECT count(*)||'/'||count(*) FILTER (WHERE completed) FROM public.checklist_items WHERE project_flow_id={lit(flow)}") == '3/1'
    passed('Checklist: el cambio de fase no siembra nada; agregar las 3 sugeridas y completarlas sigue funcionando bajo RLS')
    return pid


def portfolio_checks():
    g = q("SELECT id FROM public.portfolios WHERE name='Gestión'", None)
    bf = q(f"SELECT id FROM public.portfolio_initiatives WHERE portfolio_id={lit(g)} AND name='Beneficiarios finales'", None)
    assert g and bf
    passed('Portafolio: existe «Gestión» con la iniciativa «Beneficiarios finales»')
    for t in ['public.portfolios', 'public.portfolio_initiatives']:
        assert q(f"SELECT relrowsecurity::text FROM pg_class WHERE oid='{t}'::regclass", None) == 'true'
        assert q(f"SELECT has_table_privilege('authenticated','{t}','SELECT')::text||has_table_privilege('authenticated','{t}','INSERT')::text||has_table_privilege('authenticated','{t}','UPDATE')::text||has_table_privilege('anon','{t}','SELECT')::text", None) == 'truefalsefalsefalse'
    assert q('SELECT count(*) FROM public.portfolios', 'authenticated', users['viewer']) != '0'
    assert q('SELECT count(*) FROM public.portfolios', 'authenticated', users['external']) == '0'
    fails('SELECT * FROM public.portfolios', 'permission denied', 'anon')
    fails("INSERT INTO public.portfolios(name) VALUES('Directo')", 'permission denied', 'authenticated', users['admin'])
    fails(f"UPDATE public.projects SET portfolio_id={lit(g)}", 'permission denied', 'authenticated', users['admin'])
    passed('Seguridad: RLS en portafolios; lectura solo para internos activos; sin escritura directa (tablas ni projects.portfolio_id)')
    for fn in ['public.save_portfolio(jsonb)', 'public.save_portfolio_initiative(jsonb)', 'public.set_project_portfolio(uuid,uuid,uuid)',
               'public.create_internal_ticket(jsonb,uuid)', 'app_private.add_flows(uuid,text,uuid,uuid)']:
        cfg = q(f"SELECT prosecdef::text||'|'||array_to_string(proconfig,',') FROM pg_proc WHERE oid='{fn}'::regprocedure", None)
        assert cfg == 'true|search_path=""', (fn, cfg)
        assert q(f"SELECT has_function_privilege('anon','{fn}','EXECUTE')::text||has_function_privilege('public','{fn}','EXECUTE')::text", None) == 'falsefalse', fn
    assert q("SELECT has_function_privilege('authenticated','app_private.add_flows(uuid,text,uuid,uuid)','EXECUTE')", None) == 'f'
    passed('Seguridad: funciones nuevas/reemplazadas SECURITY DEFINER con search_path vacío; PUBLIC y anon sin EXECUTE; add_flows solo interna')
    fails("SELECT public.save_portfolio('{\"name\":\"Dev\"}'::jsonb)", '42501', 'authenticated', users['developer'])
    p2 = j("SELECT public.save_portfolio('{\"name\":\"Operaciones\"}'::jsonb)", 'authenticated', users['admin'])['id']
    fails("SELECT public.save_portfolio('{\"name\":\" gestión \"}'::jsonb)", '23505', 'authenticated', users['admin'])
    i2 = j('SELECT public.save_portfolio_initiative('+data({'portfolio_id': p2, 'name': 'Cierre anual'})+')', 'authenticated', users['admin'])['id']
    fails('SELECT public.save_portfolio_initiative('+data({'id': i2, 'portfolio_id': g, 'name': 'Cierre anual'})+')', '22023', 'authenticated', users['admin'])
    passed('Portafolio: solo admin/superadmin gestionan el catálogo; nombres únicos sin distinguir mayúsculas; una iniciativa no cambia de portafolio')
    return g, bf, p2, i2


def link_checks(pid, g, bf, p2, i2):
    before = table_md5(f"SELECT id,title,description,priority,status,is_blocked,request_id FROM public.projects WHERE id={lit(pid)}")
    r = j(f'SELECT public.set_project_portfolio({lit(pid)},NULL,{lit(bf)})', 'authenticated', users['developer'])
    assert r['portfolio_id'] == g and r['initiative_id'] == bf
    assert q(f"SELECT portfolio_id||'|'||initiative_id FROM public.projects WHERE id={lit(pid)}") == f'{g}|{bf}'
    assert q(f"SELECT count(*) FROM public.activity_logs WHERE project_id={lit(pid)} AND action='portfolio_changed'") == '1'
    assert table_md5(f"SELECT id,title,description,priority,status,is_blocked,request_id FROM public.projects WHERE id={lit(pid)}") == before
    passed('Asociación: un developer asocia el ticket a «Gestión · Beneficiarios finales» (portafolio derivado de la iniciativa), auditado, sin tocar otros campos')
    fails(f'SELECT public.set_project_portfolio({lit(pid)},{lit(g)},{lit(i2)})', '22023', 'authenticated', users['developer'])
    fails(f'SELECT public.set_project_portfolio({lit(pid)},{lit(g)},NULL)', '42501', 'authenticated', users['viewer'])
    fails(f"UPDATE public.projects SET initiative_id={lit(i2)}, portfolio_id={lit(g)} WHERE id={lit(pid)}", 'violates foreign key', None)
    passed('Asociación: iniciativa de otro portafolio rechazada (RPC y FK compuesta); viewer no puede asociar')
    j('SELECT public.save_portfolio_initiative('+data({'id': i2, 'portfolio_id': p2, 'name': 'Cierre anual', 'is_active': False})+')', 'authenticated', users['admin'])
    fails(f'SELECT public.set_project_portfolio({lit(pid)},NULL,{lit(i2)})', '22023', 'authenticated', users['developer'])
    j(f'SELECT public.set_project_portfolio({lit(pid)},NULL,NULL)', 'authenticated', users['developer'])
    assert q(f"SELECT coalesce(portfolio_id::text,'-')||coalesce(initiative_id::text,'-') FROM public.projects WHERE id={lit(pid)}") == '--'
    passed('Asociación: una iniciativa inactiva no se asigna de nuevo; quitar el portafolio deja el ticket sin portafolio')


def ticket_checks(g, bf):
    c = ids()
    other_study = q("INSERT INTO public.studios(name,ruc) VALUES('Estudio M19','20000000019') RETURNING id", None)
    other_code = q(f"INSERT INTO public.studio_codes(studio_id,code) VALUES({lit(other_study)},'M19_FIXTURE') RETURNING id", None)
    area = q(f"INSERT INTO public.areas(studio_id,name,code,is_active) VALUES({lit(c['procont_study'])},'Área M19','AM19',true) RETURNING id", None)
    base = {'title': 'Ticket registrado por TI', 'description': 'Detalle ficticio M19', 'priority': 'high', 'assigned_dev': users['developer']}
    # Interno u operativo: INT, Portafolio, fase inicial, sin tareas.
    key = '00000000-0000-4000-8000-000000019001'
    r = j('SELECT public.create_internal_ticket('+data({**base, 'mode': 'internal', 'initiative_id': bf, 'initial_phase': 'dev'})+f',{lit(key)})', 'authenticated', users['admin'])
    again = j('SELECT public.create_internal_ticket('+data({**base, 'mode': 'internal', 'initiative_id': bf, 'initial_phase': 'dev'})+f',{lit(key)})', 'authenticated', users['admin'])
    assert again == r and r['request_number'].startswith('INT')
    pid = r['project']['id']
    assert q(f"SELECT portfolio_id||'|'||initiative_id FROM public.projects WHERE id={lit(pid)}") == f'{g}|{bf}'
    assert q(f"SELECT current_phase FROM public.project_flows WHERE project_id={lit(pid)}") == 'dev'
    assert q(f"SELECT count(*) FROM public.request_events WHERE request_id={lit(r['request_id'])} AND action='phase_changed'") == '1'
    assert q(f"SELECT count(*) FROM public.checklist_items i JOIN public.project_flows f ON f.id=i.project_flow_id WHERE f.project_id={lit(pid)}") == '0'
    assert q("SELECT count(*) FROM public.projects WHERE title='Ticket registrado por TI'") == '1'
    passed('Alta interna (modo interno): INT con Portafolio e iniciativa, fase inicial Development auditada, sin tareas; reintento idempotente sin duplicar')
    fails('SELECT public.create_internal_ticket('+data({**base, 'mode': 'internal', 'studio_id': c['procont_study']})+',gen_random_uuid())', '22023', 'authenticated', users['admin'])
    fails('SELECT public.create_internal_ticket('+data({**base, 'mode': 'internal'})+',gen_random_uuid())', '42501', 'authenticated', users['developer'])
    fails('SELECT public.create_internal_ticket('+data({**base, 'mode': 'internal', 'initial_phase': 'done'})+',gen_random_uuid())', '22023', 'authenticated', users['admin'])
    passed('Alta interna: datos de cliente en modo interno, rol developer y fase inicial Done son rechazados')
    client = {**base, 'mode': 'client', 'requester_name': 'Cliente ficticio', 'requester_email': 'cliente@fixture.invalid', 'system_id': c['system'],
              'request_type_id': c['type'], 'requested_priority': 'urgent', 'portfolio_id': g}
    # Otro código (no PROCONT): un área enviada se ignora (regla M17).
    r2 = j('SELECT public.create_internal_ticket('+data({**client, 'studio_id': other_study, 'studio_code_id': other_code, 'area_id': area})+',gen_random_uuid())', 'authenticated', users['admin'])
    row = j(f"SELECT jsonb_build_object('n',request_number,'s',status,'o',origin,'t',title,'rp',requested_priority,'rt',request_type_id,'st',studio_id,'code',studio_code_id,'sys',system_id,'a',area_id,'p',project_id) FROM public.requests WHERE id={lit(r2['request_id'])}")
    assert row['n'].startswith('REQ') and row['s'] == 'approved' and row['o'] == 'Cliente' and row['t'] == base['title'] and row['rp'] == 'urgent'
    assert row['rt'] == c['type'] and row['st'] == other_study and row['code'] == other_code and row['sys'] == c['system'] and row['a'] is None
    assert q(f"SELECT priority FROM public.projects WHERE id={lit(r2['project']['id'])}") == 'high'
    events = q(f"SELECT string_agg(action,',' ORDER BY created_at,action) FROM public.request_events WHERE request_id={lit(r2['request_id'])}")
    assert events.split(',').count('submitted') == 1 and events.split(',').count('classified') == 1 and events.split(',').count('approved') == 1, events
    passed('Alta interna (modo cliente): REQ aprobada con estudio, código, producto, tipo, prioridad solicitada (Urgente) y asignada (Alto); otro código ignora el área')
    before = q('SELECT count(*) FROM public.requests', None)
    fails('SELECT public.create_internal_ticket('+data({**client, 'studio_id': c['procont_study'], 'studio_code_id': c['procont_code']})+',gen_random_uuid())', 'Área requerida para el código PROCONT', 'authenticated', users['admin'])
    assert q('SELECT count(*) FROM public.requests', None) == before
    passed('Alta interna (modo cliente): con código PROCONT el área es obligatoria; el error revierte todo (ninguna solicitud huérfana)')
    r3 = j('SELECT public.create_internal_ticket('+data({**client, 'studio_id': c['procont_study'], 'studio_code_id': c['procont_code'], 'area_id': area})+',gen_random_uuid())', 'authenticated', users['admin'])
    assert q(f"SELECT area_id||'|'||requester_area FROM public.requests WHERE id={lit(r3['request_id'])}") == f'{area}|Área M19'
    passed('Alta interna (modo cliente): con el código exacto PROCONT el área se valida y se guarda')
    fails('SELECT public.create_internal_ticket('+data({**client, 'studio_id': other_study, 'studio_code_id': c['procont_code']})+',gen_random_uuid())', '22023', 'authenticated', users['admin'])
    passed('Alta interna (modo cliente): un código que no pertenece al estudio es rechazado por classify_request')


try:
    subprocess.run([str(args.pg_bin/'initdb'), '-D', str(cluster), '-A', 'trust', '--locale=C.UTF-8', '-E', 'UTF8'],
                   env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    with (work/'server.log').open('w') as log:
        server = subprocess.Popen([str(args.pg_bin/'postgres'), '-D', str(cluster), '-c', 'listen_addresses=',
                                   '-c', f'unix_socket_directories={socket}', '-c', 'wal_level=logical', '-p', PORT],
                                  env=env, stdout=log, stderr=log)
    for _ in range(100):
        try:
            q('SELECT 1', None); break
        except RuntimeError:
            if server.poll() is not None: raise
            time.sleep(.05)
    else:
        raise RuntimeError('PostgreSQL aislado no disponible')
    assert Path(q('SHOW data_directory', None)).resolve() == cluster and q('SHOW listen_addresses', None) == ''
    version = q('SHOW server_version', None)
    assert version.startswith('17.'), version
    q(f'CREATE ROLE {owner} NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; '
      f'CREATE ROLE service_role NOLOGIN BYPASSRLS; ALTER DATABASE postgres OWNER TO {owner};', None)
    q((ROOT/'supabase/tests/support/auth_stub.sql').read_text(), None)
    q(f'ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz; GRANT USAGE ON SCHEMA auth TO {owner}; '
      f'GRANT SELECT(id,email,raw_user_meta_data,email_confirmed_at),REFERENCES(id) ON auth.users TO {owner}; '
      f'ALTER PUBLICATION supabase_realtime OWNER TO {owner};', None)
    q(f'''CREATE SCHEMA storage AUTHORIZATION {owner};
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,created_at timestamptz DEFAULT now(),metadata jsonb DEFAULT '{{}}'::jsonb);
      ALTER TABLE storage.buckets OWNER TO {owner}; ALTER TABLE storage.objects OWNER TO {owner};
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated; GRANT SELECT,INSERT ON storage.objects TO anon,authenticated;''', None)
    paths = sorted((ROOT/'supabase/migrations').glob('*.sql'))
    assert len(paths) == 20 and paths[-1].name == M19 and paths[-2].name == '20261124000100_limit_card_colors_and_seed_missing_checklists.sql'
    assert len({p.name[:14] for p in paths}) == 20
    for path in paths[:-1]:
        q(path.read_text())
    staff()
    passed(f'Base: M1-M18 (19 migraciones) aplicadas en orden ({args.scenario})')
    history = {}
    if args.scenario == 'upgrade':
        legacy = j('SELECT public.create_internal_project('+data({'title': 'Histórico M18', 'description': 'Fixture', 'project_type': 'development',
                   'priority': 'low', 'assigned_dev': users['developer']})+',gen_random_uuid())', 'authenticated', users['admin'])['id']
        lflow = q(f"SELECT id FROM public.project_flows WHERE project_id={lit(legacy)}")
        assert q(f"SELECT count(*) FROM public.checklist_items WHERE project_flow_id={lit(lflow)}") == '25'
        q(f"UPDATE public.checklist_items SET completed=true WHERE project_flow_id={lit(lflow)} AND phase='backlog'", 'authenticated', users['developer'])
        history = {t: table_md5('SELECT * FROM '+t) for t in ['public.checklist_items', 'public.projects', 'public.project_flows', 'public.requests',
                   'public.request_events', 'public.activity_logs', 'public.internal_card_preferences', 'public.users']}
        projects_core = table_md5("SELECT id,request_id,title,description,priority,status,is_blocked,start_date,due_date,updated_at FROM public.projects")
        passed('B: base M18 con historia: tarjeta con 25 tareas sembradas por M18 y Backlog completado')
    apply_with_rollback_test(paths[-1])
    if args.scenario == 'upgrade':
        now = {t: table_md5('SELECT * FROM '+t) for t in history}
        changed = [t for t in history if now[t] != history[t]]
        # projects gana dos columnas NULL: se compara sin ellas.
        assert changed in ([], ['public.projects']), changed
        assert table_md5("SELECT id,request_id,title,description,priority,status,is_blocked,start_date,due_date,updated_at FROM public.projects") == projects_core
        assert q('SELECT count(*) FROM public.projects WHERE portfolio_id IS NOT NULL OR initiative_id IS NOT NULL', None) == '0'
        assert q(f"SELECT count(*)||'/'||count(*) FILTER (WHERE completed) FROM public.checklist_items WHERE project_flow_id={lit(lflow)}", None) == '25/3'
        passed('B: M19 no cambia checklists, solicitudes, eventos, auditoría, colores ni usuarios; proyectos existentes quedan sin portafolio (columnas nulas)')
    pid = checklist_checks()
    g, bf, p2, i2 = portfolio_checks()
    link_checks(pid, g, bf, p2, i2)
    ticket_checks(g, bf)
finally:
    if server and server.poll() is None:
        subprocess.run([str(args.pg_bin/'pg_ctl'), '-D', str(cluster), 'stop', '-m', 'fast', '-w', '-t', '20'],
                       env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        server.wait(timeout=5)
    shutil.rmtree(work)

out = ROOT/'docs/validation/m19-portfolio-checklists-cards-20261124/data'
out.mkdir(parents=True, exist_ok=True)
evidence = {'at_utc': datetime.now(timezone.utc).isoformat(), 'scenario': args.scenario, 'postgresql': version,
            'passed': len(checks), 'checks': checks,
            'migration_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
            'socket_only': True, 'server_stopped': True, 'auth_storage_stubs': True, 'remote_operations': False}
(out/f'm19-{args.scenario}.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False)+'\n')
print(f'{len(checks)} comprobaciones M19 ({args.scenario}) superadas; servidor detenido.')
