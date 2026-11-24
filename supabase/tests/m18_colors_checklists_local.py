#!/usr/bin/env python3
"""M18 (paleta de 10 colores + plantillas Analysis/Code Review) en PostgreSQL 17 desechable, solo por socket.

clean:   M1-M17, fixtures, prueba de rollback de M18, M18, idempotencia y comprobaciones.
upgrade: M1-M17 con historia real (colores retirados asignados, proyectos con checklist completado), M18 y
         verificación de que ningún dato histórico cambia.
Auth/Storage son stubs locales; nunca se contacta Supabase. Evidencia: docs/validation/m18-colors-checklists-20261124/data/.
"""
import argparse, getpass, hashlib, json, os, re, shutil, subprocess, tempfile, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from threading import Barrier

ROOT = Path(__file__).resolve().parents[2]
M18 = '20261124000100_limit_card_colors_and_seed_missing_checklists.sql'
OFFERED = ['azul','celeste','dorado','ambar','grafito','pizarra','dorado-claro','ambar-bronce','celeste-oscuro','pizarra-acero']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
parser.add_argument('--scenario', choices=['clean', 'upgrade'], required=True)
args = parser.parse_args()
work = Path(tempfile.mkdtemp(prefix='procont-m18-', dir='/tmp'))
cluster, socket = work/'cluster', work/'socket'
socket.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-password'), PGSERVICEFILE=str(work/'no-service'))
PORT = '55518'
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq',
        '-h', str(socket), '-p', PORT, '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_m18_owner'
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


def color(uid):
    return q('SELECT coalesce(color_id,\'<none>\') FROM (SELECT (SELECT color_id FROM public.internal_card_preferences WHERE user_id='+lit(uid)+') color_id) x')


def internal_project(title):
    return j('SELECT public.create_internal_project('+data({'title': title, 'description': 'M18 synthetic fixture',
             'project_type': 'development', 'priority': 'medium', 'assigned_dev': users['developer']})+',gen_random_uuid())',
             'authenticated', users['admin'])['id']


def frontend_templates():
    src = (ROOT/'src/lib/checklist-defaults.ts').read_text()
    out = {}
    for phase in ['analysis', 'code_review']:
        block = re.search(rf"\n    {phase}: \[\n(.*?)\n    \],", src, re.S).group(1)
        out[phase] = re.findall(r"'([^']+)'", block)
    return out


def apply_m18_with_rollback_test(path):
    source = path.read_text()
    inner = source.removeprefix(source[:source.index('BEGIN;')+len('BEGIN;')]).rsplit('COMMIT;', 1)[0]
    before = snapshot()
    q('BEGIN;\n'+inner+'\nROLLBACK;')
    assert snapshot() == before
    assert q("SELECT count(*) FROM information_schema.columns WHERE table_schema='app_private' AND table_name='internal_card_color_catalog' AND column_name='offered'", None) == '0'
    passed('M18: ejecutada dentro de una transacción y revertida con ROLLBACK, la base queda idéntica (sin columna offered ni plantillas)')
    q(source)
    after = snapshot()
    q(source)
    assert snapshot() == after, 'M18 no es idempotente'
    passed('M18: se aplica y una segunda ejecución no cambia ninguna tabla (idempotente)')


