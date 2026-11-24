#!/usr/bin/env python3
"""M20 (confirmar con Portafolio) y conjunto reproducible QA-FICTICIO en PostgreSQL 17 desechable, solo por socket.

Aplica M1-M19, prueba ROLLBACK e idempotencia de M20, comprueba approve_request_with_portfolio y siembra datos
QA-FICTICIO por las RPC reales (Quipu, QuipuFac, TI). Exporta tests/ui/qa-dataset.json para las pruebas de interfaz.
NUNCA se ejecuta contra Supabase: solo un clúster desechable por socket; datos 100 % ficticios.
Auth/Storage son stubs locales; nunca se contacta Supabase. Evidencia: docs/validation/dashboard-team-portfolio-progress-20261124/data/.
"""
import argparse, getpass, hashlib, json, os, re, secrets, shutil, subprocess, tempfile, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from threading import Barrier

ROOT = Path(__file__).resolve().parents[2]
M20 = '20261124000300_approve_request_with_portfolio.sql'
OFFERED = ['azul','celeste','dorado','ambar','grafito','pizarra','dorado-claro','ambar-bronce','celeste-oscuro','pizarra-acero']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
args = parser.parse_args()
work = Path(tempfile.mkdtemp(prefix='procont-m20-', dir='/tmp'))
cluster, socket = work/'cluster', work/'socket'
socket.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-password'), PGSERVICEFILE=str(work/'no-service'))
PORT = '55520'
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq',
        '-h', str(socket), '-p', PORT, '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_m20_owner'
# Mismos UUID que tests/ui/fixture-server.mjs (STAFF) para reproducir el conjunto en la interfaz.
users = {'superadmin': '00000000-0000-4000-8000-0000000000c1', 'admin': '00000000-0000-4000-8000-0000000000c2',
         'developer': '00000000-0000-4000-8000-0000000000c3', 'viewer': '00000000-0000-4000-8000-0000000000c4',
         'inactive': '00000000-0000-4000-8000-0000000000c5', 'external': '00000000-0000-4000-8000-0000000000c6'}
NAMES = {'superadmin': 'Superadmin Simulado', 'admin': 'Admin Simulado', 'developer': 'Developer Simulado', 'viewer': 'Viewer Simulado',
         'inactive': 'Inactivo Simulado', 'external': 'Externo Simulado'}
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
        q(f"INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES({lit(actor)},{lit(role+'@simulado.invalid')},"
          + lit(json.dumps({'full_name': NAMES[role]})) + ",now())", None)
        if role != 'external':
            q(f"SELECT app_private.{'bootstrap_superadmin' if role == 'superadmin' else 'provision_auth_profile'}({lit(actor)})")
    for role in ['admin', 'developer', 'viewer', 'inactive']:
        q(f"UPDATE public.users SET role={lit('admin' if role == 'inactive' else role)},"
          f"is_active={'false' if role == 'inactive' else 'true'} WHERE id={lit(users[role])}")



QA = 'QA-FICTICIO'


def apply_with_rollback_test(path):
    source = path.read_text()
    inner = source[source.index('BEGIN;')+len('BEGIN;'):].rsplit('COMMIT;', 1)[0]
    before = snapshot()
    q('BEGIN;\n'+inner+'\nROLLBACK;')
    assert snapshot() == before
    assert q("SELECT to_regprocedure('public.approve_request_with_portfolio(uuid,jsonb,jsonb,uuid)') IS NULL", None) == 't'
    passed('M20: ejecutada en una transacción y revertida con ROLLBACK, la base queda idéntica')
    q(source); after = snapshot(); q(source)
    assert snapshot() == after
    passed('M20: se aplica y una segunda ejecución no cambia ninguna tabla (idempotente)')


def sub_of(rid):
    sub = q(f"SELECT coalesce(subsystem_id::text,'') FROM public.requests WHERE id={lit(rid)}", None)
    return {'subsystem_id': sub} if sub else {}


