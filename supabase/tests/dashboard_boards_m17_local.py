#!/usr/bin/env python3
"""M1-M17 dashboard/board security contract on disposable PostgreSQL; Auth/Storage fixtures only.

clean: apply all eighteen migrations before any application fixture.
upgrade: preserve legacy project and client history while applying M16, M16b and M17.
Runs the actual frontend adapters through a local SQL bridge, not hosted Supabase.
"""
import argparse
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

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
parser.add_argument('--scenario', choices=['clean', 'upgrade'], required=True)
args = parser.parse_args()
work = Path(tempfile.mkdtemp(prefix='procont-integrated-', dir='/tmp'))
cluster, socket = work/'cluster', work/'socket'
socket.mkdir(mode=0o700)
env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-password'),
           PGSERVICEFILE=str(work/'no-service'))
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1',
        '-v', 'VERBOSITY=verbose', '-Atq', '-h', str(socket), '-p', '55516',
        '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_integrated_owner'
users = {role:f'00000000-0000-4000-8000-{n:012d}' for n,role in enumerate(
    ['superadmin','admin','developer','viewer','inactive','external'], 161)}
checks, server = [], None


def lit(value):
    return 'NULL' if value is None else "'"+str(value).replace("'", "''")+"'"


def data(value):
    return lit(json.dumps(value))+'::jsonb'


