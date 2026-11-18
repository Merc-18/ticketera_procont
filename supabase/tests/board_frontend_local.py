#!/usr/bin/env python3
"""Frontend board flows (Claude) against M1-M12 on disposable PostgreSQL. Synthetic data only."""
import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = '20261118000800_board_operations.sql'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
args = parser.parse_args()
work = Path(tempfile.mkdtemp(prefix='procont-board-frontend-', dir='/tmp'))
cluster = work/'cluster'; socket = work/'socket'; socket.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-pass'), PGSERVICEFILE=str(work/'no-service'))
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq',
        '-h', str(socket), '-p', '55491', '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_board_fe_owner'
S, A, D, V, I, N = [f'00000000-0000-4000-8000-{i:012}' for i in range(1, 7)]
checks = []; server = None

def sql(text, role=None, actor=None, ok=True):
    prefix = (f'SET ROLE {role};\n' if role else '') + (f"SET request.jwt.claim.sub='{actor}';\n" if actor else '')
    result = subprocess.run(base, input=prefix+text, env=env, text=True, capture_output=True)
    if ok and result.returncode: raise RuntimeError(result.stderr)
    return result

def q(text, role=owner, actor=None): return sql(text, role, actor).stdout.strip()
def j(text, role='authenticated', actor=A): return json.loads(q(text, role, actor))
def lit(value): return "'" + str(value).replace("'", "''") + "'"
def payload(value): return lit(json.dumps(value, ensure_ascii=False))+'::jsonb'
def passed(name): checks.append(name); print('PASS '+name, flush=True)
def denied(name, text, role, actor=None, code='42501'):
    result = sql(text, role, actor, ok=False)
    assert result.returncode and code in result.stderr, name+': '+result.stderr
    passed(name)