def color_checks():
    # Catálogo y permisos.
    assert sorted(j("SELECT jsonb_agg(color_id ORDER BY sort_order) FROM app_private.internal_card_color_catalog WHERE offered", None)) == sorted(OFFERED)
    assert q('SELECT count(*) FROM app_private.internal_card_color_catalog', None) == '24'
    passed('Colores: exactamente los 10 aprobados están ofrecidos; el catálogo conserva sus 24 identificadores')
    for fn in ["app_private.ensure_internal_card_color(uuid,text)", "public.internal_card_colors()", "public.set_my_internal_card_color(text)"]:
        cfg = q(f"SELECT prosecdef::text||'|'||array_to_string(proconfig,',') FROM pg_proc WHERE oid='{fn}'::regprocedure", None)
        assert cfg == 'true|search_path=""', (fn, cfg)
    assert q("SELECT has_function_privilege('authenticated','app_private.ensure_internal_card_color(uuid,text)','EXECUTE')::text||has_function_privilege('anon','app_private.ensure_internal_card_color(uuid,text)','EXECUTE')::text||has_function_privilege('public','app_private.ensure_internal_card_color(uuid,text)','EXECUTE')::text", None) == 'falsefalsefalse'
    assert q("SELECT has_function_privilege('authenticated','public.internal_card_colors()','EXECUTE')::text||has_function_privilege('anon','public.internal_card_colors()','EXECUTE')::text||has_function_privilege('anon','public.set_my_internal_card_color(text)','EXECUTE')::text", None) == 'truefalsefalse'
    passed('Seguridad: funciones SECURITY DEFINER con search_path vacío; ensure solo interna; RPC solo para authenticated; PUBLIC y anon revocados')
    # Clientes y anónimos.
    fails('SELECT public.internal_card_colors()', 'permission denied', 'anon')
    fails('SELECT * FROM public.internal_card_preferences', 'permission denied', 'anon')
    fails('SELECT public.internal_card_colors()', '42501', 'authenticated', users['external'])
    fails("SELECT public.set_my_internal_card_color('celeste')", '42501', 'authenticated', users['external'])
    assert q('SELECT count(*) FROM public.internal_card_preferences', 'authenticated', users['external']) == '0'
    passed('Seguridad: anon (clientes Quipu/QuipuFac usan anon + token) y un autenticado sin perfil interno no leen ni modifican preferencias')
    # Cada usuario solo modifica su fila (RLS) y no puede forzar colores por SQL directo.
    # La tabla solo concede SELECT (M17): cualquier escritura directa se rechaza; los cambios pasan por la RPC,
    # que solo actúa sobre auth.uid().
    fails(f"UPDATE public.internal_card_preferences SET color_id='celeste' WHERE user_id={lit(users['admin'])}", 'permission denied', 'authenticated', users['developer'])
    fails(f"INSERT INTO public.internal_card_preferences(user_id,color_id) VALUES({lit(users['viewer'])},'celeste')", 'permission denied', 'authenticated', users['developer'])
    fails(f"DELETE FROM public.internal_card_preferences WHERE user_id={lit(users['admin'])}", 'permission denied', 'authenticated', users['developer'])
    assert q("SELECT has_table_privilege('authenticated','public.internal_card_preferences','SELECT')::text||has_table_privilege('authenticated','public.internal_card_preferences','UPDATE')::text||has_table_privilege('authenticated','public.internal_card_preferences','INSERT')::text", None) == 'truefalsefalse'
    shared = j('SELECT public.internal_card_colors()', 'authenticated', users['viewer'])
    assert shared['assignments'] == j('SELECT public.internal_card_colors()', 'authenticated', users['developer'])['assignments']
    assert shared['capacity'] == 10
    passed('Seguridad: sin UPDATE/INSERT/DELETE directos sobre preferencias (solo SELECT con RLS); nadie cambia el color de otro; los internos activos ven la misma asignación')
    # Unicidad y cambio de color.
    taken = q(f"SELECT p.color_id FROM public.internal_card_preferences p JOIN app_private.internal_card_color_catalog c USING(color_id) WHERE c.offered AND p.user_id<>{lit(users['developer'])} LIMIT 1", None)
    assert taken, 'se necesita un color ofrecido ocupado por otro miembro'
    fails(f'SELECT public.set_my_internal_card_color({lit(taken)})', '23505', 'authenticated', users['developer'])
    free = q("SELECT c.color_id FROM app_private.internal_card_color_catalog c WHERE c.offered AND NOT EXISTS (SELECT 1 FROM public.internal_card_preferences p WHERE p.color_id=c.color_id) ORDER BY sort_order LIMIT 1", None)
    old = color(users['developer'])
    q(f'SELECT public.set_my_internal_card_color({lit(free)})', 'authenticated', users['developer'])
    assert color(users['developer']) == free and q(f'SELECT count(*) FROM public.internal_card_preferences WHERE color_id={lit(old)}', None) == '0'
    passed('Colores: un color ocupado devuelve 23505; cambiar de color libera el anterior')
    fails("SELECT public.set_my_internal_card_color('grafito-humo')", '22023', 'authenticated', users['developer'])
    fails("SELECT public.set_my_internal_card_color('no-existe')", '22023', 'authenticated', users['developer'])
    passed('Colores: un color retirado o inexistente no se puede elegir (22023)')
    # Asignaciones simultáneas del mismo color libre: exactamente una gana.
    free = q("SELECT c.color_id FROM app_private.internal_card_color_catalog c WHERE c.offered AND NOT EXISTS (SELECT 1 FROM public.internal_card_preferences p WHERE p.color_id=c.color_id) ORDER BY sort_order LIMIT 1", None)
    barrier = Barrier(2)
    def claim(actor):
        barrier.wait()
        try:
            q(f'SELECT public.set_my_internal_card_color({lit(free)})', 'authenticated', actor); return True
        except RuntimeError as e:
            if '23505' in str(e): return False
            raise
    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(claim, [users['viewer'], users['superadmin']])) == [False, True]
    assert q(f'SELECT count(*) FROM public.internal_card_preferences WHERE color_id={lit(free)}', None) == '1'
    passed('Concurrencia: dos peticiones simultáneas del mismo color → un dueño y un rechazo 23505')
    # Activaciones simultáneas: colores distintos, siempre de los 10.
    pair = ['00000000-0000-4000-8000-000000018801', '00000000-0000-4000-8000-000000018802']
    for uid in pair: new_profile(uid, active=False)
    barrier2 = Barrier(2)
    def activate(uid):
        barrier2.wait(); q(f"UPDATE public.users SET role='developer',is_active=true WHERE id={lit(uid)}")
    with ThreadPoolExecutor(2) as pool:
        list(pool.map(activate, pair))
    got = [color(u) for u in pair]
    assert len(set(got)) == 2 and all(g in OFFERED for g in got), got
    assert q('SELECT count(*)=count(DISTINCT color_id) FROM public.internal_card_preferences', None) == 't'
    passed(f'Concurrencia: dos activaciones simultáneas reciben colores distintos y ofrecidos ({", ".join(got)})')
    # Capacidad: llenar los 10 y activar otro perfil → sin color, activación correcta.
    n = 18900
    while q("SELECT count(*) FROM app_private.internal_card_color_catalog c WHERE c.offered AND NOT EXISTS (SELECT 1 FROM public.internal_card_preferences p WHERE p.color_id=c.color_id)", None) != '0':
        uid = f'00000000-0000-4000-8000-0000000{n:05d}'; n += 1
        new_profile(uid)
        assert color(uid) in OFFERED
    overflow = '00000000-0000-4000-8000-000000019999'
    new_profile(overflow)
    assert q(f'SELECT is_active::text FROM public.users WHERE id={lit(overflow)}', None) == 'true'
    assert color(overflow) == '<none>'
    retired_given = q("SELECT count(*) FROM public.internal_card_preferences p JOIN app_private.internal_card_color_catalog c USING(color_id) WHERE NOT c.offered AND p.updated_at > now() - interval '1 hour' AND p.user_id::text LIKE '00000000-0000-4000-8000-00000001%'", None)
    assert retired_given == '0'
    assert q('SELECT count(*)=count(DISTINCT color_id) FROM public.internal_card_preferences', None) == 't'
    snap = j('SELECT public.internal_card_colors()', 'authenticated', overflow)
    assert overflow not in snap['assignments']
    passed('Capacidad: con los 10 ocupados, un perfil nuevo se activa SIN color; nunca se entrega un retirado ni se repite')
    fails("SELECT public.set_my_internal_card_color('azul')", '23505', 'authenticated', overflow)
    # Al desactivar a alguien se libera su color y el perfil sin color puede tomarlo.
    victim = f'00000000-0000-4000-8000-0000000{n-1:05d}'
    freed = color(victim)
    q(f'UPDATE public.users SET is_active=false WHERE id={lit(victim)}')
    q(f'SELECT public.set_my_internal_card_color({lit(freed)})', 'authenticated', overflow)
    assert color(overflow) == freed
    passed('Capacidad: desactivar libera el color y el perfil sin color puede elegirlo')


