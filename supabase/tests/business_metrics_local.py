#!/usr/bin/env python3
"""Only new M11 business rules; disposable PostgreSQL over a private Unix socket."""
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
MIGRATION = '20261118000700_business_metrics.sql'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
parser.add_argument('--frontend-adapter', type=Path, help='Optional read-only cross-branch adapter compatibility check')
args = parser.parse_args()
work = Path(tempfile.mkdtemp(prefix='procont-business-metrics-', dir='/tmp'))
cluster = work/'cluster'; socket = work/'socket'; socket.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-pass'), PGSERVICEFILE=str(work/'no-service'))
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq',
        '-h', str(socket), '-p', '55489', '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_metrics_owner'
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
        f'unix_socket_directories={socket}', '-c', 'wal_level=logical', '-p', '55489'], env=env, stdout=log, stderr=log)
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
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,created_at timestamptz DEFAULT now());
      ALTER TABLE storage.buckets OWNER TO {owner}; ALTER TABLE storage.objects OWNER TO {owner};
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated; GRANT SELECT,INSERT ON storage.objects TO anon,authenticated;''')
    # Setup only: install M1-M10, without invoking previous suites.
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
    old = submit(submission())
    old_before = q(f"SELECT row_to_json(r)::text FROM public.requests r WHERE id='{old['id']}'")
    events_before = q(f"SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.request_events e WHERE request_id='{old['id']}'")
    sql((ROOT/'supabase/migrations'/MIGRATION).read_text(), owner)
    assert old_before == q(f"SELECT row_to_json(r)::text FROM public.requests r WHERE id='{old['id']}'")
    assert events_before == q(f"SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.request_events e WHERE request_id='{old['id']}'")
    passed('M11 changes no existing request, timestamp or historical event')

    for name in [None, '', '    ', '\n\t\r', '\u00a0\u2009', '\u200b\ufeff', 123]:
        result = sql(f"SELECT public.submit_client_request({payload(submission(name))},gen_random_uuid())", 'anon', ok=False)
        assert result.returncode and '22023' in result.stderr, repr(name)+result.stderr
    missing = submission(); missing.pop('requester_name')
    result = sql(f"SELECT public.submit_client_request({payload(missing)},gen_random_uuid())", 'anon', ok=False)
    assert result.returncode and '22023' in result.stderr
    passed('public RPC rejects missing, blank, Unicode-whitespace and non-string names')
    legacy_payload = {'requester_name':'\t\n','requester_area':'Synthetic area','request_type':'Synthetic',
                      'origin':'Interno','description':'Synthetic legacy entry'}
    denied('legacy creation routine cannot bypass nonblank name guard',
           f"SELECT public.submit_request({payload(legacy_payload)},gen_random_uuid())", owner, code='22023')
    raw = '  ÁLVARO\t Pérez  '
    valid = submit(submission(raw, urgent=True))
    # JSON preserves leading/trailing whitespace and proves the stored value is untouched.
    assert j(f"SELECT to_json(requester_name) FROM public.requests WHERE id='{valid['id']}'", owner, None) == raw
    assert q(f"SELECT app_private.normalize_requester_name({lit(raw)})") == 'álvaro pérez'
    assert q("SELECT app_private.normalize_requester_name('ＡＮＡ  pérez')") == 'ana pérez'
    assert q("SELECT app_private.normalize_requester_name('José') = app_private.normalize_requester_name('Jose')") == 'f'
    passed('display name preserved verbatim; NFKC/case/whitespace comparison keeps accents distinct')
    denied('anon cannot query ticket metrics', 'SELECT public.get_ticket_performance()', 'anon')
    denied('anon cannot query summaries', 'SELECT public.get_ticket_performance_summary()', 'anon')
    denied('anon cannot query requester statistics', 'SELECT public.get_requester_urgency_month()', 'anon')
    denied('inactive profile cannot query metrics', 'SELECT public.get_ticket_performance()', 'authenticated', I)
    denied('authenticated without profile cannot query metrics', 'SELECT public.get_ticket_performance()', 'authenticated', N)
    denied('viewer cannot query requester statistics', 'SELECT public.get_requester_urgency_month()', 'authenticated', V)
    denied('developer cannot query requester statistics', 'SELECT public.get_requester_urgency_month()', 'authenticated', D)
    denied('authenticated cannot bypass RPC through private helper', 'SELECT * FROM app_private.ticket_performance(NULL)', 'authenticated', A)
    for actor in (S,A,D,V): assert j('SELECT public.get_ticket_performance_summary()', actor=actor)['avg_cycle_time_seconds'] is None
    passed('all four active internal roles may read performance; absent samples are null')
    assert j("SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]') FROM public.get_ticket_performance() m", actor=V)[0]['metric_status'] == 'not_completed'
    assert j(f"SELECT public.get_ticket_performance_summary('{studios[2]}')")['total_tickets'] == 0
    passed('unfinished tickets and empty study return no fabricated timing samples')

    def classify(receipt, studio):
        code = codes[studios.index(studio)]
        sql(f"SELECT public.classify_request('{receipt['id']}',{payload({'studio_code_id':code})})", 'authenticated', A)
    def approve(receipt, studio=None, board='dual', priority='high'):
        classify(receipt, studio or studios[0])
        return j(f"SELECT public.approve_request('{receipt['id']}',{payload({'project_type':board,'priority':priority})},gen_random_uuid())")['id']
    project = approve(valid)
    assert q(f"SELECT priority||'|'||(sla_target_date IS NULL)||'|'||(due_date IS NULL) FROM public.projects WHERE id='{project}'") == 'high|true|true'
    passed('urgent request may be approved High, without generating SLA/delivery dates')
    sql(f"UPDATE public.requests SET created_at='2026-10-01 10:00Z' WHERE id='{valid['id']}'", owner)
    def change(receipt, statement, timestamp=None):
        before = q(f"SELECT coalesce(max(id),0) FROM public.request_events WHERE request_id='{receipt['id']}'")
        sql(statement, 'authenticated', A)
        if timestamp:
            sql(f"UPDATE public.request_events SET created_at='{timestamp}' WHERE request_id='{receipt['id']}' AND id>{before}", owner)
    def phase(receipt, pid, ft, ph, timestamp=None):
        change(receipt, f"UPDATE public.project_flows SET current_phase='{ph}' WHERE project_id='{pid}' AND flow_type='{ft}'", timestamp)
    def metric(receipt):
        return next(row for row in j("SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]') FROM public.get_ticket_performance() m") if row['request_id']==receipt['id'])
    phase(valid, project, 'development', 'design', '2026-10-02 10:00Z')
    change(valid, f"UPDATE public.projects SET is_blocked=true,blocked_reason='Synthetic wait' WHERE id='{project}'", '2026-10-02 12:00Z')
    phase(valid, project, 'development', 'backlog', '2026-10-03 10:00Z')
    phase(valid, project, 'administrative', 'ready_to_start', '2026-10-04 10:00Z')
    phase(valid, project, 'development', 'done', '2026-10-05 10:00Z')
    assert metric(valid)['cycle_time_seconds'] is None
    passed('one finished flow does not finish a dual ticket or enter averages')
    phase(valid, project, 'administrative', 'deployed', '2026-10-06 10:00Z')
    m = metric(valid)
    assert m['metric_status']=='complete' and m['cycle_time_seconds']==4*86400 and m['lead_time_seconds']==5*86400, m
    passed('cycle starts at first Backlog exit; regression/blocking count; dual work counted once')
    change(valid, f"UPDATE public.projects SET is_blocked=false WHERE id='{project}'", '2026-10-06 11:00Z')
    assert metric(valid)['cycle_time_seconds']==4*86400
    phase(valid, project, 'administrative', 'backlog', '2026-10-07 10:00Z')
    assert metric(valid)['completed_at'] is None and metric(valid)['lead_time_seconds'] is None
    passed('reopened work is excluded from completed averages')
    phase(valid, project, 'administrative', 'deployed', '2026-10-08 10:00Z')
    assert metric(valid)['cycle_time_seconds']==6*86400 and metric(valid)['lead_time_seconds']==7*86400
    summary = j(f"SELECT public.get_ticket_performance_summary('{studios[0]}')")
    assert summary['completed_tickets']==1 and summary['cycle_sample_size']==1 and summary['avg_cycle_time_seconds']==6*86400
    passed('recompletion keeps first start and latest completion without duplicate samples')

    no_start = submit(submission('No recorded start'))
    p2 = approve(no_start, board='development')
    sql(f"UPDATE public.requests SET created_at='2026-10-01 10:00Z' WHERE id='{no_start['id']}'", owner)
    change(no_start, f"UPDATE public.projects SET status='completed' WHERE id='{p2}'", '2026-10-05 10:00Z')
    m = metric(no_start)
    assert m['metric_status']=='missing_start' and m['cycle_time_seconds'] is None and m['lead_time_seconds']==4*86400
    passed('explicit completion without first phase exit yields Lead only, never invented Cycle')
    sql(f"UPDATE public.request_events SET details=details||'{{\"cause\":\"baseline\"}}'::jsonb WHERE request_id='{no_start['id']}' AND action='status_changed' AND details->>'to'='done'", owner)
    m = metric(no_start)
    assert m['metric_status']=='missing_completion' and m['lead_time_seconds'] is None
    passed('historical baseline done does not invent a completion timestamp')
    sql(f"UPDATE public.request_events SET created_at='2026-09-01 10:00Z' WHERE request_id='{valid['id']}' AND action='phase_changed' AND details->>'from'='backlog'", owner)
    assert metric(valid)['metric_status']=='invalid_timeline' and metric(valid)['cycle_time_seconds'] is None
    passed('inconsistent historical timeline yields null instead of clamping to a false zero')

    monthly = [
      (' Ana\t PÉREZ ',studios[0],True,'2026-02-01 05:00Z','pending'),
      ('ana pérez',studios[0],False,'2026-03-01 04:59:59Z','approved'),
      ('ＡＮＡ pérez',studios[0],True,'2026-02-15 12:00Z','rejected'),
      ('ana pérez',studios[1],True,'2026-02-10 12:00Z','pending'),
      ('ana pérez',studios[0],True,'2026-02-01 04:59:59Z','pending'),
      ('ana pérez',studios[0],True,'2026-03-01 05:00Z','pending'),
    ]
    monthly_receipts = []
    for name, studio, urgent, at, state in monthly:
        receipt = submit(submission(name, studio, urgent))
        monthly_receipts.append(receipt)
        if state == 'approved': approve(receipt, studio, board='development', priority='urgent')
        elif state == 'rejected':
            classify(receipt, studio)
            sql(f"SELECT public.reject_request('{receipt['id']}','Synthetic rejection')", 'authenticated', A)
        sql(f"UPDATE public.requests SET created_at='{at}' WHERE id='{receipt['id']}'", owner)
    sql("INSERT INTO public.requests(requester_name,request_type,description,created_at) VALUES('Legacy unknown study','Synthetic','Synthetic','2026-02-10 12:00Z')", owner)
    stats = j("SELECT public.get_requester_urgency_month('2026-02-18')")
    assert stats['total_requests']==5 and stats['urgent_requests']==3 and stats['urgent_percentage']==60 and stats['unattributed_requests']==1, stats
    assert len(stats['requesters'])==2
    ga = next(g for g in stats['requesters'] if g['studio_id']==studios[0])
    gb = next(g for g in stats['requesters'] if g['studio_id']==studios[1])
    assert (ga['total_requests'],ga['urgent_requests'],ga['urgent_percentage'])==(3,2,66.67)
    assert (gb['total_requests'],gb['urgent_requests'],gb['urgent_percentage'])==(1,1,100)
    passed('monthly requester identity merges normalized aliases, separates canonical studies')
    passed('monthly urgency includes rejected/pending/approved independently of final priority')
    passed('Lima midnight month boundaries are inclusive/exclusive and missing study is not merged')
    same = j("SET TIME ZONE 'Pacific/Auckland'; SELECT public.get_requester_urgency_month('2026-02-18')")
    assert same==stats and stats['timezone']=='America/Lima' and stats['month']=='2026-02-01'
    filtered = j(f"SELECT public.get_requester_urgency_month('2026-02-01','{studios[1]}')", actor=S)
    assert filtered['total_requests']==1
    empty = j("SELECT public.get_requester_urgency_month('2030-01-01')")
    assert empty['total_requests']==0 and empty['urgent_percentage'] is None and empty['requesters']==[]
    passed('monthly result independent of session timezone; admin/superadmin filters and empty month work')

    # Concurrency test with real DB transactions, no mocks: two siblings finish together.
    concurrent = submit(submission('Concurrent phases'))
    pc = approve(concurrent)
    phase(concurrent, pc, 'development', 'design')
    phase(concurrent, pc, 'administrative', 'ready_to_start')
    tx1 = f"SET ROLE authenticated; SET request.jwt.claim.sub='{A}'; BEGIN; UPDATE public.project_flows SET current_phase='done' WHERE project_id='{pc}' AND flow_type='development'; SELECT pg_sleep(0.5); COMMIT;"
    tx2 = f"SET ROLE authenticated; SET request.jwt.claim.sub='{A}'; BEGIN; UPDATE public.project_flows SET current_phase='deployed' WHERE project_id='{pc}' AND flow_type='administrative'; COMMIT;"
    first = subprocess.Popen(base, env=env, text=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    first.stdin.write(tx1); first.stdin.close(); first.stdin=None
    time.sleep(.15)
    second = subprocess.Popen(base, env=env, text=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out2, err2 = second.communicate(tx2, timeout=10)
    out1, err1 = first.communicate(timeout=10)
    assert first.returncode==0 and second.returncode==0, err1+err2
    mc = metric(concurrent)
    assert mc['metric_status']=='complete' and mc['cycle_time_seconds']>0, mc
    assert q(f"SELECT count(*) FROM public.request_events WHERE request_id='{concurrent['id']}' AND action='status_changed' AND details->>'to'='done'")=='1'
    passed('concurrent sibling completions serialize and produce one reliable done sample')
    before = q(f"SELECT count(*) FROM public.request_events WHERE request_id='{concurrent['id']}'")
    phase(concurrent, pc, 'administrative', 'deployed')
    assert q(f"SELECT count(*) FROM public.request_events WHERE request_id='{concurrent['id']}'")==before
    passed('repeated identical final phase does not duplicate completion or timing')
    track = j(f"SELECT public.track_request_status('{concurrent['request_number']}')", 'anon', None)
    assert set(track)=={'request_number','status'} and track['status']=='done'
    passed('public tracking remains status-only without requester names, metrics or statistics')
    assert q(f"SELECT priority FROM public.projects WHERE id='{project}'")=='high'
    for rpc in ["metrics_monthly_urgency('2026-02')", f"metrics_requester_urgency('{monthly_receipts[0]['id']}','2026-02')", 'metrics_time_averages()']:
        denied('anon denied frontend RPC '+rpc.split('(')[0], 'SELECT public.'+rpc, 'anon')
    denied('developer denied frontend monthly identities', "SELECT public.metrics_monthly_urgency('2026-02')", 'authenticated', D)
    denied('viewer denied frontend requester identity', f"SELECT public.metrics_requester_urgency('{monthly_receipts[0]['id']}','2026-02')", 'authenticated', V)
    monthly_ui = j("SELECT public.metrics_monthly_urgency('2026-02')")
    requester_ui = j(f"SELECT public.metrics_requester_urgency('{monthly_receipts[0]['id']}','2026-02')")
    assert len(monthly_ui)==2 and requester_ui['total_requests']==3 and requester_ui['urgent_pct']==66.67
    assert requester_ui['month']=='2026-02' and requester_ui['studio_name']=='Synthetic study A'
    assert requester_ui['requester_name']==monthly[0][0]
    assert j("SELECT public.metrics_monthly_urgency('2030-01')")==[]
    assert j(f"SELECT public.metrics_requester_urgency('{old['id']}','2030-01')")['urgent_pct'] is None
    unknown = q("SELECT id FROM public.requests WHERE requester_name='Legacy unknown study'")
    assert q(f"SELECT public.metrics_requester_urgency('{unknown}','2026-02')", 'authenticated', A)==''
    passed('Claude monthly/requester contracts match canonical identities, preserve display names and handle missing identity')
    averages_ui = j(f"SELECT public.metrics_time_averages(1,'{studios[0]}')", actor=V)
    assert averages_ui['completed_count']==1 and averages_ui['cycle_sample_size']==1
    assert abs(averages_ui['avg_cycle_time_days']-mc['cycle_time_seconds']/86400)<1e-9
    assert j(f"SELECT public.metrics_time_averages(NULL,'{studios[2]}')")['avg_cycle_time_days'] is None
    denied('nonpositive reporting period rejected', 'SELECT public.metrics_time_averages(0)', 'authenticated', A, '22023')
    denied('malformed reporting month rejected', "SELECT public.metrics_monthly_urgency('2026-13')", 'authenticated', A, '22023')
    passed('Claude time contract filters by completion date/study and returns fractional days/null without SLA')
    if args.frontend_adapter:
        script = """import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const adapter = await import(pathToFileURL(process.argv[1]).href);
const data = JSON.parse(readFileSync(0,'utf8'));
assert.ok(data.monthly.every(adapter.isUrgencyRow));
assert.ok(adapter.isUrgencyRow(data.requester));
assert.ok(adapter.isTimeAverages(data.averages));
"""
        subprocess.run(['node','--input-type=module','-e',script,str(args.frontend_adapter.resolve())],
            input=json.dumps({'monthly':monthly_ui,'requester':requester_ui,'averages':averages_ui}), text=True,check=True)
        passed('actual read-only Claude adapter validators accept live local RPC responses')
    version = q('SHOW server_version', None)
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'), '-D', str(cluster), 'stop', '-m', 'fast', '-w', '-t', '20'], env=env,
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        server.wait(timeout=5); log.close()
evidence = {'at_utc':datetime.now(timezone.utc).isoformat(), 'postgresql':version, 'migration':MIGRATION,
    'migration_sha256':hashlib.sha256((ROOT/'supabase/migrations'/MIGRATION).read_bytes()).hexdigest(),
    'frontend_adapter_validated':bool(args.frontend_adapter), 'passed':len(checks), 'checks':checks, 'socket_only':True, 'server_stopped':True, 'synthetic_auth_stub_only':True,
    'storage_stub_only':True, 'real_accounts_created':0, 'remote_sql_executed':False, 'previous_suites_repeated':False}
(ROOT/'docs/validation/business-metrics-local.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} new checks passed; isolated PostgreSQL stopped.')
