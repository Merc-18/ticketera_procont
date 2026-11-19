#!/usr/bin/env python3
"""M15 regression suite: disposable PostgreSQL, real SQL roles, synthetic fixtures.

No remote arguments, credentials, TCP listener, provider calls, or previous suites.
Auth UID and Storage schemas are local stubs; PostgreSQL executes the real migrations.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import getpass
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
M15 = '20261119000300_security_request_creation.sql'
GUARD = ("  -- Check authorization before validation or idempotent replay.\n"
         "  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);\n")
INTERNAL = ['submit_request', 'submit_classified_request']
SIGNATURES = ['public.submit_client_request(jsonb,uuid)',
              'public.submit_request(jsonb,uuid)',
              'public.submit_classified_request(jsonb,jsonb,uuid)']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
parser.add_argument('--baseline-migrations', type=int, choices=[13, 14], default=14,
                    help='13 models the audited remote schema; 14 also includes pending throttle SQL locally')
args = parser.parse_args()
work = Path(tempfile.mkdtemp(prefix='procont-security-m15-', dir='/tmp'))
cluster, socket = work/'cluster', work/'socket'
socket.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-pass'),
           PGSERVICEFILE=str(work/'no-service'))
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1',
        '-v', 'VERBOSITY=verbose', '-Atq', '-h', str(socket), '-p', '55515',
        '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_security_owner'
checks, server = [], None
S, A, D, V, I, N = [f'00000000-0000-4000-8000-{n:012d}' for n in range(151, 157)]


def lit(value):
    return 'NULL' if value is None else "'"+str(value).replace("'", "''")+"'"


def data(value):
    return lit(json.dumps(value, ensure_ascii=False))+'::jsonb'


def sql(text, role=owner, actor=None):
    assert role in [None, owner, 'anon', 'authenticated', 'service_role']
    prefix = (f'SET ROLE {role};\n' if role else '')
    prefix += f'SET request.jwt.claim.sub={lit(actor or "")};\n'
    return subprocess.run(base, input=prefix+text, env=env, text=True, capture_output=True)


def q(text, role=owner, actor=None):
    result = sql(text, role, actor)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def j(text, role=owner, actor=None):
    return json.loads(q(text, role, actor))


def denied(text, role='anon', actor=None, code='42501', message=None):
    result = sql(text, role, actor)
    assert result.returncode and code in result.stderr, 'Expected denial: '+code
    if message:
        assert message in result.stderr, 'Wrong denial stage: '+message


def passed(name):
    checks.append(name)
    print('PASS '+name, flush=True)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def internal(name, payload, key, classification=None):
    values = [data(payload)]
    if name == 'submit_classified_request':
        values.append(data(classification or {'studio_id':study, 'system_id':other}))
    return f'SELECT public.{name}('+','.join(values+[lit(key)+'::uuid'])+')'


def rows():
    tables = j("SELECT jsonb_agg(format('%I.%I',n.nspname,c.relname) ORDER BY 1) "
               "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
               "WHERE c.relkind='r' AND n.nspname IN('public','app_private','auth','storage')", None)
    return {table: q("SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),"
                     "'[]'::jsonb)::text) FROM "+table+' t', None) for table in tables}


def functions():
    return j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object("
             "'body',p.prosrc,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,"
             "'config',p.proconfig,'acl',p.proacl::text)) "
             "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
             "WHERE n.nspname IN('public','app_private')")


def session(provider='quipu', subject='FixtureUser', platform=False):
    token = secrets.token_hex(32)
    subject_source, username = 'username', subject
    if provider == 'quipufac':
        subject, subject_source, username = 'company', 'company', None
    values = ','.join(lit(v) for v in [provider, '20000000015', subject, subject_source,
                                      username, 'Synthetic verified name', digest(token)])
    if platform:
        q(f"SELECT public.client_issue_entry_code({values},now()+interval '1 minute')", 'service_role')
        code_hash = digest(token)
        token = secrets.token_hex(32)
        q(f'SELECT public.client_exchange_entry_code({lit(provider)},{lit(code_hash)},'
          f"{lit(digest(token))},now()+interval '8 hours')", 'service_role')
    else:
        q(f"SELECT public.client_open_session({values},now()+interval '8 hours')", 'service_role')
    return token


def submit(token, payload, key=None):
    return ('SELECT public.client_submit_request('+lit(token)+','+data(payload)+','+
            lit(key or str(uuid.uuid4()))+'::uuid)')


try:
    subprocess.run([str(args.pg_bin/'initdb'), '-D', str(cluster), '-A', 'trust',
                    '--locale=C.UTF-8', '-E', 'UTF8'], env=env, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    with (work/'server.log').open('w') as log:
        server = subprocess.Popen([str(args.pg_bin/'postgres'), '-D', str(cluster),
          '-c', 'listen_addresses=', '-c', f'unix_socket_directories={socket}',
          '-c', 'wal_level=logical', '-p', '55515'], env=env, stdout=log, stderr=log)
    for _ in range(100):
        if sql('SELECT 1', None).returncode == 0:
            break
        if server.poll() is not None:
            raise RuntimeError('Isolated PostgreSQL exited')
        time.sleep(.05)
    else:
        raise RuntimeError('Isolated PostgreSQL unavailable')
    assert Path(q('SHOW data_directory', None)).resolve() == cluster
    assert q('SHOW listen_addresses', None) == ''
    version = q('SHOW server_version', None)
    q(f'CREATE ROLE {owner} NOLOGIN; CREATE ROLE anon NOLOGIN; '
      'CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; '
      f'ALTER DATABASE postgres OWNER TO {owner};', None)
    q((ROOT/'supabase/tests/support/auth_stub.sql').read_text(), None)
    q(f'ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz; '
      f'GRANT USAGE ON SCHEMA auth TO {owner}; '
      f'GRANT SELECT(id,email,raw_user_meta_data,email_confirmed_at),REFERENCES(id) ON auth.users TO {owner}; '
      f'ALTER PUBLICATION supabase_realtime OWNER TO {owner};', None)
    q(f'''CREATE SCHEMA storage AUTHORIZATION {owner};
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,created_at timestamptz DEFAULT now(),metadata jsonb DEFAULT '{{}}'::jsonb);
      ALTER TABLE storage.buckets OWNER TO {owner}; ALTER TABLE storage.objects OWNER TO {owner};
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated;
      GRANT SELECT,INSERT ON storage.objects TO anon,authenticated;''', None)
    # Later migrations must not change this historical M15 regression baseline.
    paths = [p for p in sorted((ROOT/'supabase/migrations').glob('*.sql')) if p.name <= M15]
    assert len(paths) == 15 and paths[-1].name == M15
    baseline = paths[:args.baseline_migrations]
    for path in baseline:
        q(path.read_text())
    passed(f'isolated Unix-socket PostgreSQL applies M1-M{args.baseline_migrations} as fixture setup')

    for actor in [S, A, D, V, I, N]:
        q(f"INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) "
          f"VALUES({lit(actor)},{lit('fixture-'+actor[-3:]+'@example.invalid')},"
          "'{\"full_name\":\"Synthetic M15 fixture\"}',now())", None)
        if actor != N:
            helper = 'bootstrap_superadmin' if actor == S else 'provision_auth_profile'
            q(f'SELECT app_private.{helper}({lit(actor)})')
    # N has an Auth account and no application profile; I has an inactive admin profile.
    assert q(f'SELECT count(*) FROM public.users WHERE id={lit(N)}') == '0'
    for actor, role, active in [(A,'admin',True), (D,'developer',True), (V,'viewer',True), (I,'admin',False)]:
        q(f'UPDATE public.users SET role={lit(role)},is_active={str(active).lower()} WHERE id={lit(actor)}')
    study = q("INSERT INTO public.studios(name,ruc) VALUES('Synthetic M15 study','20000000015') RETURNING id")
    quipu = q("SELECT id FROM public.catalog_systems WHERE name='Quipu'")
    fac = q("SELECT id FROM public.catalog_systems WHERE name='Quipu_Fac'")
    other = q("SELECT id FROM public.catalog_systems WHERE name='Otros'")
    typ = q("SELECT id FROM public.request_types WHERE name='Mejora'")
    planner = {'requester_name':'Synthetic Planner creator','requester_email':None,
      'requester_area':'Synthetic area','request_type':'Otro','origin':'Interno',
      'data_system_involved':'','description':'Synthetic Planner row','observations':'Bucket: Fixture',
      'request_date':'2026-11-19','requested_date':None,'needs_code':False}
    classified = {k:v for k,v in planner.items() if k != 'requester_area'}
    payloads = dict(zip(INTERNAL, [planner, classified]))
    payload = {'requester_name':'Synthetic customer','system_id':quipu,'request_type_id':typ,
      'title':'Synthetic M15 request','description':'Isolated fixture only','urgent_requested':False}
    legacy_payload = payload | {'studio_id':study}
    legacy = j(f'SELECT public.submit_client_request({data(legacy_payload)},gen_random_uuid())', 'anon')
    cached = {}
    for name in INTERNAL:
        for actor in [S, A, D, V, I]:
            idem = str(uuid.uuid4())
            cached[name,actor] = (idem, j(internal(name, payloads[name], idem), 'authenticated', actor))
    # A missing profile already hits an audit FK on insertion, not an authorization check.
    # Viewer/inactive profiles do satisfy that FK and reproduce the actual bypass.
    for name in INTERNAL:
        denied(internal(name,payloads[name],str(uuid.uuid4())), 'authenticated', N, code='23503')
    passed('baseline reproduces anonymous/viewer/inactive creation; missing profile fails at audit FK')

    # Model inherited PUBLIC execution as well as the actual explicit role grants.
    for signature in SIGNATURES:
        q(f'GRANT EXECUTE ON FUNCTION {signature} TO PUBLIC')
        assert q(f"SELECT has_function_privilege('anon',{lit(signature)},'EXECUTE')") == 't'
    token_q, token_f = session(), session('quipufac')
    row_snapshot, fn_snapshot = rows(), functions()
    q(paths[-1].read_text())
    assert rows() == row_snapshot
    passed('M15 preserves every row in all application, Auth and Storage fixture tables')
    after_functions = functions()
    assert after_functions.keys() == fn_snapshot.keys()
    for signature, old in fn_snapshot.items():
        new = after_functions[signature]
        if signature not in [s.removeprefix('public.') for s in SIGNATURES]:
            assert new == old, signature
        else:
            assert {k:v for k,v in new.items() if k not in ['body','acl']} == {
                   k:v for k,v in old.items() if k not in ['body','acl']}
            assert new['body'].replace(GUARD, '') == old['body']
    passed('only intended ACLs and two authorization guards change; M13 bodies/owners remain intact')

    grants = {}
    for signature in SIGNATURES:
        grants[signature] = {role: q(f'SELECT has_function_privilege({lit(role)},{lit(signature)},'
                                      "'EXECUTE')") == 't' for role in ['anon','authenticated','service_role',owner]}
        expected = {'anon':False, 'authenticated':signature != SIGNATURES[0],
                    'service_role':False, owner:True}
        assert grants[signature] == expected, signature
        assert q("SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL "
          "aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a "
          f"WHERE p.oid={lit(signature)}::regprocedure AND a.grantee=0 "
          "AND a.privilege_type='EXECUTE'") == '0'
    passed('effective EXECUTE permissions exclude PUBLIC inheritance and all prohibited direct callers')
    for role, actor in [('anon',None), ('authenticated',None), ('authenticated',N),
                        ('authenticated',S), ('authenticated',A), ('authenticated',D), ('service_role',None)]:
        denied(f'SELECT public.submit_client_request({data(legacy_payload)},gen_random_uuid())', role, actor)
    passed('legacy client creation is denied even to native authenticated editors and service_role')

    before_denials = rows()
    for name in INTERNAL:
        denied(internal(name, payloads[name], str(uuid.uuid4())))
        denied(internal(name, payloads[name], str(uuid.uuid4())), 'service_role')
        for actor in [None, V, I, N]:
            idem = cached[name,actor][0] if (name,actor) in cached else str(uuid.uuid4())
            for body in [payloads[name], {}]:
                denied(internal(name, body, idem), 'authenticated', actor,
                       message='Active authorized profile required')
    assert rows() == before_denials
    passed('missing/inactive/viewer profiles fail before validation or replay, with no data changes')
    for name in INTERNAL:
        for actor in [S, A, D]:
            idem, receipt = cached[name,actor]
            assert j(internal(name, payloads[name], idem), 'authenticated', actor) == receipt
            new_key = str(uuid.uuid4())
            new = j(internal(name, payloads[name], new_key), 'authenticated', actor)
            assert new == j(internal(name, payloads[name], new_key), 'authenticated', actor)
            assert set(new) == {'id','request_number','tracking_token'}
            assert q(f"SELECT status FROM public.requests WHERE id={lit(new['id'])}") == 'pending'
        passed(name+': active superadmin/admin/developer preserve existing receipts, creation and retry')
    # A legitimate old receipt becomes inaccessible immediately after role deactivation/demotion.
    for update in ["is_active=false", "is_active=true,role='viewer'"]:
        q(f'UPDATE public.users SET {update} WHERE id={lit(D)}')
        for name in INTERNAL:
            denied(internal(name, payloads[name], cached[name,D][0]), 'authenticated', D,
                   message='Active authorized profile required')
    q(f"UPDATE public.users SET is_active=true,role='developer' WHERE id={lit(D)}")
    passed('deactivation or demotion blocks reuse of a previously authorized idempotent receipt')

    receipts = []
    for token, product, provider in [(token_q,quipu,'quipu'), (token_f,fac,'quipufac')]:
        body, idem = payload | {'system_id':product}, str(uuid.uuid4())
        receipt = j(submit(token, body, idem), 'anon')
        assert set(receipt) == {'id','request_number','tracking_token'}
        assert receipt == j(submit(token, body, idem), 'anon')
        assert receipt == j(submit(token, body, idem), 'authenticated', A)
        link = j("SELECT jsonb_build_object('provider',l.provider,'context',l.entry_context,"
          "'study',r.studio_id,'product',r.system_id,'status',r.status) "
          f"FROM app_private.client_request_links l JOIN public.requests r ON r.id=l.request_id WHERE r.id={lit(receipt['id'])}")
        assert link == {'provider':provider,'context':'direct','study':study,'product':product,'status':'pending'}
        receipts.append((token,body,idem,receipt))
        passed(provider+': M13 creates through the revoked helper with unchanged receipt, identity and study')
    platform_q, platform_f = session(platform=True), session('quipufac',platform=True)
    active = int(q('SELECT count(*) FROM public.catalog_systems WHERE is_active'))
    def products(token):
        return [x['id'] for x in j(f'SELECT public.client_products({lit(token)})','anon')]
    assert len(products(token_q)) == active
    assert len(products(token_f)) == active-1 and quipu not in products(token_f)
    assert products(platform_q) == [quipu] and products(platform_f) == [fac]
    before_denials = rows()
    for token, product in [(token_f,quipu), (platform_q,fac), (platform_f,quipu)]:
        denied(submit(token,payload | {'system_id':product}), code='PT403')
    assert rows() == before_denials
    passed('all four product rules hold; forged products fail with PT403 and no writes')
    for token, product in [(platform_q,quipu), (platform_f,fac)]:
        platform_receipt = j(submit(token,payload | {'system_id':product}),'anon')
        assert q('SELECT entry_context FROM app_private.client_request_links '
                 f"WHERE request_id={lit(platform_receipt['id'])}") == 'platform'
    passed('both platform contexts also create their authorized product through the revoked helper')

    idem = str(uuid.uuid4())
    count = int(q('SELECT count(*) FROM public.requests'))
    with ThreadPoolExecutor(max_workers=4) as pool:
        retried = list(pool.map(lambda _:j(submit(token_q,payload,idem),'anon'), range(4)))
    assert len({x['id'] for x in retried}) == 1
    assert int(q('SELECT count(*) FROM public.requests')) == count+1
    assert q(f'SELECT count(*) FROM app_private.client_request_links WHERE idempotency_key={lit(idem)}') == '1'
    other_user = session(subject='AnotherFixtureUser')
    distinct = j(submit(other_user,payload,idem),'anon')
    assert distinct['id'] != retried[0]['id']
    denied(submit(token_q,payload | {'title':'Changed fixture'},idem),code='22023')
    for name in INTERNAL:
        key = str(uuid.uuid4())
        count = int(q('SELECT count(*) FROM public.requests'))
        with ThreadPoolExecutor(max_workers=4) as pool:
            retried_internal = list(pool.map(lambda _:j(internal(name,payloads[name],key),'authenticated',A),range(4)))
        assert len({x['id'] for x in retried_internal}) == 1
        assert int(q('SELECT count(*) FROM public.requests')) == count+1
        denied(internal(name,payloads[name] | {'description':'Changed fixture'},key),
               'authenticated',A,code='22023')
    passed('concurrent M13 and both internal RPC retries create one ticket; identity keys stay separate')

    for index,(token,body,idem,receipt) in enumerate(receipts):
        listed = j(f'SELECT public.client_list_tickets({lit(token)})','anon')
        assert receipt['id'] in {x['id'] for x in listed}
        foreign = receipts[1-index][3]['id']
        assert foreign not in {x['id'] for x in listed}
        denied(f'SELECT public.client_ticket_detail({lit(token)},{lit(foreign)})',code='PT404')
        assert j(f'SELECT public.client_ticket_detail({lit(token)},{lit(receipt["id"])})','anon')['id'] == receipt['id']
        assert j(f'SELECT public.client_session_info({lit(token)})','anon')['identity']['provider'] == ('quipu' if index==0 else 'quipufac')
    passed('My tickets and details isolate identities; foreign PT404 leaves the valid session usable')

    expired, revoked = session(subject='ExpiredFixture'), session(subject='RevokedFixture')
    q(f"UPDATE app_private.client_sessions SET created_at=now()-interval '2 hours',"
      f"expires_at=now()-interval '1 hour' WHERE token_hash={lit(digest(expired))}")
    q(f'SELECT public.client_logout({lit(revoked)})','anon')
    # Also revoke/expire sessions that already own cached receipts, to test replay ordering.
    q(f'SELECT public.client_logout({lit(token_q)})','anon')
    q(f"UPDATE app_private.client_sessions SET created_at=now()-interval '2 hours',"
      f"expires_at=now()-interval '1 hour' WHERE token_hash={lit(digest(token_f))}")
    before_denials = rows()
    for token in [None,'', 'malformed',secrets.token_hex(32),expired,revoked]:
        denied(submit(token,payload),code='PT401')
    for token,body,idem,receipt in receipts:
        denied(submit(token,body,idem),code='PT401')
    assert rows() == before_denials
    passed('absent, invalid, expired and revoked sessions cannot create or replay existing M13 tickets')

    for receipt in [legacy,receipts[0][3],receipts[1][3]]:
        public = j(f'SELECT public.track_request_status({lit(receipt["request_number"])})','anon')
        assert public == {'request_number':receipt['request_number'],'status':'received'}
    assert q("SELECT has_function_privilege('anon','public.track_request_status(text)','EXECUTE')") == 't'
    passed('anonymous REQ tracking remains callable and returns only request number and public status')
finally:
    if server and server.poll() is None:
        subprocess.run([str(args.pg_bin/'pg_ctl'), '-D', str(cluster), 'stop', '-m', 'fast',
                        '-w', '-t', '20'], env=env, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        server.wait(timeout=5)
    shutil.rmtree(work)

evidence = {'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'migration':M15,
  'baseline_migrations':args.baseline_migrations,
  'migration_sha256':hashlib.sha256(paths[-1].read_bytes()).hexdigest(),
  'prior_migration_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths[:-1]},
  'passed':len(checks),'checks':checks,'effective_execute':grants,
  'preserved_fixture_tables':len(row_snapshot),'socket_only':True,'server_stopped':True,
  'synthetic_auth_and_storage_only':True,'remote_sql_executed':False,
  'external_provider_calls':False,'previous_suites_repeated':False}
evidence_name = ('security-request-creation-local.json' if args.baseline_migrations == 14
                 else 'security-request-creation-m13-baseline-local.json')
(ROOT/'docs/validation'/evidence_name).write_text(
    json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} M15 PostgreSQL checks passed; isolated server stopped.')