def q(text, role=owner, actor=None):
    prefix = (f'SET ROLE {role};\n' if role else '')+f'SET request.jwt.claim.sub={lit(actor or "")};\n'
    result = subprocess.run(base, input=prefix+text, env=env, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def j(text, role=owner, actor=None):
    return json.loads(q(text,role,actor))


def passed(name):
    checks.append(name)
    print('PASS '+name, flush=True)


def apply_m17_with_rollback_test(path):
    source=path.read_text()
    inner=source.removeprefix('BEGIN;').rsplit('COMMIT;',1)[0]
    q('BEGIN;\n'+inner+'\nROLLBACK;')
    assert q("SELECT to_regclass('public.internal_card_preferences') IS NULL AND to_regprocedure('public.internal_card_colors()') IS NULL")== 't'
    passed('M17 DDL and function replacements roll back atomically in the disposable database')
    q(source)
    passed('M17 applies successfully after the rollback check')


def snapshot():
    tables = j("SELECT jsonb_agg(format('%I.%I',n.nspname,c.relname)) FROM pg_class c "
      "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' "
      "AND n.nspname IN('public','app_private','auth','storage')", None)
    return {t:q("SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),"
                "'[]'::jsonb)::text) FROM "+t+' t',None) for t in tables}


def staff():
    for role,actor in users.items():
        q(f"INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES("
          f"{lit(actor)},{lit(role+'@fixture.invalid')},'{{\"full_name\":\"Synthetic staff\"}}',now())",None)
        if role != 'external':
            helper = 'bootstrap_superadmin' if role == 'superadmin' else 'provision_auth_profile'
            q(f'SELECT app_private.{helper}({lit(actor)})')
    for role in ['admin','developer','viewer','inactive']:
        q(f"UPDATE public.users SET role={lit('admin' if role=='inactive' else role)},"
          f"is_active={'false' if role=='inactive' else 'true'} WHERE id={lit(users[role])}")


def m17_checks(study, base_code, system, typ, users, q, j, passed, lit, data):
    # Same study, five exact internal codes. Only canonical PROCONT may classify an area.
    # Use the seeded canonical catalog (one global unique code), not a fake PROCONT code.
    fixture_study = study
    study = q("SELECT studio_id FROM public.studio_codes WHERE code='PROCONT' AND is_active")
    ids = {name:q(f"SELECT id FROM public.studio_codes WHERE studio_id={lit(study)} AND code={lit(name)} AND is_active")
           for name in ['PROCONT','ARAPA','DISFARMADENT','PROCONT_CUZ','PROCONT_OLICH']}
    area = q(f"INSERT INTO public.areas(studio_id,name,code,is_active) VALUES({lit(study)},'Área fixture M17','AFM17',true) RETURNING id")
    wrong_area = q(f"INSERT INTO public.areas(studio_id,name,code,is_active) VALUES({lit(fixture_study)},'Área ajena M17','OAM17',true) RETURNING id")
    other_system = q("SELECT id FROM public.catalog_systems WHERE is_active AND NOT requires_subproject ORDER BY name LIMIT 1")
    if not other_system:
        raise AssertionError('M17 fixture needs an active system without required subprojects')
    def submit(label, legacy_area=None):
        p={'requester_name':'Synthetic requester','requester_email':None,'request_type':'Mejora','origin':'Interno',
           'data_system_involved':None,'description':'M17 synthetic fixture '+label,'observations':None,
           'request_date':None,'requested_date':None,'needs_code':False}
        c={'studio_id':study,'system_id':other_system,'subsystem_id':None,'area_id':legacy_area,'subarea_id':None}
        return j('SELECT public.submit_classified_request('+data(p)+','+data(c)+',gen_random_uuid())','authenticated',users['admin'])
    # Exact canonical code: required area, validated catalog and stored relation/text.
    req=submit('procont')
    q('SELECT public.classify_request('+lit(req['id'])+','+data({'studio_code_id':ids['PROCONT'],'area_id':area})+')','authenticated',users['admin'])
    assert j('SELECT jsonb_build_object(\'area_id\',area_id,\'requester_area\',requester_area) FROM public.requests WHERE id='+lit(req['id'])) == {'area_id':area,'requester_area':'Área fixture M17'}
    passed('M17 exact PROCONT classification accepts a catalog area and persists its relation')
    missing=submit('procont-missing')
    try:
        q('SELECT public.classify_request('+lit(missing['id'])+','+data({'studio_code_id':ids['PROCONT']})+')','authenticated',users['admin'])
        raise AssertionError('PROCONT classification without required area was accepted')
    except RuntimeError as e:
        assert 'Área requerida para el código PROCONT' in str(e)
    passed('M17 rejects PROCONT classification when an active area is omitted')
    invalid=submit('procont-invalid')
    try:
        q('SELECT public.classify_request('+lit(invalid['id'])+','+data({'studio_code_id':ids['PROCONT'],'area_id':wrong_area})+')','authenticated',users['admin'])
        raise AssertionError('foreign/invalid PROCONT area was accepted')
    except RuntimeError as e:
        assert 'Área inválida para PROCONT' in str(e)
    passed('M17 rejects invalid area identifiers for PROCONT')
    for code_name in ['ARAPA','DISFARMADENT','PROCONT_CUZ','PROCONT_OLICH']:
        candidate=submit('excluded-'+code_name,wrong_area)
        q('SELECT public.classify_request('+lit(candidate['id'])+','+data({'studio_code_id':ids[code_name],'area_id':wrong_area})+')','authenticated',users['admin'])
        row=j('SELECT jsonb_build_object(\'area_id\',area_id,\'subarea_id\',subarea_id,\'requester_area\',requester_area) FROM public.requests WHERE id='+lit(candidate['id']))
        assert row=={'area_id':None,'subarea_id':None,'requester_area':None},(code_name,row)
    passed('M17 ignores legacy area payloads for ARAPA, DISFARMADENT, PROCONT_CUZ and PROCONT_OLICH within the same study')
    q('SELECT public.assign_request_studio_code('+lit(req['id'])+','+lit(ids['ARAPA'])+')','authenticated',users['admin'])
    row=j('SELECT jsonb_build_object(\'area_id\',area_id,\'subarea_id\',subarea_id,\'requester_area\',requester_area) FROM public.requests WHERE id='+lit(req['id']))
    assert row=={'area_id':None,'subarea_id':None,'requester_area':None}
    passed('M17 clears a newly assigned PROCONT area when the code changes to an excluded code')
    # Legacy Planner/internal project entry accepts old area fields without writing them.
    planner={'requester_name':'Legacy planner fixture','requester_email':None,'requester_area':'must be discarded',
      'request_type':'Otro','origin':'Interno','data_system_involved':None,'description':'Planner M17 fixture',
      'observations':None,'request_date':None,'requested_date':None,'needs_code':False}
    receipt=j('SELECT public.submit_request('+data(planner)+',gen_random_uuid())','authenticated',users['admin'])
    assert q('SELECT coalesce(requester_area,\'<null>\') FROM public.requests WHERE id='+lit(receipt['id']))=='<null>'
    passed('M17 drops legacy area input from Planner/internal request intake')
    # A request with no canonical code cannot gain an area through the secondary details RPC.
    q('SELECT public.update_request_details('+lit(receipt['id'])+','+lit('unauthorized new area')+','+lit('Updated synthetic requester')+')','authenticated',users['admin'])
    assert q('SELECT coalesce(requester_area,\'<null>\') FROM public.requests WHERE id='+lit(receipt['id']))=='<null>'
    passed('M17 prevents update_request_details from creating an area association without PROCONT code')
    # Internal card preferences: authenticated active profile only; unique, shared, deterministic.
    assert q("SELECT has_function_privilege('anon','public.internal_card_colors()','EXECUTE')::text || ',' || has_function_privilege('anon','public.set_my_internal_card_color(text)','EXECUTE')::text")=='false,false'
    assert q("SELECT has_table_privilege('anon','public.internal_card_preferences','SELECT')")=='f'
    assert q("SELECT count(*)=count(DISTINCT color_id) FROM public.internal_card_preferences p JOIN public.users u ON u.id=p.user_id WHERE u.is_active")=='t'
    passed('M17 denies anon table/RPC access and guarantees distinct colors for active internal profiles')
    colors=j('SELECT public.internal_card_colors()','authenticated',users['developer'])
    assert colors['user_id']==users['developer'] and colors['assignments'][users['developer']]
    viewer=j('SELECT public.internal_card_colors()','authenticated',users['viewer'])
    assert viewer['assignments']==colors['assignments']
    assert q('SELECT count(*) FROM public.internal_card_preferences','authenticated',users['external'])=='0'
    try:
        q('SELECT public.internal_card_colors()','authenticated',users['external'])
        raise AssertionError('external profile called internal color RPC')
    except RuntimeError as e:
        assert '42501' in str(e)
    passed('M17 active internal roles share assignments; external authenticated profile receives no rows and RPC denial')
    try:
        q('SELECT public.internal_card_colors()','anon')
        raise AssertionError('anon executed internal color RPC')
    except RuntimeError as e:
        assert 'permission denied' in str(e).lower() or '42501' in str(e)
    passed('M17 anon cannot execute preference RPC')
    admin_color=q('SELECT color_id FROM public.internal_card_preferences WHERE user_id='+lit(users['admin']))
    try:
        q('SELECT public.set_my_internal_card_color('+lit(admin_color)+')','authenticated',users['developer'])
        raise AssertionError('duplicate color assignment accepted')
    except RuntimeError as e:
        assert '23505' in str(e)
    # Color change releases the previous slot and remains in the shared RPC snapshot.
    old=q('SELECT color_id FROM public.internal_card_preferences WHERE user_id='+lit(users['developer']))
    q("SELECT public.set_my_internal_card_color('ambar')",'authenticated',users['developer'])
    assert q('SELECT color_id FROM public.internal_card_preferences WHERE user_id='+lit(users['developer']))=='ambar'
    assert q('SELECT count(*) FROM public.internal_card_preferences WHERE color_id='+lit(old))=='0'
    passed('M17 color change is atomic, shared, and releases the previous color')
    # Concurrent claims of one free color serialize at the preference table; exactly one succeeds.
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    contenders=[users['admin'],users['viewer']]
    color='pizarra'
    if q('SELECT count(*) FROM public.internal_card_preferences WHERE color_id='+lit(color))!='0':
        color='pizarra-claro'
    barrier=Barrier(2)
    def claim(actor):
        barrier.wait()
        try:
            q('SELECT public.set_my_internal_card_color('+lit(color)+')','authenticated',actor)
            return True
        except RuntimeError as e:
            if '23505' in str(e): return False
            raise
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(claim,contenders))
    assert sorted(results)==[False,True],results
    assert q('SELECT count(*) FROM public.internal_card_preferences WHERE color_id='+lit(color))=='1'
    passed('M17 concurrent claims of one color yield one owner and one explicit unique-conflict rejection')
    # Profile trigger automatically assigns and frees colors on its active lifecycle.
    new_id='00000000-0000-4000-8000-000000009917'
    q(f"INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES({lit(new_id)},'new-m17@fixture.invalid','{{\"full_name\":\"New synthetic member\"}}')",None)
    q(f'SELECT app_private.provision_auth_profile({lit(new_id)})')
    assert q('SELECT count(*) FROM public.internal_card_preferences WHERE user_id='+lit(new_id))=='0'
    q(f'UPDATE public.users SET is_active=true WHERE id={lit(new_id)}')
    assert q('SELECT count(*) FROM public.internal_card_preferences WHERE user_id='+lit(new_id))=='1'
    q(f'UPDATE public.users SET is_active=false WHERE id={lit(new_id)}')
    assert q('SELECT count(*) FROM public.internal_card_preferences WHERE user_id='+lit(new_id))=='0'
    passed('M17 assigns a unique color to a new active profile and releases it on deactivation')


