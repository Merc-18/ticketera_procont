#!/usr/bin/env python3
"""Areas catalog permissions only (migration 20261118000200), isolated PostgreSQL socket."""
import argparse
from datetime import datetime,timezone
import getpass
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin',type=Path,required=True)
parser.add_argument('--runtime-lib',type=Path,required=True)
args=parser.parse_args()
work=Path(tempfile.mkdtemp(prefix='procont-areas-tests-',dir='/tmp'))
cluster=work/'cluster';socket=work/'socket';socket.mkdir(mode=0o700)
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib),PGPASSFILE=str(work/'no-password-file'),PGSERVICEFILE=str(work/'no-service-file'))
base=[str(args.pg_bin/'psql'),'-X','--no-password','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq','-h',str(socket),'-p','55481','-U',getpass.getuser(),'-d','postgres']
checks=[];server=None
def sql(text,role=None,actor=None,ok=True):
    prefix=(f'SET ROLE {role};\n' if role else '')+(f"SET request.jwt.claim.sub='{actor}';\n" if actor else '')
    result=subprocess.run(base,input=prefix+text,env=env,text=True,capture_output=True)
    if ok and result.returncode:raise RuntimeError(result.stderr)
    return result
def passed(name):
    checks.append(name);print('PASS '+name,flush=True)
def denied(name,text,role,actor=None,code='42501'):
    result=sql(text,role,actor,ok=False)
    assert result.returncode and code in result.stderr, name+': expected rejection'
    passed(name)
def fixture(identity,email,confirmed=True):
    sql(f"INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES('{identity}','{email}', '{{\"full_name\":\"Synthetic fixture\"}}',"+('now()' if confirmed else 'NULL')+');')
S='00000000-0000-4000-8000-000000000001';A='00000000-0000-4000-8000-000000000002';V='00000000-0000-4000-8000-000000000003'
N='00000000-0000-4000-8000-000000000004';I='00000000-0000-4000-8000-000000000005';J='00000000-0000-4000-8000-000000000006'
REQ='10000000-0000-4000-8000-000000000001';INV='10000000-0000-4000-8000-000000000002';STALE='10000000-0000-4000-8000-000000000003'
owner='procont_areas_owner'
try:
    subprocess.run([str(args.pg_bin/'initdb'),'-D',str(cluster),'-A','trust','--no-locale','-E','UTF8'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    log=(work/'server.log').open('w')
    server=subprocess.Popen([str(args.pg_bin/'postgres'),'-D',str(cluster),'-c','listen_addresses=','-c',f'unix_socket_directories={socket}','-c','wal_level=logical','-p','55481'],env=env,stdout=log,stderr=log)
    for _ in range(100):
        if sql('SELECT 1',ok=False).returncode==0:break
        if server.poll() is not None:raise RuntimeError('Isolated PostgreSQL exited')
        time.sleep(.05)
    else:raise RuntimeError('Isolated PostgreSQL unavailable')
    assert Path(sql("SELECT current_setting('data_directory')").stdout.strip()).resolve()==cluster
    assert sql("SELECT current_setting('listen_addresses')").stdout.strip()==''
    sql(f'CREATE ROLE {owner} NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; ALTER DATABASE postgres OWNER TO {owner};')
    sql((ROOT/'supabase/tests/support/auth_stub.sql').read_text())
    sql(f'ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz; GRANT USAGE ON SCHEMA auth TO {owner}; GRANT SELECT(id,email,raw_user_meta_data,email_confirmed_at),REFERENCES(id) ON auth.users TO {owner}; ALTER PUBLICATION supabase_realtime OWNER TO {owner};')
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):sql(path.read_text(),owner)
    assert sql('SELECT count(*) FROM public.areas',owner).stdout.strip()=='0'
    passed('catalog starts empty')
    fixture(S,'super@example.invalid');sql(f"SELECT app_private.bootstrap_superadmin('{S}')",owner)
    for identity,email in [(A,'admin@example.invalid'),(V,'viewer@example.invalid')]:
        fixture(identity,email);sql(f"SELECT app_private.provision_auth_profile('{identity}')",owner)
    sql(f"UPDATE public.users SET role='admin',is_active=true WHERE id='{A}'; UPDATE public.users SET is_active=true WHERE id='{V}';",owner)
    sql("INSERT INTO public.areas(name) VALUES ('Área A')",'authenticated',S)
    passed('superadmin creates area')
    denied('duplicate name rejected case-insensitively',"INSERT INTO public.areas(name) VALUES ('ÁREA a')",'authenticated',S,code='23505')
    denied('untrimmed or empty name rejected',"INSERT INTO public.areas(name) VALUES (' X ')",'authenticated',S,code='23514')
    denied('admin cannot create area',"INSERT INTO public.areas(name) VALUES ('Área B')",'authenticated',A)
    denied('viewer cannot create area',"INSERT INTO public.areas(name) VALUES ('Área B')",'authenticated',V)
    denied('anon cannot create area',"INSERT INTO public.areas(name) VALUES ('Área B')",'anon')
    denied('created_by cannot be forged',f"INSERT INTO public.areas(name,created_by) VALUES ('Área B','{A}')",'authenticated',S)
    assert sql("UPDATE public.areas SET name='Área B' RETURNING name",'authenticated',A).stdout.strip()==''
    passed('admin update affects no rows')
    sql("UPDATE public.areas SET name='Área C' WHERE name='Área A'",'authenticated',S)
    sql("INSERT INTO public.areas(name,is_active) VALUES ('Área D',false)",'authenticated',S)
    passed('superadmin edits and deactivates area')
    denied('delete not permitted',"DELETE FROM public.areas",'authenticated',S)
    assert sql("SELECT string_agg(name,',' ORDER BY name) FROM public.areas",'anon').stdout.strip()=='Área C'
    passed('anon reads only active areas')
    denied('anon cannot read audit columns',"SELECT created_by FROM public.areas",'anon')
    assert sql("SELECT string_agg(name,',' ORDER BY name) FROM public.areas",'authenticated',V).stdout.strip()=='Área C'
    assert sql("SELECT string_agg(name,',' ORDER BY name) FROM public.areas",'authenticated',A).stdout.strip()=='Área C'
    passed('members read only active areas')
    assert sql("SELECT string_agg(name,',' ORDER BY name) FROM public.areas",'authenticated',S).stdout.strip()=='Área C,Área D'
    passed('superadmin reads inactive areas')
    sql(f"UPDATE public.users SET is_active=false WHERE id='{V}'",owner)
    assert sql("SELECT count(*) FROM public.areas",'authenticated',V).stdout.strip()=='0'
    passed('inactive profile reads nothing')
    version=sql('SHOW server_version').stdout.strip()
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5);log.close()
evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'migration':'20261118000200_areas.sql','checks':checks,'passed':len(checks),'socket_only':True,'server_stopped':True,'synthetic_auth_stub_only':True,'real_accounts_created':0,'real_areas_created':0,'remote_sql_executed':False,'previous_suites_repeated':False}
(ROOT/'docs/validation/areas-local.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} new checks passed; isolated PostgreSQL stopped.')
