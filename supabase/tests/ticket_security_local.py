#!/usr/bin/env python3
"""Only new ticket-security cases. Synthetic SQL stubs, socket-only PostgreSQL."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import getpass
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
args = parser.parse_args()
work = Path(tempfile.mkdtemp(prefix='procont-security-tests-', dir='/tmp'))
cluster = work/'cluster'; socket = work/'socket'; socket.mkdir(mode=0o700)
env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-pass'), PGSERVICEFILE=str(work/'no-service'))
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
        '-Atq', '-h', str(socket), '-p', '55489', '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_security_owner'; checks = []; server = None
S = '00000000-0000-4000-8000-000000000001'; V = '00000000-0000-4000-8000-000000000002'
def literal(value): return "'"+value.replace("'", "''")+"'"
def sql(text, role=None, actor=None, ok=True):
    prefix = (f'SET ROLE {role};\n' if role else '')+(f"SET request.jwt.claim.sub='{actor}';\n" if actor else '')
    result = subprocess.run(base, input=prefix+text, env=env, text=True, capture_output=True)
    if ok and result.returncode: raise RuntimeError(result.stderr)
    return result
def q(text, role=None, actor=None): return sql(text, role, actor).stdout.strip()
def passed(name): checks.append(name); print('PASS '+name, flush=True)
def denied(name, text, role='anon', actor=None, code='42501'):
    result = sql(text, role, actor, ok=False)
    assert result.returncode and code in result.stderr, name+': expected denial'
    passed(name)
def reserve(receipt, key=None, name='fixture.txt', size=8, mime='text/plain', token=None):
    return (f"SELECT public.reserve_request_attachment('{receipt['id']}','{token or receipt['tracking_token']}',"
            f"'{key or uuid.uuid4()}',{literal(name)},{size},{literal(mime)})")
def upload(path): return f"INSERT INTO storage.objects(bucket_id,name) VALUES('request-attachments',{literal(path)})"
def tracking(receipt, token=None):
    return json.loads(q(f"SELECT public.track_request('{receipt['request_number']}','{token or receipt['tracking_token']}')", 'anon') or 'null')
try:
    subprocess.run([str(args.pg_bin/'initdb'), '-D', str(cluster), '-A', 'trust', '--no-locale', '-E', 'UTF8'], env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log=(work/'server.log').open('w')
    server=subprocess.Popen([str(args.pg_bin/'postgres'),'-D',str(cluster),'-c','listen_addresses=', '-c',f'unix_socket_directories={socket}','-c','wal_level=logical','-p','55489'],env=env,stdout=log,stderr=log)
    for _ in range(100):
        if sql('SELECT 1',ok=False).returncode==0: break
        if server.poll() is not None: raise RuntimeError('Disposable PostgreSQL exited')
        time.sleep(.05)
    else: raise RuntimeError('Disposable PostgreSQL unavailable')
    assert Path(q("SELECT current_setting('data_directory')")).resolve()==cluster
    assert q("SELECT current_setting('listen_addresses')")==''
    sql(f'CREATE ROLE {owner} NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; ALTER DATABASE postgres OWNER TO {owner};')
    sql((ROOT/'supabase/tests/support/auth_stub.sql').read_text())
    sql(f'ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz; GRANT USAGE ON SCHEMA auth TO {owner}; GRANT SELECT(id,email,raw_user_meta_data,email_confirmed_at),REFERENCES(id) ON auth.users TO {owner}; ALTER PUBLICATION supabase_realtime OWNER TO {owner};')
    sql(f"""CREATE SCHEMA storage AUTHORIZATION {owner};
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,created_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));
      ALTER TABLE storage.buckets OWNER TO {owner}; ALTER TABLE storage.objects OWNER TO {owner};
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;""")
    migrations=sorted((ROOT/'supabase/migrations').glob('*.sql'))
    for path in migrations[:-1]: sql(path.read_text(),owner)
    assert len(migrations)==9 and migrations[-1].name=='20261118000500_ticket_security.sql'
    studio=q('SELECT studio_id FROM public.studio_codes WHERE is_active ORDER BY code LIMIT 1',owner)
    system=q("SELECT id FROM public.catalog_systems WHERE name='Otros'",owner)
    kind=q("SELECT id FROM public.request_types WHERE name='Otros'",owner)
    def ticket():
        payload={'requester_name':'Synthetic fixture','studio_id':studio,'system_id':system,'request_type_id':kind,
                 'title':'Security fixture','description':'Synthetic test content','urgent_requested':False}
        return json.loads(q(f'SELECT public.submit_client_request({literal(json.dumps(payload))}::jsonb,gen_random_uuid())','anon'))
    legacy_id=q("INSERT INTO public.requests(requester_name,request_type,description,status,rejection_reason) VALUES('Synthetic fixture','Legacy','Synthetic','rejected','INTERNAL_LEGACY_SENTINEL') RETURNING id",owner)
    legacy_token=q(f"INSERT INTO app_private.request_access(request_id) VALUES('{legacy_id}') RETURNING tracking_token",owner)
    legacy={'id':legacy_id,'request_number':q(f"SELECT request_number FROM public.requests WHERE id='{legacy_id}'",owner),'tracking_token':legacy_token}
    with_old_upload=ticket();sql(upload(with_old_upload['id']+'/1-existing.txt'),owner)
    sql(migrations[-1].read_text(),owner)
    assert q(f"SELECT rejection_reason||':'||(public_rejection_reason IS NULL) FROM public.requests WHERE id='{legacy_id}'",owner)=='INTERNAL_LEGACY_SENTINEL:true'
    assert 'INTERNAL_LEGACY_SENTINEL' not in json.dumps(tracking(legacy))
    passed('historical internal rejection preserved and not automatically published')
    first=ticket(); other=ticket(); wrong=str(uuid.uuid4())
    denied('recent request UUID alone cannot upload',upload(first['id']+'/1-file.txt'))
    denied('guessed upload capability cannot upload',upload(first['id']+'/'+wrong+'-file.txt'))
    denied('wrong tracking token cannot reserve',reserve(first,token=wrong))
    denied('another ticket token cannot reserve',reserve(first,token=other['tracking_token']))
    grant_key=str(uuid.uuid4()); g=json.loads(q(reserve(first,key=grant_key),'anon'))
    assert json.loads(q(reserve(first,key=grant_key),'anon'))==g
    assert first['tracking_token'] not in g['path'] and grant_key not in g['path']
    passed('private token issues a separate random idempotent upload capability')
    denied('same upload key cannot change metadata',reserve(first,key=grant_key,name='changed.txt'),code='23505')
    sql(upload(g['path']),'anon')
    passed('authorized capability uploads through existing Storage RLS')
    denied('capability cannot authorize a different filename',upload(g['path']+'-changed'))
    denied('uploaded object cannot be overwritten',upload(g['path']))
    sql(f"UPDATE storage.objects SET name=name||'-tampered' WHERE bucket_id='request-attachments' AND name={literal(g['path'])}",'anon')
    assert q(f'SELECT count(*) FROM storage.objects WHERE name={literal(g["path"])}',owner)=='1'
    passed('no Storage UPDATE policy permits overwriting')
    denied('private grants inaccessible to anon','SELECT * FROM app_private.request_attachment_grants')
    denied('actual 10 MiB maximum retained at reservation',reserve(first,size=10485761),code='22023')
    denied('unapproved MIME denied',reserve(first,mime='text/html'),code='22023')
    with ThreadPoolExecutor(max_workers=6) as pool:
        results=list(pool.map(lambda _:sql(reserve(with_old_upload), 'anon',ok=False),range(6)))
    assert sum(x.returncode==0 for x in results)==4
    assert all(x.returncode==0 or '23514' in x.stderr for x in results)
    passed('concurrent reservations plus existing M8 upload cannot exceed five slots')
    expired=ticket(); eg=json.loads(q(reserve(expired),'anon'))
    sql(f"UPDATE public.requests SET created_at=now()-interval '31 minutes' WHERE id='{expired['id']}'",owner)
    denied('thirty minute boundary blocks reservation',reserve(expired))
    denied('thirty minute boundary revokes outstanding upload capability',upload(eg['path']))
    assert q("SELECT (NOT public)||':'||file_size_limit FROM storage.buckets WHERE id='request-attachments'",owner)=='true:10485760'
    assert q('SELECT count(*) FROM storage.objects','anon')=='0'
    passed('Storage RLS hides all attachment objects from anonymous clients')
    for identity,email in [(S,'security-super@example.invalid'),(V,'security-viewer@example.invalid')]:
        sql(f"INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES('{identity}','{email}','{{\"full_name\":\"Synthetic fixture\"}}',now())")
        sql(f"SELECT app_private.provision_auth_profile('{identity}')",owner)
    sql(f"UPDATE public.users SET role='superadmin',is_active=true WHERE id='{S}'; UPDATE public.users SET is_active=true WHERE id='{V}'",owner)
    rejected=ticket(); pending_grant=json.loads(q(reserve(rejected),'anon'))
    code=q(f"SELECT id FROM public.studio_codes WHERE studio_id='{studio}' AND is_active LIMIT 1",owner)
    sql(f"SELECT public.classify_request('{rejected['id']}',jsonb_build_object('studio_code_id','{code}'))",'authenticated',S)
    denied('anonymous caller cannot reject with notes',f"SELECT public.reject_request_with_notes('{rejected['id']}','Public message','Private')")
    denied('viewer cannot reject with notes',f"SELECT public.reject_request_with_notes('{rejected['id']}','Public message','Private')",'authenticated',V)
    sql(f"SELECT public.reject_request_with_notes('{rejected['id']}','Public message','INTERNAL_NEW_SENTINEL SLA INTERNAL_CODE')",'authenticated',S)
    response=tracking(rejected)
    assert response['rejection_reason']=='Public message'
    assert set(response)=={'request_number','status','created_at','title','rejection_reason'}
    assert 'INTERNAL_' not in json.dumps(response)
    assert q(f"SELECT rejection_reason FROM public.requests WHERE id='{rejected['id']}'",owner)=='INTERNAL_NEW_SENTINEL SLA INTERNAL_CODE'
    passed('public tracking serializes the public reason only and excludes internal fields')
    assert tracking(rejected,wrong) is None
    passed('wrong tracking token cannot obtain the public rejection')
    denied('decision revokes pending upload capability',upload(pending_grant['path']))
    compatible=ticket()
    sql(f"SELECT public.classify_request('{compatible['id']}',jsonb_build_object('studio_code_id','{code}')); SELECT public.reject_request('{compatible['id']}','Existing UI public message')",'authenticated',S)
    assert tracking(compatible)['rejection_reason']=='Existing UI public message'
    passed('existing two argument rejection RPC remains compatible')
    denied('viewer cannot publish historical notes',f"SELECT public.publish_rejection_reason('{legacy_id}','Reviewed public reason')",'authenticated',V)
    sql(f"SELECT public.publish_rejection_reason('{legacy_id}','Reviewed public reason')",'authenticated',S)
    assert tracking(legacy)['rejection_reason']=='Reviewed public reason'
    assert q(f"SELECT rejection_reason FROM public.requests WHERE id='{legacy_id}'",owner)=='INTERNAL_LEGACY_SENTINEL'
    passed('authorized historical publication preserves original private notes')
    version=q('SHOW server_version')
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5);log.close()
evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'migration':migrations[-1].name,
          'checks':checks,'passed':len(checks),'storage_auth_stubs_only':True,'socket_only':True,'server_stopped':True,
          'remote_sql_executed':False,'real_tickets_or_accounts_created':False,'previous_suites_repeated':False,
          'hosted_storage_http_size_limit_tested':False}
(ROOT/'docs/validation/ticket-security-local.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(f'{len(checks)} new security checks passed; disposable PostgreSQL stopped.')
