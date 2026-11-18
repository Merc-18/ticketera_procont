#!/usr/bin/env python3
"""Only new M12 board rules; disposable PostgreSQL over a private Unix socket."""
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
work = Path(tempfile.mkdtemp(prefix='procont-board-operations-', dir='/tmp'))
cluster = work/'cluster'; socket = work/'socket'; socket.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-pass'), PGSERVICEFILE=str(work/'no-service'))
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq',
        '-h', str(socket), '-p', '55490', '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_board_owner'
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
        f'unix_socket_directories={socket}', '-c', 'wal_level=logical', '-p', '55490'], env=env, stdout=log, stderr=log)
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
    # Setup only: M1-M11, no previous suite is invoked.
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if path.name < MIGRATION: sql(path.read_text(), owner)
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
    legacy_receipt=submit(submission('Legacy synthetic'))
    legacy=approve(legacy_receipt,'dual')
    legacy_flows=json.loads(q(f"SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.project_flows f WHERE project_id='{legacy}'"))
    historical={}
    for table in ['requests','projects','project_flows','checklist_items','activity_logs','request_events']:
        historical[table]=q(f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.{table} t")
    sql((ROOT/'supabase/migrations'/MIGRATION).read_text(),owner)
    for table,value in historical.items():
        expression="to_jsonb(t)-'workflow_version'" if table=='projects' else 'to_jsonb(t)'
        assert q(f"SELECT coalesce(jsonb_agg({expression} ORDER BY id),'[]'::jsonb) FROM public.{table} t")==value, table
    assert q(f"SELECT workflow_version IS NULL FROM public.projects WHERE id='{legacy}'")=='t'
    passed('M12 performs no backfill: existing requests/projects/flows/checklists/audit are unchanged')
    def command(pid, action, data=None, actor=A, key=None, ok=True):
        return sql(f"SELECT public.operate_board_ticket('{pid}',{lit(action)},{payload(data or {})},{lit(key)+'::uuid' if key else 'gen_random_uuid()'})", 'authenticated', actor, ok)
    def cmd(pid,action,data=None,actor=A,key=None): return json.loads(command(pid,action,data,actor,key).stdout)
    def snapshot(pid,actor=A): return j(f"SELECT public.get_board_ticket('{pid}')",actor=actor)
    def reject_command(name,pid,action,data=None,actor=A,code='23514',key=None):
        result=command(pid,action,data,actor,key=key,ok=False)
        assert result.returncode and code in result.stderr, name+result.stderr
        passed(name)
    def events(pid,kind):
        return j(f"SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]') FROM public.request_events e WHERE request_id=(SELECT request_id FROM public.projects WHERE id='{pid}') AND action={lit(kind)}",owner,None)
    for board in ['administrative','dual']:
        receipt=submit(submission())
        sql(f"SELECT public.classify_request('{receipt['id']}',{payload({'studio_code_id':codes[0]})})",'authenticated',A)
        denied('new approval rejects '+board,f"SELECT public.approve_request('{receipt['id']}',{payload({'project_type':board,'assigned_dev':A})},gen_random_uuid())",'authenticated',A,'22023')
    create={'title':'Synthetic internal','description':'Only isolated fixture','project_type':'administrative','assigned_dev':A}
    denied('internal creation also rejects Administrative',f"SELECT public.create_internal_project({payload(create)},gen_random_uuid())",'authenticated',A,'22023')
    denied('new ticket requires one explicit principal assignee',f"SELECT public.create_internal_project({payload({'title':'Synthetic','description':'Fixture','project_type':'development'})},gen_random_uuid())",'authenticated',A,'22023')
    receipt=submit(submission('New board synthetic'))
    pid=approve(receipt)
    s=snapshot(pid)
    assert s['workflow_version']==2 and len(s['flows'])==1 and s['flows'][0]['phase']=='backlog' and s['flows'][0]['assignee_id']==A
    assert s['flows'][0]['phase_progress_percent']==0
    assert q(f"SELECT due_date IS NULL AND sla_target_date IS NULL FROM public.projects WHERE id='{pid}'")=='t'
    passed('new ticket has only Development, Backlog, one principal and no generated deadlines')
    assert events(pid,'priority_changed')[0]['details']['from'] is None and events(pid,'priority_changed')[0]['details']['to']=='medium'
    passed('initial priority decision is captured in server audit as well as subsequent changes')
    internal=j(f"SELECT public.create_internal_project({payload({'title':'Synthetic internal','description':'Fixture','assigned_dev':D})},gen_random_uuid())")
    assert snapshot(internal['id'])['workflow_version']==2 and snapshot(internal['id'])['flows'][0]['assignee_id']==D
    passed('internal creation defaults to Development with its explicit principal')
    for role,actor in [('anon',None),('authenticated',V),('authenticated',I),('authenticated',N)]:
        denied('unauthorized board command '+str(actor),f"SELECT public.operate_board_ticket('{pid}','move_phase','{{\"to_phase\":\"analysis\"}}',gen_random_uuid())",role,actor)
    assert snapshot(pid,V)['project_id']==pid
    passed('active viewer reads board snapshot but cannot mutate')
    for query in [f"UPDATE public.project_flows SET current_phase='done' WHERE project_id='{pid}'",
                  f"UPDATE public.project_flows SET progress=99 WHERE project_id='{pid}'",
                  f"UPDATE public.project_flows SET assigned_to='{D}' WHERE project_id='{pid}'",
                  f"UPDATE public.projects SET status='completed' WHERE id='{pid}'",
                  f"UPDATE public.projects SET priority='urgent' WHERE id='{pid}'",
                  f"UPDATE public.projects SET is_blocked=true WHERE id='{pid}'"]:
        denied('direct alternate write denied: '+query.split(' SET ')[1].split(' WHERE ')[0],query,'authenticated',A)
    denied('forged GUC does not authorize a completion',f"SET app_private.board_action='complete'; UPDATE public.projects SET status='completed' WHERE id='{pid}'",'authenticated',A)
    denied('private context cannot be forged',f"INSERT INTO app_private.board_command_context VALUES(pg_backend_pid(),txid_current(),'{pid}','{A}',gen_random_uuid(),'move_phase',false)",'authenticated',A)
    denied('private command helper cannot bypass public authorization',f"SELECT app_private.board_apply('{pid}','move_phase','{{\"to_phase\":\"done\"}}',gen_random_uuid())",'authenticated',A)
    denied('historical type mutation cannot delete flows',f"SELECT public.change_project_type('{legacy}','development')",'authenticated',A,'0A000')
    assert q(f"SELECT count(*) FROM public.project_flows WHERE project_id='{legacy}'")=='2'
    passed('historical Dual flows and their tasks are preserved')
    reject_command('historical Dual operations require explicit flow selection',legacy,'move_phase',{'to_phase':'design'},code='22023')
    legacy_development=next(f['id'] for f in legacy_flows if f['flow_type']=='development')
    legacy_admin=next(f['id'] for f in legacy_flows if f['flow_type']=='administrative')
    legacy_task_count=q(f"SELECT count(*) FROM public.checklist_items WHERE project_flow_id IN ('{legacy_development}','{legacy_admin}')")
    cmd(legacy,'move_phase',{'flow_id':legacy_development,'to_phase':'done'})
    assert snapshot(legacy)['general_status']=='in_progress'
    old=snapshot(legacy)
    cmd(legacy,'move_phase',{'flow_id':legacy_admin,'to_phase':'deployed','confirm_pending':True,'pending_fingerprint':old['pending_fingerprint']})
    assert snapshot(legacy)['project_status']=='completed'
    cmd(legacy,'reopen',{'flow_id':legacy_admin,'to_phase':'discovery','reason':'Synthetic legacy reopening'})
    assert snapshot(legacy)['project_status']=='active' and snapshot(legacy)['workflow_version'] is None
    assert len(snapshot(legacy)['flows'])==2 and len(events(legacy,'completed'))==1
    assert q(f"SELECT count(*) FROM public.checklist_items WHERE project_flow_id IN ('{legacy_development}','{legacy_admin}')")==legacy_task_count
    passed('historical Dual completes/reopens explicitly without deleting flows/tasks or rewriting prior closure')

    flow=s['flows'][0]['id']
    for phase in ['analysis','design','dev','code_review','testing','deploy']:
        result=cmd(pid,'move_phase',{'to_phase':phase},D)
        assert result['flows'][0]['phase']==phase and result['general_status']=='in_progress'
    assert len(events(pid,'phase_changed'))==6
    passed('all eight Development stages accepted; every effective transition is server-audited')
    old_check=snapshot(pid)['flows'][0]['checklist_progress_percent']
    cmd(pid,'move_phase',{'to_phase':'backlog'})
    assert snapshot(pid)['general_status']=='approved_backlog' and snapshot(pid)['flows'][0]['checklist_progress_percent']==old_check
    cmd(pid,'move_phase',{'to_phase':'code_review'})
    assert len(events(pid,'phase_changed'))==8
    passed('stage skips and regression to Backlog retain history without overwriting checklist progress')
    task=q(f"SELECT id FROM public.checklist_items WHERE project_flow_id='{flow}' ORDER BY id LIMIT 1")
    phase_progress=snapshot(pid)['flows'][0]['phase_progress_percent']
    sql(f"UPDATE public.checklist_items SET completed=true WHERE id='{task}'",'authenticated',D)
    now=snapshot(pid)['flows'][0]
    assert now['phase_progress_percent']==phase_progress and now['checklist_completed']==1
    assert now['checklist_progress_percent']>0
    assert events(pid,'checklist_updated')[-1]['actor_id']==D
    passed('checklist percentage is server-derived and independent; completion edit is immutable-audited')
    denied('checklist completion timestamp cannot be forged',f"UPDATE public.checklist_items SET completed_at='2000-01-01' WHERE id='{task}'",'authenticated',D)
    new_task=q(f"INSERT INTO public.checklist_items(project_flow_id,phase,description) VALUES('{flow}','analysis','Synthetic extra') RETURNING id",'authenticated',D)
    sql(f"DELETE FROM public.checklist_items WHERE id='{new_task}'",'authenticated',D)
    assert events(pid,'checklist_added') and events(pid,'checklist_deleted')[-1]['details']['previous']['id']==new_task
    passed('checklist insert/delete are recorded with full previous/new item snapshots')

    reject_command('blank server blocking reason rejected',pid,'block',{'reason':' \t\n '},code='22023')
    cmd(pid,'block',{'reason':'Synthetic external dependency'},D)
    blocked=snapshot(pid)
    assert blocked['general_status']=='blocked' and blocked['flows'][0]['phase']=='code_review'
    reject_command('blocked ticket cannot move',pid,'move_phase',{'to_phase':'testing'},D)
    reject_command('blocked ticket cannot finish even with confirmation',pid,'move_phase',{'to_phase':'done','confirm_pending':True,'pending_fingerprint':blocked['pending_fingerprint']},A)
    reject_command('developer cannot reassign blocked ticket',pid,'assign',{'assignee_id':D},D,'42501')
    cmd(pid,'assign',{'assignee_id':D},S)
    assert snapshot(pid)['flows'][0]['assignee_id']==D
    sql(f"UPDATE public.checklist_items SET completed=false WHERE id='{task}'",'authenticated',D)
    sql(f"INSERT INTO public.comments(project_id,content) VALUES('{pid}','Synthetic blocked comment')",'authenticated',D)
    passed('blocked work retains phase, allows administrator reassignment/checklist/comments')
    upload_key='55555555-0000-4000-8000-000000000001'
    reservation=j(f"SELECT public.reserve_board_evidence('{pid}','{upload_key}','fixture.txt',20,'text/plain')",actor=D)
    upload=f"INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('request-attachments',{lit(reservation['path'])},'{{\"size\":20,\"mimetype\":\"text/plain\"}}'::jsonb)"
    denied('anonymous cannot use an internal upload capability',upload,'anon')
    denied('different internal actor cannot use the reservation',upload,'authenticated',A)
    # Simulate Storage probe + privileged final metadata write in one transaction.
    sql(f"""BEGIN;
      INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('request-attachments',{lit(reservation['path'])},'{{\"mimetype\":\"text/plain\"}}'::jsonb);
      RESET ROLE; SET ROLE {owner}; SET request.jwt.claim.sub='';
      UPDATE storage.objects SET metadata='{{\"size\":20,\"mimetype\":\"text/plain\"}}'::jsonb WHERE name={lit(reservation['path'])}; COMMIT;""",'authenticated',D)
    assert len(events(pid,'evidence_uploaded'))==1
    assert events(pid,'evidence_uploaded')[-1]['actor_id']==D
    denied('viewer cannot reserve operational evidence',f"SELECT public.reserve_board_evidence('{pid}',gen_random_uuid(),'fixture.txt',10,'text/plain')",'authenticated',V)
    denied('public tracking upload stays closed after approval',f"SELECT public.reserve_request_attachment('{receipt['id']}','{receipt['tracking_token']}',gen_random_uuid(),'public.txt',10,'text/plain')",'anon',None)
    denied('internal evidence shares the existing byte budget',f"SELECT public.reserve_board_evidence('{pid}',gen_random_uuid(),'large.txt',2500000,'text/plain')",'authenticated',D,'23514')
    passed('blocked ticket accepts authenticated private evidence with real size checks, actor binding and shared limits')
    cmd(pid,'unblock',{},D)
    assert snapshot(pid)['general_status']=='in_progress'
    assert events(pid,'unblocked')[-1]['details']['reason']=='Synthetic external dependency'
    passed('unblock restores phase-derived public state and keeps the original reason permanently')

    stale=snapshot(pid)
    reject_command('pending checklist cannot finish without explicit confirmation',pid,'move_phase',{'to_phase':'done'})
    reject_command('confirmation alone cannot acknowledge an unseen pending list',pid,'move_phase',{'to_phase':'done','confirm_pending':True})
    another=q(f"INSERT INTO public.checklist_items(project_flow_id,phase,description) VALUES('{flow}','code_review','Synthetic changed pending list') RETURNING id",'authenticated',D)
    reject_command('stale pending fingerprint is rejected',pid,'move_phase',{'to_phase':'done','confirm_pending':True,'pending_fingerprint':stale['pending_fingerprint']})
    current=snapshot(pid)
    closed=cmd(pid,'move_phase',{'to_phase':'done','confirm_pending':True,'pending_fingerprint':current['pending_fingerprint']},D)
    assert closed['project_status']=='completed' and closed['general_status']=='done' and closed['flows'][0]['phase']=='done'
    completion=events(pid,'completed')[-1]
    assert completion['actor_id']==D and completion['details']['pending_confirmed'] is True
    assert completion['details']['pending_items']==current['pending_items']
    perf=j(f"SELECT to_jsonb(m) FROM public.get_ticket_performance() m WHERE project_id='{pid}'")
    assert perf['metric_status']=='complete' and perf['lead_time_seconds']>=perf['cycle_time_seconds']>=0
    first_start=perf['first_started_at']
    passed('Done synchronizes project/public state, exact pending decision, completion and continuous metrics')
    n=len(events(pid,'completed'))
    reject_command('finished project cannot use ordinary movement as reopening',pid,'move_phase',{'to_phase':'design'})
    reject_command('reopening needs a nonblank reason',pid,'reopen',{'to_phase':'analysis','reason':'  '},code='22023')
    reject_command('reopening cannot target Done',pid,'reopen',{'to_phase':'done','reason':'Synthetic'},code='22023')
    reopened=cmd(pid,'reopen',{'to_phase':'analysis','reason':'Synthetic additional review'},D)
    assert reopened['project_status']=='active' and reopened['general_status']=='in_progress'
    assert len(events(pid,'completed'))==n and events(pid,'reopened')[-1]['details']['from_phase']=='done'
    assert events(pid,'reopened')[-1]['actor_id']==D
    perf=j(f"SELECT to_jsonb(m) FROM public.get_ticket_performance() m WHERE project_id='{pid}'")
    assert perf['first_started_at']==first_start and perf['completed_at'] is None
    current=snapshot(pid)
    cmd(pid,'move_phase',{'to_phase':'done','confirm_pending':True,'pending_fingerprint':current['pending_fingerprint']})
    assert len(events(pid,'completed'))==n+1
    perf=j(f"SELECT to_jsonb(m) FROM public.get_ticket_performance() m WHERE project_id='{pid}'")
    assert perf['first_started_at']==first_start and perf['metric_status']=='complete'
    passed('controlled reopen/recomplete retains original start and all prior completion events')
    # Reopen to Backlog and skip straight to Done with all checklist tasks completed.
    cmd(pid,'reopen',{'to_phase':'backlog','reason':'Synthetic reset'},S)
    sql(f"UPDATE public.checklist_items SET completed=true WHERE project_flow_id='{flow}'",'authenticated',A)
    assert snapshot(pid)['flows'][0]['phase_progress_percent']==0 and snapshot(pid)['flows'][0]['checklist_progress_percent']==100
    cmd(pid,'move_phase',{'to_phase':'done'})
    assert events(pid,'completed')[-1]['details']['pending_confirmed'] is False
    passed('100 percent checklist never moves phase; clean checklist closes without override')

    cmd(pid,'assign',{'assignee_id':None},D)
    cmd(pid,'assign',{'assignee_id':A},D)
    assert events(pid,'unassigned')[-1]['details']['previous_assignee']==D
    assert events(pid,'assigned')[-1]['details']['new_assignee']==A
    cmd(pid,'archive')
    assert snapshot(pid)['project_status']=='archived' and events(pid,'reassigned')
    assert cmd(pid,'restore')['project_status']=='completed'
    reject_command('restoring archived Done does not bypass explicit reopening',pid,'move_phase',{'to_phase':'analysis'})
    passed('assignment/removal history survives archive; restoring finished work does not reopen it')
    key='99999999-0000-4000-8000-000000000001'
    cmd(pid,'set_priority',{'priority':'urgent'},key=key)
    before=len(events(pid,'priority_changed'))
    cmd(pid,'set_priority',{'priority':'urgent'},key=key)
    assert len(events(pid,'priority_changed'))==before
    reject_command('idempotency key cannot be reused for different mutation',pid,'set_priority',{'priority':'low'},key=key,code='22023')
    passed('idempotent retry does not duplicate assignment/priority/audit writes')

    # Bulk is one transaction; using a historical ticket also proves no conversion/deletion.
    response=j(f"SELECT public.operate_board_tickets(ARRAY['{pid}','{legacy}']::uuid[],'set_priority','{{\"priority\":\"high\"}}',gen_random_uuid())")
    assert len(response)==2 and len(events(pid,'bulk_updated'))==1 and len(events(legacy,'bulk_updated'))==1
    missing='aaaaaaaa-0000-4000-8000-000000000099'
    denied('bulk missing ticket rolls back every selected mutation',f"SELECT public.operate_board_tickets(ARRAY['{pid}','{missing}']::uuid[],'set_priority','{{\"priority\":\"low\"}}',gen_random_uuid())",'authenticated',A,'22023')
    assert snapshot(pid)['priority']=='high'
    passed('bulk action writes per-ticket immutable audit with a shared command ID')
    for table in ['request_events','activity_logs']:
        denied('application cannot append arbitrary '+table,f"INSERT INTO public.{table} DEFAULT VALUES",'authenticated',S)
        denied('application superadmin cannot delete '+table,f'DELETE FROM public.{table}','authenticated',S)
        denied('owner normal SQL cannot edit immutable '+table,f'UPDATE public.{table} SET created_at=now()',owner,code='23514')
    denied('audit cannot be truncated by normal SQL','TRUNCATE public.request_events',owner,code='23514')
    denied('project cascade purge is blocked',f"DELETE FROM public.projects WHERE id='{pid}'",owner,code='23514')
    denied('flow/checklist cascade destruction is blocked',f"DELETE FROM public.project_flows WHERE project_id='{legacy}'",owner,code='23514')
    denied('legacy purge RPC is closed',f"SELECT public.purge_project('{pid}')",'authenticated',S,'0A000')
    cmd(internal['id'],'assign',{'assignee_id':None})
    denied('deleting an audit actor cannot null immutable actor history',f"DELETE FROM public.users WHERE id='{D}'",owner,code='23503')
    # The RPC must wait for an in-flight checklist edit and reject its stale confirmation.
    cmd(pid,'reopen',{'to_phase':'analysis','reason':'Synthetic concurrent validation'})
    old_snapshot=snapshot(pid)
    tx=f"SET ROLE authenticated; SET request.jwt.claim.sub='{D}'; BEGIN; UPDATE public.checklist_items SET completed=false WHERE id='{task}'; SELECT pg_sleep(0.4); COMMIT;"
    writer=subprocess.Popen(base,env=env,text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    writer.stdin.write(tx);writer.stdin.close();writer.stdin=None
    time.sleep(.1)
    result=command(pid,'move_phase',{'to_phase':'done','confirm_pending':True,'pending_fingerprint':old_snapshot['pending_fingerprint']},ok=False)
    _,writer_error=writer.communicate(timeout=10)
    assert writer.returncode==0,writer_error
    assert result.returncode and '23514' in result.stderr
    assert snapshot(pid)['flows'][0]['phase']=='analysis'
    passed('concurrent checklist mutation serializes against closing; stale confirmation cannot win')
    sql(f"UPDATE public.checklist_items SET completed=true WHERE id='{task}'",'authenticated',D)
    # Simultaneous retries with the same key return the same committed result once.
    concurrent_key='99999999-0000-4000-8000-000000000002'
    statement=f"SET ROLE authenticated; SET request.jwt.claim.sub='{A}'; SELECT public.operate_board_ticket('{pid}','move_phase','{{\"to_phase\":\"done\"}}','{concurrent_key}');"
    processes=[subprocess.Popen(base,env=env,text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE) for _ in range(2)]
    for process in processes:process.stdin.write(statement);process.stdin.close();process.stdin=None
    responses=[process.communicate(timeout=10) for process in processes]
    assert all(process.returncode==0 for process in processes),responses
    assert json.loads(responses[0][0])==json.loads(responses[1][0])
    assert len([e for e in events(pid,'completed') if e['details'].get('command_id')==concurrent_key])==1
    passed('concurrent identical command retries emit exactly one completion')
    # Four reservations contend for the three remaining slots of the same approved ticket.
    workers=[]
    for _ in range(4):
        worker=subprocess.Popen(base,env=env,text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        text=f"SET ROLE authenticated; SET request.jwt.claim.sub='{D}'; SELECT public.reserve_board_evidence('{pid}',gen_random_uuid(),'concurrent.txt',1,'text/plain');"
        worker.stdin.write(text);worker.stdin.close();worker.stdin=None;workers.append(worker)
    results=[worker.communicate(timeout=10) for worker in workers]
    assert sum(worker.returncode==0 for worker in workers)==3,results
    assert q(f"SELECT count(*) FROM app_private.request_attachment_grants WHERE request_id='{receipt['id']}'")=='4'
    passed('concurrent internal evidence reservations retain four-file combined quota')
    # Targeted compatibility check because M12 extends the shared attachment guard.
    public_receipt=submit(submission('Synthetic public attachment compatibility'))
    grant=j(f"SELECT public.reserve_request_attachment('{public_receipt['id']}','{public_receipt['tracking_token']}',gen_random_uuid(),'public.txt',5,'text/plain')",'anon',None)
    sql(f"INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('request-attachments',{lit(grant['path'])},'{{\"size\":5,\"mimetype\":\"text/plain\"}}'::jsonb)",'anon')
    passed('existing pending public token upload still works under its original window')
    assert q('SELECT count(*) FROM app_private.board_command_context')=='0'
    track=j(f"SELECT public.track_request_status('{receipt['request_number']}')",'anon',None)
    assert track=={'request_number':receipt['request_number'],'status':'done'}
    passed('public tracking remains minimal; command context is cleared; no personal audit data leaks')
    version=q('SHOW server_version',None)
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5);log.close()
evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'migration':MIGRATION,
 'migration_sha256':hashlib.sha256((ROOT/'supabase/migrations'/MIGRATION).read_bytes()).hexdigest(),
 'passed':len(checks),'checks':checks,'socket_only':True,'server_stopped':True,'synthetic_auth_stub_only':True,
 'storage_stub_only':True,'real_accounts_created':0,'remote_sql_executed':False,'previous_suites_repeated':False}
(ROOT/'docs/validation/board-operations-local.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} new checks passed; isolated PostgreSQL stopped.')
