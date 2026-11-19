#!/usr/bin/env python3
"""Integrated M1-M15, disposable PostgreSQL over Unix socket; Auth/Storage fixtures only.

clean: apply all fifteen migrations before any application fixture.
upgrade: preserve an Administrative history and M13 client data across M14 then M15.
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
    assert len(paths)==15 and paths[-1].name=='20261119000300_security_request_creation.sql'
    legacy = None
    if args.scenario == 'clean':
        for path in paths:
            q(path.read_text())
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
        passed('B: M15 preserves all 35 fixture tables including history, identities, sessions and reservations')
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
(ROOT/f'docs/validation/integrated-security-client-flow-{args.scenario}.json').write_text(
    json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} integrated {args.scenario} groups passed; server stopped.')
