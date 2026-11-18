#!/usr/bin/env python3
"""New account permissions only, PostgreSQL 17 socket-only isolated fixtures."""
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
work=Path(tempfile.mkdtemp(prefix='procont-account-tests-',dir='/tmp'))
cluster=work/'cluster';socket=work/'socket';socket.mkdir(mode=0o700)
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib),PGPASSFILE=str(work/'no-password-file'),PGSERVICEFILE=str(work/'no-service-file'))
base=[str(args.pg_bin/'psql'),'-X','--no-password','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq','-h',str(socket),'-p','55479','-U',getpass.getuser(),'-d','postgres']
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
owner='procont_account_owner'
try:
    subprocess.run([str(args.pg_bin/'initdb'),'-D',str(cluster),'-A','trust','--no-locale','-E','UTF8'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    log=(work/'server.log').open('w')
    server=subprocess.Popen([str(args.pg_bin/'postgres'),'-D',str(cluster),'-c','listen_addresses=','-c',f'unix_socket_directories={socket}','-c','wal_level=logical','-p','55479'],env=env,stdout=log,stderr=log)
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
    assert sql('SELECT count(*) FROM auth.users').stdout.strip()=='0'
    passed('new migration creates no accounts')
    denied('anon cannot forge service RPC',f"SELECT public.admin_account_begin('{S}','{REQ}','create','fixture@example.invalid','Fixture','superadmin')",'anon')
    denied('service cannot bootstrap',f"SELECT app_private.bootstrap_superadmin('{S}')",'service_role')
    fixture(S,'bootstrap@example.invalid')
    sql(f"SELECT app_private.bootstrap_superadmin('{S}')",owner)
    assert sql(f"SELECT role||':'||is_active FROM public.users WHERE id='{S}'",owner).stdout.strip()=='superadmin:true'
    passed('owner bootstrap provisions confirmed active superadmin')
    denied('bootstrap cannot run twice',f"SELECT app_private.bootstrap_superadmin('{S}')",owner,code='23514')
    sql(f"UPDATE public.users SET is_active=false WHERE id='{S}'",owner)
    denied('sticky bootstrap blocks reinitialization',f"SELECT app_private.bootstrap_superadmin('{S}')",owner,code='23514')
    sql(f"UPDATE public.users SET is_active=true WHERE id='{S}'",owner)
    for identity,email in [(A,'admin@example.invalid'),(V,'viewer@example.invalid')]:
        fixture(identity,email);sql(f"SELECT app_private.provision_auth_profile('{identity}')",owner)
    sql(f"UPDATE public.users SET role='admin',is_active=true WHERE id='{A}'; UPDATE public.users SET is_active=true WHERE id='{V}';",owner)
    denied('viewer cannot manage roles',f"SELECT public.admin_update_user('{A}','viewer',false)",'authenticated',V)
    denied('authenticated admin cannot invoke service RPC',f"SELECT public.admin_account_begin('{S}','{REQ}','create','fixture@example.invalid','Fixture','superadmin')",'authenticated',A)
    denied('admin cannot promote superadmin',f"SELECT public.admin_account_begin('{A}','{REQ}','create','new@example.invalid','Fixture','superadmin')",'service_role')
    denied('last active superadmin cannot be disabled',f"SELECT public.admin_update_user('{S}','superadmin',false)",'authenticated',S,code='23514')
    denied('admin cannot modify administrative target',f"SELECT public.admin_update_user('{S}','viewer',true)",'authenticated',A)
    denied('authenticated cannot read private account jobs','SELECT * FROM app_private.account_admin_jobs','authenticated',S)
    fixture(N,'new@example.invalid')
    begin=f"SELECT public.admin_account_begin('{A}','{REQ}','create','new@example.invalid','Fixture','developer')"
    assert json.loads(sql(begin,'service_role').stdout)['claimed'] is True
    assert json.loads(sql(begin,'service_role').stdout)['claimed'] is False
    passed('request reservation prevents duplicate Auth creation')
    denied('idempotency key cannot change role',begin.replace("'developer'","'viewer'"),'service_role',code='23505')
    sql(f"SELECT public.admin_account_record('{A}','{REQ}','{N}'); SELECT public.admin_account_finish('{A}','{REQ}')",'service_role')
    assert sql(f"SELECT role||':'||is_active FROM public.users WHERE id='{N}'",owner).stdout.strip()=='developer:true'
    sql(f"SELECT public.admin_account_finish('{A}','{REQ}')",'service_role')
    passed('confirmed account finalization is idempotent')
    fixture(I,'invite@example.invalid',False)
    sql(f"SELECT public.admin_account_begin('{A}','{INV}','invite','invite@example.invalid','Fixture','viewer'); SELECT public.admin_account_record('{A}','{INV}','{I}'); SELECT public.admin_account_finish('{A}','{INV}')",'service_role')
    assert sql(f"SELECT is_active FROM public.users WHERE id='{I}'",owner).stdout.strip()=='f'
    denied('unconfirmed invitation cannot be activated',f"SELECT public.admin_update_user('{I}','viewer',true)",'authenticated',A,code='23514')
    sql(f"UPDATE auth.users SET email_confirmed_at=now() WHERE id='{I}'")
    sql(f"SELECT public.admin_update_user('{I}','viewer',true)",'authenticated',A)
    passed('confirmed invitation accepts explicit activation')
    fixture(J,'stale@example.invalid')
    sql(f"SELECT public.admin_account_begin('{A}','{STALE}','create','stale@example.invalid','Fixture','viewer'); SELECT public.admin_account_record('{A}','{STALE}','{J}')",'service_role')
    sql(f"SELECT public.admin_update_user('{A}','admin',false)",'authenticated',S)
    denied('revoked administrator cannot finish account job',f"SELECT public.admin_account_finish('{A}','{STALE}')",'service_role')
    assert sql(f"SELECT count(*) FROM public.users WHERE id='{J}'",owner).stdout.strip()=='0'
    passed('failed finalization leaves no active application profile')
    version=sql('SHOW server_version').stdout.strip()
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5);log.close()
evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'checks':checks,'passed':len(checks),'socket_only':True,'server_stopped':True,'synthetic_auth_stub_only':True,'real_accounts_created':0,'remote_sql_executed':False,'previous_suites_repeated':False}
(ROOT/'docs/validation/account-administration-local.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(f'{len(checks)} new checks passed; isolated PostgreSQL stopped.')