def catalog():
    return {
      'study': q("SELECT studio_id FROM public.studio_codes WHERE code='PROCONT' AND is_active", None),
      'codes': j("SELECT jsonb_object_agg(code,id) FROM public.studio_codes WHERE code IN ('PROCONT','ARAPA','DISFARMADENT','PROCONT_CUZ','PROCONT_OLICH')", None),
      'quipu': q("SELECT id FROM public.catalog_systems WHERE name='Quipu'", None),
      'fac': q("SELECT id FROM public.catalog_systems WHERE name='Quipu_Fac'", None),
      # Subproyecto activo por producto (Quipu lo exige); vacío si el producto no tiene subproyectos.
      'subs': j("SELECT coalesce(jsonb_object_agg(s.name, (SELECT x.id FROM public.catalog_subsystems x WHERE x.system_id=s.id AND x.is_active ORDER BY x.name LIMIT 1)),'{}'::jsonb) FROM public.catalog_systems s WHERE s.name IN ('Quipu','Quipu_Fac')", None),
      'types': j("SELECT jsonb_agg(id ORDER BY sort_order) FROM public.request_types WHERE is_active", None),
      'gestion': q("SELECT id FROM public.portfolios WHERE name='Gestión'", None),
      'bf': q("SELECT id FROM public.portfolio_initiatives WHERE name='Beneficiarios finales'", None),
    }


def sessions(c):
    tokens = {}
    for provider, ruc in [('quipu', '20999999901'), ('quipufac', '20999999902')]:
        # Empresa QA con RUC ficticio asignada al estudio del código PROCONT (preparación del fixture en el clúster
        # desechable; la RPC exige el RUC real del estudio y aquí no se usan RUC reales).
        q(f"INSERT INTO app_private.client_companies(ruc,explicit_studio_id) VALUES({lit(ruc)},{lit(c['study'])}) ON CONFLICT(ruc) DO UPDATE SET explicit_studio_id=excluded.explicit_studio_id", None)
        token = secrets.token_hex(32); tokens[provider] = token
        values = [provider, ruc, 'qaficticio' if provider == 'quipu' else 'company', 'username' if provider == 'quipu' else 'company',
                  'qaficticio' if provider == 'quipu' else None, f'{QA} Cliente {provider}', hashlib.sha256(token.encode()).hexdigest()]
        q('SELECT public.client_open_session('+','.join(map(lit, values))+",now()+interval '8 hours')", 'service_role')
    return tokens