try:
    subprocess.run([str(args.pg_bin/'initdb'),'-D',str(cluster),'-A','trust','--locale=C.UTF-8','-E','UTF8'],
                   env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    with (work/'server.log').open('w') as log:
        server = subprocess.Popen([str(args.pg_bin/'postgres'),'-D',str(cluster),'-c','listen_addresses=',
          '-c',f'unix_socket_directories={socket}','-c','wal_level=logical','-p','55516'],
          env=env,stdout=log,stderr=log)
    for _ in range(100):
        try:
            q('SELECT 1',None)
            break
        except RuntimeError:
            if server.poll() is not None:
                raise
            time.sleep(.05)
    else:
        raise RuntimeError('Isolated PostgreSQL unavailable')
    assert Path(q('SHOW data_directory',None)).resolve() == cluster
    assert q('SHOW listen_addresses',None) == ''
    version = q('SHOW server_version',None)
    q(f'CREATE ROLE {owner} NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; '
      f'CREATE ROLE service_role NOLOGIN BYPASSRLS; ALTER DATABASE postgres OWNER TO {owner};',None)
    q((ROOT/'supabase/tests/support/auth_stub.sql').read_text(),None)
    q(f'ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz; '
      f'GRANT USAGE ON SCHEMA auth TO {owner}; '
      f'GRANT SELECT(id,email,raw_user_meta_data,email_confirmed_at),REFERENCES(id) ON auth.users TO {owner}; '
      f'ALTER PUBLICATION supabase_realtime OWNER TO {owner};',None)
    q(f'''CREATE SCHEMA storage AUTHORIZATION {owner};
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,created_at timestamptz DEFAULT now(),metadata jsonb DEFAULT '{{}}'::jsonb);
      ALTER TABLE storage.buckets OWNER TO {owner}; ALTER TABLE storage.objects OWNER TO {owner};
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated; GRANT SELECT,INSERT ON storage.objects TO anon,authenticated;''',None)
    paths = sorted((ROOT/'supabase/migrations').glob('*.sql'))
    assert len(paths)==18 and paths[-1].name=='20261123000300_internal_area_scope_and_card_preferences.sql'
    legacy = None
    if args.scenario == 'clean':
        for path in paths:
            if path.name=='20261123000300_internal_area_scope_and_card_preferences.sql': apply_m17_with_rollback_test(path)
            else: q(path.read_text())
        staff()
        passed('A: clean installation applies M1-M15 in order before application fixtures')
    else:
        for path in paths[:11]:
            q(path.read_text())
        staff()
        legacy = j('SELECT public.create_internal_project('+data({'title':'Synthetic Administrative history',
          'description':'Existing fixture','project_type':'administrative','assigned_admin':users['admin']})+
          ',gen_random_uuid())','authenticated',users['admin'])['id']
        q(f"INSERT INTO public.comments(project_id,content) VALUES({lit(legacy)},'Existing synthetic comment')",
          'authenticated',users['admin'])
        for path in paths[11:13]:
            q(path.read_text())
        passed('B: existing M1-M13 database includes a genuine pre-M12 Administrative fixture')

    study = q("INSERT INTO public.studios(name,ruc) VALUES('Integrated synthetic study','20000000016') RETURNING id")
    code = q(f"INSERT INTO public.studio_codes(studio_id,code) VALUES({lit(study)},'INTEGRATED_FIXTURE') RETURNING id")
    quipu = q("SELECT id FROM public.catalog_systems WHERE name='Quipu'")
    fac = q("SELECT id FROM public.catalog_systems WHERE name='Quipu_Fac'")
    other = q("SELECT id FROM public.catalog_systems WHERE name='Otros'")
    typ = q("SELECT id FROM public.request_types WHERE name='Mejora'")
    q(f"SELECT public.set_client_company_studio('20000000016',{lit(study)})",'authenticated',users['admin'])
    tokens = {}
    for provider in ['quipu','quipufac']:
        token = secrets.token_hex(32)
        tokens[provider]=token
        values=[provider,'20000000016','FixtureUser' if provider=='quipu' else 'company',
                'username' if provider=='quipu' else 'company','FixtureUser' if provider=='quipu' else None,
                'Verified synthetic name',hashlib.sha256(token.encode()).hexdigest()]
        q('SELECT public.client_open_session('+','.join(map(lit,values))+
          ",now()+interval '8 hours')",'service_role')
    if args.scenario=='upgrade':
        previous = j('SELECT public.client_submit_request('+lit(tokens['quipu'])+','+data({
          'requester_name':'Existing customer fixture','system_id':quipu,'request_type_id':typ,
          'title':'Existing M13 fixture','description':'Preserve this data','urgent_requested':False})+
          ',gen_random_uuid())','anon')
        existing = j(f"SELECT public.client_reserve_attachments({lit(tokens['quipu'])},{lit(previous['id'])},"+
          data([{'upload_key':'00000000-0000-4000-8000-000000001616','file_name':'existing.txt','size_bytes':12,'mime_type':'text/plain'}])+')','anon')
        q(f"INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('request-attachments',"
          f"{lit(existing[0]['path'])},'{{\"size\":12,\"mimetype\":\"text/plain\"}}')",'anon')
        before = snapshot()
        q(paths[13].read_text())
        after14 = snapshot()
        assert all(after14[k]==v for k,v in before.items())
        assert q('SELECT count(*) FROM app_private.client_login_attempts')=='0'
        passed('B: M14 preserves all 34 pre-existing fixture tables and adds an empty throttle table')
        q(paths[14].read_text())
        assert snapshot()==after14
        passed('B: M15 preserves all prior fixture tables and histories')
        historic = q("SELECT md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'requester_name',requester_name,'requester_area',requester_area,'studio_id',studio_id,'studio_code_id',studio_code_id) ORDER BY id),'[]'::jsonb)::text) FROM public.requests")
        q(paths[15].read_text()); q(paths[16].read_text()); apply_m17_with_rollback_test(paths[17])
        assert q("SELECT md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'requester_name',requester_name,'requester_area',requester_area,'studio_id',studio_id,'studio_code_id',studio_code_id) ORDER BY id),'[]'::jsonb)::text) FROM public.requests")==historic
        passed('B: M16→M16b→M17 preserves the existing request identity/classification snapshot')
    # M17 exact-code authorization and shared preference checks on this real isolated PostgreSQL.
    m17_checks(study, code, quipu, typ, users, q, j, passed, lit, data)
    node = subprocess.run(['node',str(ROOT/'tests/integration/database-client-flows.mjs')],
      input=json.dumps({'base':base,'owner':owner,'cluster':str(cluster),'scenario':args.scenario,
        'users':users,'study':study,'code':code,'quipu':quipu,'fac':fac,'other':other,'typ':typ,
        'tokens':tokens,'legacy':legacy}),env=env,text=True,capture_output=True)
    print(node.stdout,end='',flush=True)
    if node.returncode:
        raise RuntimeError(node.stderr)
    checks.extend(line[5:] for line in node.stdout.splitlines() if line.startswith('PASS '))
finally:
    if server and server.poll() is None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],
                       env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5)
    shutil.rmtree(work)

evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'scenario':args.scenario,
  'postgresql':version,'passed':len(checks),'checks':checks,
  'migration_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
  'socket_only':True,'server_stopped':True,'auth_storage_stubs':True,
  'actual_frontend_adapters_to_postgresql':True,'hosted_supabase_e2e':False,'remote_operations':False}
(ROOT/f'docs/validation/dashboard-boards-m17-{args.scenario}.json').write_text(
    json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} integrated {args.scenario} groups passed; server stopped.')