def checklist_checks(baseline_templates):
    rows = j("SELECT jsonb_object_agg(phase,list) FROM (SELECT phase,jsonb_agg(description ORDER BY order_index) list FROM public.checklist_templates "
             "WHERE flow_type='development' AND phase IN ('analysis','code_review') GROUP BY phase) x", None)
    assert rows == frontend_templates(), rows
    passed('Checklist: Analysis y Code Review tienen plantilla en el servidor, con el mismo texto y orden que el frontend')
    assert table_md5("SELECT * FROM public.checklist_templates WHERE NOT (flow_type='development' AND phase IN ('analysis','code_review'))") == baseline_templates
    assert q('SELECT count(*) FROM public.checklist_templates', None) == '43'
    passed('Checklist: las 35 plantillas anteriores (6 fases Development + Administrative) no cambian; total 43')
    pid = internal_project('Proyecto nuevo M18')
    flow = q(f"SELECT id FROM public.project_flows WHERE project_id={lit(pid)} AND flow_type='development'")
    counts = j(f"SELECT jsonb_object_agg(phase,n) FROM (SELECT phase,count(*) n FROM public.checklist_items WHERE project_flow_id={lit(flow)} GROUP BY phase) x")
    assert counts == {'backlog': 3, 'analysis': 4, 'design': 3, 'dev': 3, 'code_review': 4, 'testing': 3, 'deploy': 3, 'done': 2}, counts
    assert q(f'SELECT count(*) FROM public.checklist_items WHERE project_flow_id={lit(flow)} AND completed') == '0'
    passed('Checklist: una tarjeta nueva nace con las 8 fases cubiertas (25 tareas, ninguna completada), vía add_flows sin cambios')
    # Edición bajo RLS y cambio de fase con el RPC existente.
    item = q(f"SELECT id FROM public.checklist_items WHERE project_flow_id={lit(flow)} AND phase='backlog' ORDER BY order_index LIMIT 1")
    q(f'UPDATE public.checklist_items SET completed=true WHERE id={lit(item)}', 'authenticated', users['developer'])
    q(f"UPDATE public.checklist_items SET description='Tarea editada M18' WHERE id={lit(item)}", 'authenticated', users['developer'])
    q(f"INSERT INTO public.checklist_items(project_flow_id,phase,description,order_index) VALUES({lit(flow)},'analysis','Tarea manual M18',9)", 'authenticated', users['developer'])
    extra = q(f"SELECT id FROM public.checklist_items WHERE description='Tarea manual M18'")
    q(f'DELETE FROM public.checklist_items WHERE id={lit(extra)}', 'authenticated', users['developer'])
    j('SELECT public.operate_board_ticket('+lit(pid)+",'move_phase',"+data({'flow_id': flow, 'to_phase': 'analysis'})+',gen_random_uuid())', 'authenticated', users['admin'])
    assert q(f'SELECT current_phase FROM public.project_flows WHERE id={lit(flow)}') == 'analysis'
    assert q(f'SELECT completed::text||description FROM public.checklist_items WHERE id={lit(item)}') == 'trueTarea editada M18'
    assert q(f'SELECT count(*) FROM public.checklist_items WHERE project_flow_id={lit(flow)}') == '25'
    passed('Checklist: editar, completar, añadir y borrar bajo RLS; el cambio de fase (operate_board_ticket) no duplica ni desmarca')
    audit = q("SELECT count(*) FROM public.request_events WHERE action IN ('checklist_added','checklist_updated','checklist_deleted')")
    assert int(audit) > 0
    passed('Checklist: la auditoría existente (checklist_added/updated/deleted) sigue registrando los cambios')


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
    assert len(paths) == 19 and paths[-1].name == M18 and paths[-2].name == '20261123000300_internal_area_scope_and_card_preferences.sql'
    assert len({p.name[:14] for p in paths}) == 19, 'timestamps de migración únicos'
    for path in paths[:-1]:
        q(path.read_text())
    staff()
    baseline_templates = table_md5('SELECT * FROM public.checklist_templates')
    assert q("SELECT count(*) FROM public.checklist_templates WHERE phase IN ('analysis','code_review')", None) == '0'
    passed(f'Base: M1-M17 (18 migraciones) aplicadas en orden; 35 plantillas sin Analysis ni Code Review ({args.scenario})')

    history = {}
    if args.scenario == 'upgrade':
        # Historia real M17: los 4 perfiles activos recibieron azul, azul-claro, azul-oscuro y azul-acero (3 retirados).
        legacy_colors = j('SELECT jsonb_object_agg(user_id,color_id) FROM public.internal_card_preferences', None)
        assert sorted(legacy_colors.values()) == ['azul', 'azul-acero', 'azul-claro', 'azul-oscuro'], legacy_colors
        legacy = internal_project('Proyecto histórico M17')
        flow = q(f"SELECT id FROM public.project_flows WHERE project_id={lit(legacy)}")
        q(f"UPDATE public.checklist_items SET completed=true WHERE project_flow_id={lit(flow)} AND phase='backlog'", 'authenticated', users['developer'])
        j('SELECT public.operate_board_ticket('+lit(legacy)+",'move_phase',"+data({'flow_id': flow, 'to_phase': 'analysis'})+',gen_random_uuid())', 'authenticated', users['admin'])
        history = {t: table_md5('SELECT * FROM '+t) for t in ['public.checklist_items', 'public.projects', 'public.project_flows',
                   'public.request_events', 'public.activity_logs', 'public.requests', 'public.users']}
        prefs_before = table_md5('SELECT user_id,color_id,updated_at FROM public.internal_card_preferences')
        passed('B: base M17 con historia: 3 perfiles con colores retirados y un proyecto en Analysis con Backlog completado y Analysis vacío')
    apply_m18_with_rollback_test(paths[-1])

    if args.scenario == 'upgrade':
        assert {t: table_md5('SELECT * FROM '+t) for t in history} == history
        assert table_md5('SELECT user_id,color_id,updated_at FROM public.internal_card_preferences') == prefs_before
        assert q(f"SELECT count(*) FROM public.checklist_items i JOIN public.project_flows f ON f.id=i.project_flow_id WHERE f.project_id={lit(legacy)} AND i.phase IN ('analysis','code_review')", None) == '0'
        passed('B: M18 no cambia checklists, proyectos, flujos, eventos, solicitudes, usuarios ni preferencias existentes (el histórico sigue sin tareas en Analysis)')
        snap = j('SELECT public.internal_card_colors()', 'authenticated', users['admin'])
        retired = {c['id'] for c in snap['colors'] if not c['offered']}
        assert retired == {'azul-claro', 'azul-oscuro', 'azul-acero'} and len(snap['colors']) == 13, snap['colors']
        assert sorted(snap['assignments'].values()) == sorted(legacy_colors.values())
        passed('B: los colores retirados asignados se conservan y se siguen informando (10 ofrecidos + 3 retirados en uso)')
        keeper = next(u for u, c in legacy_colors.items() if c == 'azul-claro')
        q("SELECT public.set_my_internal_card_color('azul-claro')", 'authenticated', keeper)
        assert color(keeper) == 'azul-claro'
        fails("SELECT public.set_my_internal_card_color('azul-oscuro')", '22023', 'authenticated', keeper)   # retirado y de otro: no se ofrece
        fails("SELECT public.set_my_internal_card_color('pizarra-claro')", '22023', 'authenticated', keeper)
        q("SELECT public.set_my_internal_card_color('celeste')", 'authenticated', keeper)
        assert color(keeper) == 'celeste'
        fails("SELECT public.set_my_internal_card_color('azul-claro')", '22023', 'authenticated', keeper)
        passed('B: quien tiene un color retirado puede conservarlo o pasar a uno de los 10; una vez liberado, el retirado no vuelve a ofrecerse')

    color_checks()
    checklist_checks(baseline_templates)
finally:
    if server and server.poll() is None:
        subprocess.run([str(args.pg_bin/'pg_ctl'), '-D', str(cluster), 'stop', '-m', 'fast', '-w', '-t', '20'],
                       env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        server.wait(timeout=5)
    shutil.rmtree(work)

out = ROOT/'docs/validation/m18-colors-checklists-20261124/data'
out.mkdir(parents=True, exist_ok=True)
evidence = {'at_utc': datetime.now(timezone.utc).isoformat(), 'scenario': args.scenario, 'postgresql': version,
            'passed': len(checks), 'checks': checks,
            'migration_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
            'socket_only': True, 'server_stopped': True, 'auth_storage_stubs': True, 'remote_operations': False}
(out/f'm18-{args.scenario}.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False)+'\n')
print(f'{len(checks)} comprobaciones M18 ({args.scenario}) superadas; servidor detenido.')