def m20_checks(c, tokens):
    def client(title, provider='quipu', prio='medium'):
        payload = {'system_id': c['quipu'] if provider == 'quipu' else c['fac'], 'request_type_id': c['types'][0],
                   'title': f'{QA} {title}', 'description': 'Solicitud ficticia de QA.', 'requested_priority': prio}
        if provider == 'quipufac': payload['requester_name'] = f'{QA} Solicitante QuipuFac'
        sub = c['subs'].get('Quipu' if provider == 'quipu' else 'Quipu_Fac')
        if sub: payload['subsystem_id'] = sub
        return j('SELECT public.client_submit_request('+lit(tokens[provider])+','+data(payload)+',gen_random_uuid())', 'anon')['id']
    approve = {'project_type': 'development', 'priority': 'high', 'assigned_dev': users['developer'], 'title': f'{QA} M20 aprobada'}
    rid = client('M20 atómica')
    q('SELECT public.classify_request('+lit(rid)+','+data({'studio_code_id': c['codes']['ARAPA'], **sub_of(rid)})+')', 'authenticated', users['admin'])
    other = j("SELECT public.save_portfolio('{\"name\":\"QA-FICTICIO Operaciones\"}'::jsonb)", 'authenticated', users['admin'])['id']
    fails('SELECT public.approve_request_with_portfolio('+lit(rid)+','+data(approve)+','+data({'mode': 'portfolio', 'portfolio_id': other, 'initiative_id': c['bf']})+',gen_random_uuid())',
          '22023', 'authenticated', users['admin'])
    assert q(f"SELECT status||'|'||coalesce(project_id::text,'-') FROM public.requests WHERE id={lit(rid)}") == 'pending|-'
    passed('M20: proyecto de otro portafolio → error y la solicitud sigue pendiente, sin proyecto ni asociación parcial')
    fails('SELECT public.approve_request_with_portfolio('+lit(rid)+','+data(approve)+','+data({})+',gen_random_uuid())', '22023', 'authenticated', users['admin'])
    fails('SELECT public.approve_request_with_portfolio('+lit(rid)+','+data(approve)+','+data({'mode': 'portfolio', 'initiative_id': c['bf']})+',gen_random_uuid())', '22023', 'authenticated', users['admin'])
    fails('SELECT public.approve_request_with_portfolio('+lit(rid)+','+data(approve)+','+data({'mode': 'independent', 'portfolio_id': c['gestion']})+',gen_random_uuid())', '22023', 'authenticated', users['admin'])
    fails('SELECT public.approve_request_with_portfolio('+lit(rid)+','+data(approve)+','+data({'mode': 'independent'})+',gen_random_uuid())', '42501', 'authenticated', users['developer'])
    passed('M20: sin elección, proyecto sin portafolio, independiente con portafolio y rol developer son rechazados')
    key = '00000000-0000-4000-8000-000000020001'
    p1 = j('SELECT public.approve_request_with_portfolio('+lit(rid)+','+data(approve)+','+data({'mode': 'portfolio', 'portfolio_id': c['gestion'], 'initiative_id': c['bf']})+f',{lit(key)})', 'authenticated', users['admin'])
    p2 = j('SELECT public.approve_request_with_portfolio('+lit(rid)+','+data(approve)+','+data({'mode': 'portfolio', 'portfolio_id': c['gestion'], 'initiative_id': c['bf']})+f',{lit(key)})', 'authenticated', users['admin'])
    assert p1 == p2 and p1['portfolio_id'] == c['gestion'] and p1['initiative_id'] == c['bf']
    assert q(f"SELECT count(*) FROM public.activity_logs WHERE project_id={lit(p1['id'])} AND action='portfolio_changed'") == '1'
    assert q(f"SELECT count(*) FROM public.checklist_items i JOIN public.project_flows f ON f.id=i.project_flow_id WHERE f.project_id={lit(p1['id'])}") == '0'
    passed('M20: confirmar con Gestión → Beneficiarios finales guarda la asociación, la audita, no siembra tareas y es idempotente')
    rid2 = client('M20 independiente', 'quipufac')
    q('SELECT public.classify_request('+lit(rid2)+','+data({'studio_code_id': c['codes']['DISFARMADENT'], **sub_of(rid2)})+')', 'authenticated', users['admin'])
    p3 = j('SELECT public.approve_request_with_portfolio('+lit(rid2)+','+data(approve)+','+data({'mode': 'independent'})+',gen_random_uuid())', 'authenticated', users['admin'])
    assert p3['portfolio_id'] is None and p3['initiative_id'] is None
    assert q(f"SELECT count(*) FROM public.activity_logs WHERE project_id={lit(p3['id'])} AND action='portfolio_independent'") == '1'
    passed('M20: «Ticket independiente» no asigna portafolio y deja constancia auditada (portfolio_independent)')
    cfg = q("SELECT prosecdef::text||'|'||array_to_string(proconfig,',')||'|'||has_function_privilege('anon','public.approve_request_with_portfolio(uuid,jsonb,jsonb,uuid)','EXECUTE')::text FROM pg_proc WHERE oid='public.approve_request_with_portfolio(uuid,jsonb,jsonb,uuid)'::regprocedure", None)
    assert cfg == 'true|search_path=""|false', cfg
    passed('Seguridad: approve_request_with_portfolio es SECURITY DEFINER con search_path vacío y sin EXECUTE para anon')
    return other


