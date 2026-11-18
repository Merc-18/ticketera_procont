#!/usr/bin/env python3
"""Client intake and internal validation only (migration 20261118000400), isolated PostgreSQL socket."""
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
work=Path(tempfile.mkdtemp(prefix='procont-intake-tests-',dir='/tmp'))
cluster=work/'cluster';socket=work/'socket';socket.mkdir(mode=0o700)
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib),PGPASSFILE=str(work/'no-password-file'),PGSERVICEFILE=str(work/'no-service-file'))
base=[str(args.pg_bin/'psql'),'-X','--no-password','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq','-h',str(socket),'-p','55485','-U',getpass.getuser(),'-d','postgres']
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
owner='procont_intake_owner'
try:
    subprocess.run([str(args.pg_bin/'initdb'),'-D',str(cluster),'-A','trust','--no-locale','-E','UTF8'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    log=(work/'server.log').open('w')
    server=subprocess.Popen([str(args.pg_bin/'postgres'),'-D',str(cluster),'-c','listen_addresses=','-c',f'unix_socket_directories={socket}','-c','wal_level=logical','-p','55485'],env=env,stdout=log,stderr=log)
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
    # Minimal storage stub (buckets/objects + RLS) so bucket policies of the new migration are exercised.
    sql(f"""CREATE SCHEMA storage AUTHORIZATION {owner};
      CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text, owner uuid, created_at timestamptz DEFAULT now());
      ALTER TABLE storage.buckets OWNER TO {owner}; ALTER TABLE storage.objects OWNER TO {owner};
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated; GRANT SELECT, INSERT ON storage.objects TO anon, authenticated;""")
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):sql(path.read_text(),owner)
    q=lambda text,role=None,actor=None: sql(text,role,actor).stdout.strip()
    assert q("SELECT count(*) FROM request_types",'anon')=='9'
    passed('9 approved request types readable by the public form')
    fixture(S,'super@example.invalid');sql(f"SELECT app_private.bootstrap_superadmin('{S}')",owner)
    for identity,email in [(A,'admin@example.invalid'),(V,'viewer@example.invalid')]:
        fixture(identity,email);sql(f"SELECT app_private.provision_auth_profile('{identity}')",owner)
    sql(f"UPDATE public.users SET role='admin',is_active=true WHERE id='{A}'; UPDATE public.users SET is_active=true WHERE id='{V}';",owner)
    ids=lambda t,w:q(f"SELECT id FROM {t} WHERE {w}",owner)
    BA=ids('studios',"name='BUSINESS ACCOMPANYING SAC'");CR=ids('studios',"name='ESTUDIO CONTABLE CREY'")
    FAC=ids('catalog_systems',"name='Quipu_Fac'");OT=ids('catalog_systems',"name='Otros'")
    WEB=ids('catalog_subsystems',f"system_id='{FAC}' AND name='Web'");T=ids('request_types',"name='Mejora'")
    C000=ids('areas',"code='C000'");C001=ids('areas',"code='C001'")
    PROCONT=ids('studio_codes',"code='PROCONT'");CREY=ids('studio_codes',"code='CREY'")
    def submit(studio,system,role='anon'):
        p=json.dumps({'requester_name':'Persona ficticia','studio_id':studio,'system_id':system,'request_type_id':T,
                      'title':'Título ficticio','description':'Contenido ficticio','urgent_requested':True})
        r=sql(f"SELECT public.submit_client_request('{p}'::jsonb,gen_random_uuid())",role,ok=False)
        assert r.returncode==0,r.stderr;return json.loads(r.stdout)
    R_BA=submit(BA,FAC);R_CR=submit(CR,FAC);R_BA2=submit(BA,OT);R_CR2=submit(CR,OT)
    assert q(f"SELECT concat_ws('|',requester_area IS NULL,subsystem_id IS NULL,area_id IS NULL,urgent_requested,title,request_type) FROM requests WHERE id='{R_BA['id']}'",owner)=='t|t|t|t|Título ficticio|Mejora'
    passed('client submits without subproject, area or subarea; original data stored')
    denied('anon cannot use legacy submit_request',"SELECT public.submit_request('{}'::jsonb,gen_random_uuid())",'anon')
    denied('anon cannot use legacy classified submit',"SELECT public.submit_classified_request('{}'::jsonb,'{}'::jsonb,gen_random_uuid())",'anon')
    token=q(f"SELECT tracking_token FROM app_private.request_access WHERE request_id='{R_BA['id']}'",owner)
    t=json.loads(q(f"SELECT public.track_request('{R_BA['request_number']}','{token}')",'anon'))
    assert sorted(t)==['created_at','rejection_reason','request_number','status','title'],t
    passed('public tracking exposes only status data (no SLA, phases or classification)')
    sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES ('request-attachments','{R_BA['id']}/captura.png')",'anon')
    passed('client attaches evidence to own fresh request')
    denied('attachment to unknown request denied',"INSERT INTO storage.objects(bucket_id,name) VALUES ('request-attachments','00000000-0000-4000-8000-0000000000aa/x.png')",'anon')
    for i in range(4): sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES ('request-attachments','{R_BA['id']}/f{i}.pdf')",'anon')
    denied('attachment limit of 5 enforced',f"INSERT INTO storage.objects(bucket_id,name) VALUES ('request-attachments','{R_BA['id']}/f9.pdf')",'anon')
    assert q("SELECT count(*) FROM storage.objects",'anon')=='0'
    assert q("SELECT count(*) FROM storage.objects",'authenticated',V)=='5'
    passed('evidence readable only by internal members')
    cls=lambda rid,c,actor=A,ok=True:sql(f"SELECT public.classify_request('{rid}','{json.dumps(c)}'::jsonb)",'authenticated',actor,ok=ok)
    denied('viewer cannot classify',f"SELECT public.classify_request('{R_BA['id']}','{json.dumps({'studio_code_id':PROCONT})}'::jsonb)",'authenticated',V)
    r=cls(R_BA['id'],{'studio_code_id':CREY},ok=False);assert r.returncode and '22023' in r.stderr;passed('code must belong to the studio')
    r=cls(R_CR['id'],{'studio_code_id':CREY,'area_id':C000},ok=False);assert r.returncode and '22023' in r.stderr;passed('area not applicable to other studios')
    approve=lambda rid:sql(f"SELECT public.approve_request('{rid}','{json.dumps({'project_type':'development','priority':'high','assigned_dev':A,'assigned_admin':A})}'::jsonb,gen_random_uuid())",'authenticated',A,ok=False)
    denied('decision requires studio code',f"SELECT public.reject_request('{R_CR2['id']}','motivo')",'authenticated',A,code='23514')
    cls(R_BA['id'],{'studio_code_id':PROCONT,'subsystem_id':WEB})
    r=approve(R_BA['id']);assert r.returncode and '23514' in r.stderr;passed('BUSINESS ACCOMPANYING SAC requires area to accept')
    cls(R_BA['id'],{'studio_code_id':PROCONT,'subsystem_id':WEB,'area_id':C000,'subarea_id':C001})
    assert q(f"SELECT requester_area FROM requests WHERE id='{R_BA['id']}'",owner)=='CONTABILIDAD'
    r=approve(R_BA['id']);assert r.returncode==0,r.stderr
    assert q(f"SELECT p.priority||'|'||(p.sla_target_date IS NULL) FROM projects p JOIN requests r ON r.project_id=p.id WHERE r.id='{R_BA['id']}'",owner)=='high|true'
    passed('accept with code, area, subarea: work created with definitive priority and no inherited SLA')
    cls(R_BA2['id'],{'studio_code_id':PROCONT,'area_id':C000})
    r=approve(R_BA2['id']);assert r.returncode==0,r.stderr;passed('subarea optional to accept')
    cls(R_CR['id'],{'studio_code_id':CREY})
    r=approve(R_CR['id']);assert r.returncode and '23514' in r.stderr;passed('required subproject enforced when accepting')
    sql(f"SELECT public.reject_request('{R_CR['id']}','Fuera de alcance')",'authenticated',A)
    assert q(f"SELECT status||'|'||(project_id IS NULL)||'|'||(studio_code_id='{CREY}') FROM requests WHERE id='{R_CR['id']}'",owner)=='rejected|true|true'
    passed('reject with code and reason, without responsible or SLA')
    r=cls(R_CR['id'],{'studio_code_id':CREY},ok=False);assert r.returncode and '23514' in r.stderr
    denied('classification frozen after decision',f"UPDATE requests SET area_id=NULL WHERE id='{R_BA['id']}'",owner,code='23514')
    denied('original client data immutable',f"UPDATE requests SET title='Otro' WHERE id='{R_CR2['id']}'",owner,code='23514')
    ev=q(f"SELECT string_agg(action,',' ORDER BY id) FROM request_events WHERE request_id='{R_BA['id']}'",owner)
    assert ev=='submitted,classified,classified,approved',ev
    denied('anon cannot read request events',"SELECT * FROM request_events",'anon')
    passed('traceability: submitted, classified and decision events recorded')
    version=sql('SHOW server_version').stdout.strip()
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5);log.close()
evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'migration':'20261118000400_request_intake.sql','checks':checks,'passed':len(checks),'socket_only':True,'server_stopped':True,'synthetic_auth_stub_only':True,'storage_stub_only':True,'real_accounts_created':0,'remote_sql_executed':False,'previous_suites_repeated':False}
(ROOT/'docs/validation/request-intake-local.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} new checks passed; isolated PostgreSQL stopped.')