try:
    subprocess.run([str(args.pg_bin/'initdb'), '-D', str(cluster), '-A', 'trust', '--locale=C.UTF-8', '-E', 'UTF8'], env=env,
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    log = (work/'server.log').open('w')
    server = subprocess.Popen([str(args.pg_bin/'postgres'), '-D', str(cluster), '-c', 'listen_addresses=', '-c',
        f'unix_socket_directories={socket}', '-c', 'wal_level=logical', '-p', '55491'], env=env, stdout=log, stderr=log)
    for _ in range(100):
        if sql('SELECT 1', ok=False).returncode == 0: break
        if server.poll() is not None: raise RuntimeError('Isolated PostgreSQL exited')
        time.sleep(.05)
    else: raise RuntimeError('Isolated PostgreSQL unavailable')
    assert Path(q("SELECT current_setting('data_directory')", None)).resolve() == cluster
    assert q("SELECT current_setting('listen_addresses')", None) == ''
    sql(f'CREATE ROLE {owner} NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; ALTER DATABASE postgres OWNER TO {owner};')
    sql((ROOT/'supabase/tests/support/auth_stub.sql').read_text())
    sql(f'ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz; GRANT USAGE ON SCHEMA auth TO {owner}; GRANT SELECT(id,email,raw_user_meta_data,email_confirmed_at),REFERENCES(id) ON auth.users TO {owner}; ALTER PUBLICATION supabase_realtime OWNER TO {owner};')
    sql(f'''CREATE SCHEMA storage AUTHORIZATION {owner};
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,created_at timestamptz DEFAULT now(),metadata jsonb DEFAULT '{{}}'::jsonb);
      ALTER TABLE storage.buckets OWNER TO {owner}; ALTER TABLE storage.objects OWNER TO {owner};
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated; GRANT SELECT,INSERT ON storage.objects TO anon,authenticated;''')
    # Setup only: M1-M12 applied in order; no previous suite is invoked.
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if path.name <= MIGRATION: sql(path.read_text(), owner)
    for identity in (S, A, D, V, I):
        sql(f"INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES('{identity}','fixture-{identity[-1]}@example.invalid','{{\"full_name\":\"Synthetic fixture\"}}',now())")
        sql(f"SELECT app_private.{'bootstrap_superadmin' if identity == S else 'provision_auth_profile'}('{identity}')", owner)
    for identity, role, active in [(A,'admin',True),(D,'developer',True),(V,'viewer',True),(I,'admin',False)]:
        sql(f"UPDATE public.users SET role='{role}',is_active={str(active).lower()} WHERE id='{identity}'", owner)
    studios = [q(f"INSERT INTO public.studios(name) VALUES('Synthetic study {n}') RETURNING id") for n in ('A','B','Empty')]
    codes = [q(f"INSERT INTO public.studio_codes(studio_id,code) VALUES('{st}','FIXTURE_{n}') RETURNING id") for n, st in enumerate(studios)]
    system = q("SELECT id FROM public.catalog_systems WHERE name='Otros'")
    typ = q("SELECT id FROM public.request_types WHERE name='Mejora'")
    def submission(name='Synthetic Person', studio=None, urgent=False):
        return {'requester_name': name, 'studio_id': studio or studios[0], 'system_id': system, 'request_type_id': typ,
                'title': 'Synthetic ticket', 'description': 'Only fictitious test data', 'urgent_requested': urgent}
    def submit(data): return j(f"SELECT public.submit_client_request({payload(data)},gen_random_uuid())", 'anon', None)
    def approve(receipt, board='development'):
        sql(f"SELECT public.classify_request('{receipt['id']}',{payload({'studio_code_id':codes[0]})})", 'authenticated', A)
        return j(f"SELECT public.approve_request('{receipt['id']}',{payload({'project_type':board,'assigned_dev':A,'assigned_admin':A})},gen_random_uuid())")['id']
    def command(pid, action, data=None, actor=A, ok=True):
        return sql(f"SELECT public.operate_board_ticket('{pid}',{lit(action)},{payload(data or {})},gen_random_uuid())", 'authenticated', actor, ok)
    def cmd(pid, action, data=None, actor=A): return json.loads(command(pid, action, data, actor).stdout)
    def reject(name, pid, action, data, actor, code):
        r = command(pid, action, data, actor, ok=False); assert r.returncode and code in r.stderr, name+r.stderr; passed(name)
    def snap(pid, actor=A): return j(f"SELECT public.get_board_ticket('{pid}')", actor=actor)
    def events(pid, kind):
        return j(f"SELECT coalesce(jsonb_agg(details ORDER BY id),'[]') FROM public.request_events WHERE request_id=(SELECT request_id FROM public.projects WHERE id='{pid}') AND action={lit(kind)}", owner, None)

    # 1. Payload exacto de operations.createInternalProject (NewProjectModal) por un developer.
    create = {'title':'Ticket ficticio FE','description':'Solo datos de prueba','project_type':'development','priority':'medium',
              'start_date':None,'due_date':None,'sla_target_date':None,'area':None,'requester_name':None,'assigned_dev':D}
    pid = j(f"SELECT public.create_internal_project({payload(create)},gen_random_uuid())", actor=D)['id']
    s = snap(pid, D); f = s['flows'][0]['id']
    assert s['workflow_version']==2 and s['flows'][0]['phase']=='backlog' and s['flows'][0]['assignee_id']==D and s['general_status']=='approved_backlog'
    passed('NewProjectModal payload: Development, Backlog, principal assignee, no SLA')

    # 2. Payload exacto de operations.approveRequest (RequestValidationModal).
    receipt = submit(submission('Solicitante ficticio FE'))
    sql(f"SELECT public.classify_request('{receipt['id']}',{payload({'studio_code_id':codes[0]})})", 'authenticated', A)
    approval = {'project_type':'development','priority':'high','title':'Aprobado ficticio','start_date':None,'due_date':None,
                'sla_target_date':None,'sla_formal_days':None,'assigned_dev':D,'assigned_admin':None}
    approved = j(f"SELECT public.approve_request('{receipt['id']}',{payload(approval)},gen_random_uuid())")['id']
    sa = snap(approved)
    assert len(sa['flows'])==1 and sa['flows'][0]['assignee_id']==D and sa['priority']=='high'
    passed('RequestValidationModal payload: one Development flow, assigned_admin null accepted')

    # 3. Edición descriptiva directa (useProjects.updateProject) sigue permitida; columnas protegidas no.
    sql(f"UPDATE public.projects SET title='Editado ficticio',description='Desc',start_date=NULL,due_date='2026-12-31',updated_at=now() WHERE id='{pid}'", 'authenticated', D)
    assert q(f"SELECT title FROM public.projects WHERE id='{pid}'")=='Editado ficticio'
    passed('descriptive edit (title/description/dates) still allowed for editors')
    denied('old direct priority/status write path is rejected', f"UPDATE public.projects SET priority='urgent',status='completed' WHERE id='{pid}'", 'authenticated', D)
    denied('old direct phase/progress write path is rejected', f"UPDATE public.project_flows SET current_phase='done',progress=100 WHERE id='{f}'", 'authenticated', D)
    denied('browser cannot append activity_logs', f"INSERT INTO public.activity_logs(project_id,action,details) VALUES('{pid}','comment_added','{{}}')", 'authenticated', D)

    # 4. Arrastres con saltos de fase y estado general Trabajo en proceso.
    cmd(pid, 'move_phase', {'flow_id':f,'to_phase':'design'}, D)
    assert snap(pid, D)['general_status']=='in_progress'
    cmd(pid, 'move_phase', {'flow_id':f,'to_phase':'analysis'}, D)
    cmd(pid, 'move_phase', {'flow_id':f,'to_phase':'testing'}, D)
    s = snap(pid, D)
    assert s['flows'][0]['phase']=='testing' and s['flows'][0]['phase_index']==5 and s['flows'][0]['phase_count']==8
    passed('phase skips/regressions via drag; in_progress after leaving Backlog')

    # 5. Checklist (ChecklistSection) y progreso separado calculado por el servidor.
    items = [q(f"INSERT INTO public.checklist_items(project_flow_id,phase,description,order_index) VALUES('{f}','testing','Tarea ficticia {n}',{n}) RETURNING id", 'authenticated', D).splitlines()[-1] for n in range(3)]
    sql(f"UPDATE public.checklist_items SET completed=true WHERE id='{items[0]}'", 'authenticated', D)
    s = snap(pid, D)['flows'][0]
    total, completed = map(int, q(f"SELECT count(*), count(*) FILTER (WHERE completed) FROM public.checklist_items WHERE project_flow_id='{f}'").split('|'))
    assert total >= 3 and (s['checklist_total'], s['checklist_completed']) == (total, completed)
    assert float(s['checklist_progress_percent']) == round(100 * completed / total, 2)
    assert float(s['phase_progress_percent']) == 71.43
    passed('phase progress and checklist progress are separate server values')

    # 6. Bloqueo: motivo obligatorio; sin cambio de fase; checklist/comentarios/mención permitidos; reasignación solo admin.
    reject('block without reason rejected', pid, 'block', {'reason':'  '}, D, '22023')
    s = cmd(pid, 'block', {'reason':'Espera de insumo ficticio'}, D)
    assert s['is_blocked'] and s['general_status']=='blocked' and s['flows'][0]['phase']=='testing'
    reject('blocked ticket cannot change phase', pid, 'move_phase', {'flow_id':f,'to_phase':'deploy'}, D, '23514')
    reject('blocked ticket cannot finish', pid, 'move_phase', {'flow_id':f,'to_phase':'done','confirm_pending':True,'pending_fingerprint':s['pending_fingerprint']}, D, '23514')
    sql(f"UPDATE public.checklist_items SET completed=true WHERE id='{items[1]}'", 'authenticated', D)
    sql(f"INSERT INTO public.comments(project_id,content) VALUES('{pid}','Comentario ficticio durante bloqueo')", 'authenticated', D)
    sql(f"INSERT INTO public.notifications(user_id,type,title,message,project_id) VALUES('{A}','mention','Te mencionaron en un comentario','Ficticio','{pid}')", 'authenticated', D)
    passed('while blocked: checklist, comments and mention notifications still allowed')
    reject('developer cannot reassign blocked ticket', pid, 'assign', {'flow_id':f,'assignee_id':S}, D, '42501')
    cmd(pid, 'assign', {'flow_id':f,'assignee_id':S}, A)
    ev = events(pid, 'reassigned')[-1]
    assert ev['previous_assignee']==D and ev['new_assignee']==S and ev['actor_role']=='admin'
    passed('admin reassignment while blocked audited with previous/new assignee and actor')
    s = cmd(pid, 'unblock', {}, D)
    assert not s['is_blocked'] and s['general_status']=='in_progress' and s['flows'][0]['phase']=='testing'
    assert events(pid, 'unblocked')[-1]['reason']=='Espera de insumo ficticio'
    passed('unblock restores phase-derived status and keeps the previous reason in audit')

    # 7. Done con checklist pendiente: sin confirmación falla; con confirmación y huella se registra.
    s = snap(pid, D)
    assert len(s['pending_items']) >= 1 and any(i['description']=='Tarea ficticia 2' for i in s['pending_items'])
    reject('Done with pending checklist requires explicit confirmation', pid, 'move_phase', {'flow_id':f,'to_phase':'done'}, D, '23514')
    s = cmd(pid, 'move_phase', {'flow_id':f,'to_phase':'done','confirm_pending':True,'pending_fingerprint':s['pending_fingerprint']}, D)
    assert s['general_status']=='done' and s['project_status']=='completed'
    done = events(pid, 'completed')[-1]
    assert done['pending_confirmed'] is True and any(i['description']=='Tarea ficticia 2' for i in done['pending_items'])
    passed('confirmed Done records pending items, actor and fingerprint')
    reject('finished ticket cannot be dragged without reopening', pid, 'move_phase', {'flow_id':f,'to_phase':'testing'}, D, '23514')

    # 8. Reapertura con motivo y fase de retorno.
    reject('reopen without reason rejected', pid, 'reopen', {'flow_id':f,'to_phase':'testing','reason':''}, D, '22023')
    reject('reopen to Done rejected', pid, 'reopen', {'flow_id':f,'to_phase':'done','reason':'Ficticio'}, D, '22023')
    s = cmd(pid, 'reopen', {'flow_id':f,'to_phase':'code_review','reason':'Falla ficticia en revisión'}, D)
    assert s['general_status']=='in_progress' and s['project_status']=='active' and s['flows'][0]['phase']=='code_review'
    ro = events(pid, 'reopened')[-1]
    assert ro['reason']=='Falla ficticia en revisión' and ro['from_phase']=='done' and ro['to_phase']=='code_review' and ro['previous_completion_event_id']
    passed('reopen with reason returns to chosen phase and links previous completion')

    # 9. Acciones masivas y permisos.
    bulk = j(f"SELECT public.operate_board_tickets(ARRAY['{pid}','{approved}']::uuid[],'set_priority',{payload({'priority':'urgent'})},gen_random_uuid())", actor=D)
    assert len(bulk)==2 and all(t['priority']=='urgent' for t in bulk) and len(events(pid,'bulk_updated'))==1
    passed('bulk priority: single transaction with per-ticket audit')
    denied('viewer cannot run bulk operations', f"SELECT public.operate_board_tickets(ARRAY['{pid}']::uuid[],'archive','{{}}'::jsonb,gen_random_uuid())", 'authenticated', V)
    denied('viewer cannot run ticket commands', f"SELECT public.operate_board_ticket('{pid}','block',{payload({'reason':'x'})},gen_random_uuid())", 'authenticated', V)
    assert snap(pid, V)['project_id']==pid
    passed('viewer can read the board snapshot')
    bulk = j(f"SELECT public.operate_board_tickets(ARRAY['{pid}','{approved}']::uuid[],'archive','{{}}'::jsonb,gen_random_uuid())", actor=D)
    assert all(t['project_status']=='archived' for t in bulk)
    s = cmd(pid, 'restore', {}, D)
    assert s['project_status']=='active'
    passed('bulk archive and restore through the contract')
    version = q('SHOW server_version', None)
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5);log.close()
evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'migration':MIGRATION,
 'migration_sha256':hashlib.sha256((ROOT/'supabase/migrations'/MIGRATION).read_bytes()).hexdigest(),
 'passed':len(checks),'checks':checks,'socket_only':True,'server_stopped':True,'synthetic_auth_stub_only':True,
 'storage_stub_only':True,'real_accounts_created':0,'remote_sql_executed':False,'previous_suites_repeated':False,'scope':'frontend board flows (Claude)'}
(ROOT/'docs/validation/board-frontend-local.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} frontend board checks passed; isolated PostgreSQL stopped.')