def seed(c, tokens, other_portfolio):
    """Conjunto QA-FICTICIO reproducible: 23 tickets por las RPC reales."""
    cierre = j('SELECT public.save_portfolio_initiative('+data({'portfolio_id': other_portfolio, 'name': 'QA-FICTICIO Cierre mensual'})+')', 'authenticated', users['admin'])['id']
    extra = []
    for n, name in enumerate(['QA-FICTICIO Analista Uno', 'QA-FICTICIO Analista Dos']):
        uid = f'00000000-0000-4000-8000-0000000000d{n+1}'
        q(f"INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES({lit(uid)},{lit(f'analista{n+1}@simulado.invalid')},"+lit(json.dumps({'full_name': name}))+",now())", None)
        q(f'SELECT app_private.provision_auth_profile({lit(uid)})')
        q(f"UPDATE public.users SET role='developer',is_active=true WHERE id={lit(uid)}")
        extra.append(uid)
    owners = [users['developer'], users['admin'], users['superadmin'], extra[0], extra[1]]
    area = q(f"INSERT INTO public.areas(studio_id,name,code,is_active) VALUES({lit(c['study'])},'QA-FICTICIO Contabilidad','QAC',true) RETURNING id", None)
    G, BF, OP, CI = c['gestion'], c['bf'], other_portfolio, cierre

    def client(title, provider, prio):
        payload = {'system_id': c['quipu'] if provider == 'quipu' else c['fac'], 'request_type_id': c['types'][len(title) % len(c['types'])],
                   'title': f'{QA} {title}', 'description': f'{QA}: datos ficticios para validar el flujo.', 'requested_priority': prio}
        if provider == 'quipufac': payload['requester_name'] = f'{QA} Solicitante QuipuFac'
        sub = c['subs'].get('Quipu' if provider == 'quipu' else 'Quipu_Fac')
        if sub: payload['subsystem_id'] = sub
        return j('SELECT public.client_submit_request('+lit(tokens[provider])+','+data(payload)+',gen_random_uuid())', 'anon')['id']

    def approve(rid, code, prio, owner, portfolio, initiative=None, with_area=False):
        q('SELECT public.classify_request('+lit(rid)+','+data({'studio_code_id': c['codes'][code], **sub_of(rid), **({'area_id': area} if with_area else {})})+')', 'authenticated', users['admin'])
        decision = {'mode': 'independent'} if portfolio is None else {'mode': 'portfolio', 'portfolio_id': portfolio, **({'initiative_id': initiative} if initiative else {})}
        title = q(f"SELECT title FROM public.requests WHERE id={lit(rid)}", None)   # igual que el frontend: el título de la solicitud
        return j('SELECT public.approve_request_with_portfolio('+lit(rid)+','+data({'project_type': 'development', 'priority': prio, 'assigned_dev': owner, 'title': title})+','+data(decision)+',gen_random_uuid())',
                 'authenticated', users['admin'])['id']

    def internal(title, mode, prio, owner, phase=None, portfolio=None, initiative=None, code=None, with_area=False):
        p = {'mode': mode, 'title': f'{QA} {title}', 'description': f'{QA}: trabajo ficticio.', 'priority': prio, 'assigned_dev': owner}
        if phase: p['initial_phase'] = phase
        if portfolio: p['portfolio_id'] = portfolio
        if initiative: p['initiative_id'] = initiative
        if mode == 'client':
            if c['subs'].get('Quipu'): p['subsystem_id'] = c['subs']['Quipu']
            p.update({'requester_name': f'{QA} Cliente registrado por TI', 'studio_id': c['study'], 'studio_code_id': c['codes'][code], 'system_id': c['quipu'],
                      'request_type_id': c['types'][0], 'requested_priority': prio, **({'area_id': area} if with_area else {})})
        return j('SELECT public.create_internal_ticket('+data(p)+',gen_random_uuid())', 'authenticated', users['admin'])['project']['id']

    def move(pid, phase):
        flow = q(f"SELECT id FROM public.project_flows WHERE project_id={lit(pid)}")
        ticket = j('SELECT public.get_board_ticket('+lit(pid)+')', 'authenticated', users['admin'])
        extra_p = {'confirm_pending': True, 'pending_fingerprint': ticket['pending_fingerprint']} if phase == 'done' and ticket.get('pending_items') else {}
        j('SELECT public.operate_board_ticket('+lit(pid)+",'move_phase',"+data({'flow_id': flow, 'to_phase': phase, **extra_p})+',gen_random_uuid())', 'authenticated', users['admin'])

    def block(pid):
        j('SELECT public.operate_board_ticket('+lit(pid)+",'block',"+data({'reason': f'{QA}: esperando información del cliente.'})+',gen_random_uuid())', 'authenticated', users['admin'])

    def add_suggested(pid, phase, done=0, manual=False, owner=users['developer']):
        flow = q(f"SELECT id FROM public.project_flows WHERE project_id={lit(pid)}")
        tasks = j(f"SELECT jsonb_agg(description ORDER BY order_index) FROM public.checklist_templates WHERE flow_type='development' AND phase={lit(phase)}", None)
        if manual: tasks = tasks + [f'{QA} Tarea manual adicional']
        for i, t in enumerate(tasks):
            q(f"INSERT INTO public.checklist_items(project_flow_id,phase,description,order_index) VALUES({lit(flow)},{lit(phase)},{lit(t)},{i})", 'authenticated', owner)
        if done:
            q(f"UPDATE public.checklist_items SET completed=true WHERE project_flow_id={lit(flow)} AND phase={lit(phase)} AND order_index<{done}", 'authenticated', owner)

    # ── Quipu (8) ──
    client('Quipu recibida sin revisar', 'quipu', 'low')
    q2 = client('Quipu en revisión', 'quipu', 'medium'); q('SELECT public.start_request_review('+lit(q2)+')', 'authenticated', users['admin'])
    p = approve(client('Quipu consulta de beneficiarios', 'quipu', 'high'), 'PROCONT', 'high', owners[0], G, BF, with_area=True)            # Backlog, sin tareas
    p = approve(client('Quipu validación de RUC con guion', 'quipu', 'urgent'), 'ARAPA', 'urgent', owners[1], G, BF); move(p, 'analysis'); add_suggested(p, 'analysis')
    p = approve(client('Quipu reporte de compras bloqueado', 'quipu', 'medium'), 'DISFARMADENT', 'medium', owners[2], None); move(p, 'design'); block(p)
    p = approve(client('Quipu retenciones de cuarta', 'quipu', 'low'), 'PROCONT_CUZ', 'low', owners[3], OP, CI); move(p, 'dev')
    q7 = client('Quipu duplicada rechazada', 'quipu', 'medium'); q('SELECT public.classify_request('+lit(q7)+','+data({'studio_code_id': c['codes']['ARAPA'], **sub_of(q7)})+')', 'authenticated', users['admin'])
    q('SELECT public.reject_request('+lit(q7)+','+lit(f'{QA}: solicitud duplicada.')+')', 'authenticated', users['admin'])
    p = approve(client('Quipu redondeo de planilla', 'quipu', 'medium'), 'PROCONT_OLICH', 'medium', owners[4], None); move(p, 'done')
    # ── QuipuFac (6) ──
    client('QuipuFac recibida sin revisar', 'quipufac', 'high')
    p = approve(client('QuipuFac notas de crédito', 'quipufac', 'high'), 'PROCONT', 'high', owners[0], OP, with_area=True); move(p, 'code_review'); add_suggested(p, 'code_review', done=1)
    p = approve(client('QuipuFac exportación a PDF', 'quipufac', 'urgent'), 'ARAPA', 'urgent', owners[1], G, BF); move(p, 'testing')
    f4 = client('QuipuFac fuera de alcance', 'quipufac', 'low'); q('SELECT public.classify_request('+lit(f4)+','+data({'studio_code_id': c['codes']['DISFARMADENT'], **sub_of(f4)})+')', 'authenticated', users['admin'])
    q('SELECT public.reject_request('+lit(f4)+','+lit(f'{QA}: fuera del alcance del producto.')+')', 'authenticated', users['admin'])
    p = approve(client('QuipuFac despliegue de activos', 'quipufac', 'medium'), 'DISFARMADENT', 'medium', owners[2], None); move(p, 'deploy')
    f6 = client('QuipuFac en revisión', 'quipufac', 'urgent'); q('SELECT public.start_request_review('+lit(f6)+')', 'authenticated', users['admin'])
    # ── TI (9) ──
    p = internal('TI tablero de beneficiarios', 'internal', 'medium', owners[3], 'analysis', G, BF); add_suggested(p, 'analysis', done=2, manual=True)
    internal('TI certificados del servidor', 'internal', 'low', owners[4])
    p = internal('TI conciliación bancaria bloqueada', 'internal', 'high', owners[0], 'dev', OP, CI); block(p)
    p = internal('TI pruebas de permisos', 'client', 'urgent', owners[1], 'testing', G, BF, code='PROCONT', with_area=True); add_suggested(p, 'testing', done=3)
    internal('TI despliegue de módulo de activos', 'client', 'low', owners[2], 'deploy', code='PROCONT_OLICH')
    p = internal('TI manual de usuario terminado', 'internal', 'medium', owners[3], None, G); move(p, 'done')
    internal('TI nueva pantalla de empresas', 'internal', 'high', owners[4], 'design', OP)
    internal('TI revisión de validaciones', 'client', 'medium', owners[0], 'code_review', code='ARAPA')
    # Histórico: tarjeta con checklist previo sembrado automáticamente (mismo created_at que el flujo, como antes de M19).
    p = internal('Histórico con checklist previo', 'internal', 'medium', owners[1], 'analysis', G, BF)
    flow = q(f"SELECT id FROM public.project_flows WHERE project_id={lit(p)}")
    q(f"""INSERT INTO public.checklist_items(project_flow_id,phase,description,order_index,created_at)
          SELECT {lit(flow)},t.phase,t.description,t.order_index,f.created_at FROM public.checklist_templates t, public.project_flows f
          WHERE f.id={lit(flow)} AND t.flow_type='development' AND t.phase IN ('backlog','design','dev','testing','deploy','done')""", None)
    q(f"UPDATE public.checklist_items SET completed=true WHERE project_flow_id={lit(flow)} AND phase='backlog'", None)
    # Adjuntos reservados por el cliente (solo metadatos; Storage es un stub local).
    rq = q(f"SELECT id FROM public.requests WHERE title='{QA} Quipu recibida sin revisar'", None)   # pendiente: el contrato solo reserva así
    j(f"SELECT public.client_reserve_attachments({lit(tokens['quipu'])},{lit(rq)},"+data([{'upload_key': '00000000-0000-4000-8000-000000030001', 'file_name': 'qa-ficticio-captura.png', 'size_bytes': 2048, 'mime_type': 'image/png'}])+')', 'anon')
    return area, extra


def qa_checks(c, area):
    titles = j("SELECT jsonb_agg(coalesce(title, description)) FROM public.requests", None)
    assert all(QA in t for t in titles), 'todas las solicitudes llevan la marca QA-FICTICIO'
    assert q(f"SELECT count(*) FROM public.projects WHERE title NOT LIKE '{QA}%'", None) == '0', 'todos los proyectos son QA-FICTICIO'
    status = j("SELECT jsonb_object_agg(s,n) FROM (SELECT app_private.request_general_status(id) s,count(*) n FROM public.requests GROUP BY 1) x", None)
    for s in ['received', 'in_review', 'approved_backlog', 'in_progress', 'blocked', 'done', 'rejected']:
        assert status.get(s, 0) >= 1, (s, status)
    phases = set(j("SELECT jsonb_agg(DISTINCT f.current_phase) FROM public.project_flows f JOIN public.projects p ON p.id=f.project_id", None))
    assert phases >= {'backlog', 'analysis', 'design', 'dev', 'code_review', 'testing', 'deploy', 'done'}, phases
    prios = set(j("SELECT jsonb_agg(DISTINCT priority) FROM public.projects", None))
    assert prios == {'low', 'medium', 'high', 'urgent'}
    passed(f'QA: {len(titles)} solicitudes QA-FICTICIO con los 7 estados reales, las 8 fases y las 4 prioridades ({json.dumps(status, sort_keys=True)})')
    origins = j("SELECT jsonb_build_object('quipu',(SELECT count(*) FROM app_private.client_request_links WHERE provider='quipu'),'quipufac',(SELECT count(*) FROM app_private.client_request_links WHERE provider='quipufac'),'ti',(SELECT count(*) FROM public.requests r WHERE NOT EXISTS (SELECT 1 FROM app_private.client_request_links l WHERE l.request_id=r.id)))", None)
    assert origins['quipu'] >= 8 and origins['quipufac'] >= 6 and origins['ti'] >= 9, origins
    passed(f'QA: orígenes Quipu {origins["quipu"]}, QuipuFac {origins["quipufac"]} y TI {origins["ti"]}')
    areas = j("SELECT jsonb_object_agg(code,with_area) FROM (SELECT c.code, count(r.area_id) with_area FROM public.requests r JOIN public.studio_codes c ON c.id=r.studio_code_id GROUP BY c.code) x", None)
    assert areas.get('PROCONT', 0) >= 2 and all(areas.get(k, 0) == 0 for k in ['ARAPA', 'DISFARMADENT', 'PROCONT_CUZ', 'PROCONT_OLICH']), areas
    passed(f'QA: área solo con el código exacto PROCONT ({json.dumps(areas, sort_keys=True)})')
    pf = j(f"SELECT jsonb_build_object('bf',count(*) FILTER (WHERE initiative_id={lit(c['bf'])}),'other',count(*) FILTER (WHERE portfolio_id IS NOT NULL AND portfolio_id<>{lit(c['gestion'])}),'gestion_only',count(*) FILTER (WHERE portfolio_id={lit(c['gestion'])} AND initiative_id IS NULL),'independent',count(*) FILTER (WHERE portfolio_id IS NULL)) FROM public.projects", None)
    assert pf['bf'] >= 4 and pf['other'] >= 3 and pf['independent'] >= 3, pf
    assert q("SELECT count(*) FROM public.activity_logs WHERE action='portfolio_independent'", None) != '0'
    passed(f'QA: Gestión → Beneficiarios finales {pf["bf"]}, otro portafolio {pf["other"]}, independientes {pf["independent"]} (con auditoría)')
    prog = j("""SELECT jsonb_agg(jsonb_build_object('t',p.title,'persisted',(SELECT count(*) FROM public.checklist_items i WHERE i.project_flow_id=f.id),
              'persisted_done',(SELECT count(*) FROM public.checklist_items i WHERE i.project_flow_id=f.id AND i.completed),
              'same_transaction_time',(SELECT count(*) FROM public.checklist_items i WHERE i.project_flow_id=f.id AND i.created_at=f.created_at)) ORDER BY p.title)
              FROM public.projects p JOIN public.project_flows f ON f.project_id=p.id""", None)
    by = {x['t'].replace(QA+' ', ''): x for x in prog}
    assert by['Quipu consulta de beneficiarios']['persisted'] == 0
    assert (by['Quipu validación de RUC con guion']['persisted'], by['Quipu validación de RUC con guion']['persisted_done']) == (3, 0)
    assert (by['QuipuFac notas de crédito']['persisted'], by['QuipuFac notas de crédito']['persisted_done']) == (3, 1)
    assert (by['TI pruebas de permisos']['persisted'], by['TI pruebas de permisos']['persisted_done']) == (3, 3)
    assert (by['TI tablero de beneficiarios']['persisted'], by['TI tablero de beneficiarios']['persisted_done']) == (4, 2)
    assert (by['Histórico con checklist previo']['persisted'], by['Histórico con checklist previo']['same_transaction_time']) == (18, 18)
    passed('QA: sugerencias no materializadas fuera del conteo; filas históricas ambiguas preservadas y contadas como persistidas (18)')


def export(c, area, extra):
    """Exporta el conjunto con la forma de PostgREST que consume el frontend (tests/ui/qa-dataset.json)."""
    ds = {}
    ds['projects'] = j("""SELECT coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
        'requests',(SELECT to_jsonb(r) - 'description' FROM (SELECT requester_area,requester_name,request_number,request_type,studio_id,studio_code_id,area_id FROM public.requests WHERE id=p.request_id) r),
        'project_flows',(SELECT coalesce(jsonb_agg(to_jsonb(f) || jsonb_build_object('checklist_items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'completed',i.completed,'created_at',i.created_at) ORDER BY i.order_index),'[]'::jsonb) FROM public.checklist_items i WHERE i.project_flow_id=f.id))),'[]'::jsonb) FROM public.project_flows f WHERE f.project_id=p.id))
        ORDER BY p.created_at),'[]'::jsonb) FROM public.projects p WHERE p.status<>'deleted'""", None)
    ds['checklist_items'] = j("SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.order_index),'[]'::jsonb) FROM public.checklist_items i", None)
    ds['requests'] = j("""SELECT jsonb_agg(to_jsonb(r) || jsonb_build_object('projects',(SELECT jsonb_build_object('status',p.status) FROM public.projects p WHERE p.id=r.project_id)) ORDER BY r.created_at)
        FROM public.requests r""", None)
    ds['request_events'] = j("SELECT jsonb_agg(jsonb_build_object('request_id',request_id,'action',action,'created_at',created_at)) FROM public.request_events", None)
    ds['users'] = j("SELECT jsonb_agg(jsonb_build_object('id',u.id,'full_name',u.full_name,'role',u.role,'is_active',u.is_active,'email',a.email,'created_at',u.created_at) ORDER BY u.full_name) FROM public.users u JOIN auth.users a ON a.id=u.id", None)
    ds['card_colors'] = j("SELECT coalesce(jsonb_object_agg(user_id,color_id),'{}'::jsonb) FROM public.internal_card_preferences", None)
    ds['portfolios'] = j("SELECT jsonb_agg(to_jsonb(p) ORDER BY sort_order,name) FROM public.portfolios p", None)
    ds['portfolio_initiatives'] = j("SELECT jsonb_agg(to_jsonb(i) ORDER BY sort_order,name) FROM public.portfolio_initiatives i", None)
    ds['studios'] = j("SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'is_active',is_active) ORDER BY name) FROM public.studios", None)
    ds['studio_codes'] = j("SELECT jsonb_agg(jsonb_build_object('id',id,'studio_id',studio_id,'code',code,'is_active',is_active) ORDER BY code) FROM public.studio_codes", None)
    ds['areas'] = j("SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'is_active',is_active,'parent_id',parent_id,'studio_id',studio_id) ORDER BY name) FROM public.areas", None)
    ds['catalog_systems'] = j("SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'requires_subproject',requires_subproject,'sort_order',sort_order,'is_active',is_active) ORDER BY sort_order) FROM public.catalog_systems", None)
    ds['request_types'] = j("SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'sort_order',sort_order,'is_active',is_active) ORDER BY sort_order) FROM public.request_types", None)
    ds['tickets'] = j("SELECT jsonb_object_agg(p.id, app_private.request_general_status(p.request_id)) FROM public.projects p", None)
    out = ROOT/'tests/ui/qa-dataset.json'
    out.write_text(json.dumps({'_aviso': 'QA-FICTICIO: datos 100 % ficticios generados por supabase/tests/m20_qa_fixtures_local.py en PostgreSQL desechable. No son datos reales.', **ds}, indent=1, ensure_ascii=False, default=str)+'\n')
    passed(f'QA: conjunto exportado a tests/ui/qa-dataset.json ({len(ds["projects"])} proyectos, {len(ds["requests"])} solicitudes, {len(ds["users"])} usuarios)')


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
    assert len(paths) == 21 and paths[-1].name == M20 and len({p.name[:14] for p in paths}) == 21
    for path in paths[:-1]:
        q(path.read_text())
    staff()
    passed('Base: M1-M19 (20 migraciones) aplicadas en orden')
    apply_with_rollback_test(paths[-1])
    c = catalog()
    tokens = sessions(c)
    other = m20_checks(c, tokens)
    area, extra = seed(c, tokens, other)
    qa_checks(c, area)
    export(c, area, extra)
finally:
    if server and server.poll() is None:
        subprocess.run([str(args.pg_bin/'pg_ctl'), '-D', str(cluster), 'stop', '-m', 'fast', '-w', '-t', '20'],
                       env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        server.wait(timeout=5)
    shutil.rmtree(work)

out = ROOT/'docs/validation/dashboard-team-portfolio-progress-20261124/data'
out.mkdir(parents=True, exist_ok=True)
evidence = {'at_utc': datetime.now(timezone.utc).isoformat(), 'postgresql': version, 'passed': len(checks), 'checks': checks,
            'migration_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
            'socket_only': True, 'server_stopped': True, 'cluster_removed': True, 'auth_storage_stubs': True, 'remote_operations': False}
(out/'m20-qa.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False)+'\n')
print(f'{len(checks)} comprobaciones M20/QA superadas; servidor detenido y clúster eliminado.')
