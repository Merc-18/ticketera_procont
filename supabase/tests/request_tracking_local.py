#!/usr/bin/env python3
"""Request status tracking only (migration 20261118000600), isolated PostgreSQL socket."""
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
work=Path(tempfile.mkdtemp(prefix='procont-tracking-tests-',dir='/tmp'))
cluster=work/'cluster';socket=work/'socket';socket.mkdir(mode=0o700)
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib),PGPASSFILE=str(work/'no-password-file'),PGSERVICEFILE=str(work/'no-service-file'))
base=[str(args.pg_bin/'psql'),'-X','--no-password','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq','-h',str(socket),'-p','55487','-U',getpass.getuser(),'-d','postgres']
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
owner='procont_tracking_owner'
try:
    subprocess.run([str(args.pg_bin/'initdb'),'-D',str(cluster),'-A','trust','--no-locale','-E','UTF8'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    log=(work/'server.log').open('w')
    server=subprocess.Popen([str(args.pg_bin/'postgres'),'-D',str(cluster),'-c','listen_addresses=','-c',f'unix_socket_directories={socket}','-c','wal_level=logical','-p','55487'],env=env,stdout=log,stderr=log)
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
    M10='20261118000600_request_tracking.sql'
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if path.name<M10:sql(path.read_text(),owner)
    q=lambda text,role=None,actor=None: sql(text,role,actor).stdout.strip()
    ids=lambda t,w:q(f"SELECT id FROM {t} WHERE {w}",owner)
    BA=ids('studios',"name='BUSINESS ACCOMPANYING SAC'");CR=ids('studios',"name='ESTUDIO CONTABLE CREY'")
    OT=ids('catalog_systems',"name='Otros'");T=ids('request_types',"name='Mejora'")
    C000=ids('areas',"code='C000'");PROCONT=ids('studio_codes',"code='PROCONT'");CREY=ids('studio_codes',"code='CREY'")
    def submit(studio):
        p=json.dumps({'requester_name':'Persona ficticia','studio_id':studio,'system_id':OT,'request_type_id':T,'title':'Título ficticio','description':'Contenido ficticio'})
        return json.loads(q(f"SELECT public.submit_client_request('{p}'::jsonb,gen_random_uuid())",'anon'))
    R0=submit(CR)   # solicitud existente antes de la migración 10
    before=q(f"SELECT updated_at FROM requests WHERE id='{R0['id']}'",owner)
    sql((ROOT/'supabase/migrations'/M10).read_text(),owner)
    assert q(f"SELECT details->>'to'||'|'||(details->>'cause') FROM request_events WHERE request_id='{R0['id']}' AND action='status_changed'",owner)=='received|baseline'
    assert q(f"SELECT updated_at FROM requests WHERE id='{R0['id']}'",owner)==before
    passed('existing requests get a baseline status event without being modified')
    fixture(S,'super@example.invalid');sql(f"SELECT app_private.bootstrap_superadmin('{S}')",owner)
    for identity,email in [(A,'admin@example.invalid'),(V,'viewer@example.invalid')]:
        fixture(identity,email);sql(f"SELECT app_private.provision_auth_profile('{identity}')",owner)
    sql(f"UPDATE public.users SET role='admin',is_active=true WHERE id='{A}'; UPDATE public.users SET is_active=true WHERE id='{V}';",owner)
    track=lambda n,ip='10.0.0.1':q(f"SELECT public.track_request_status('{n}') FROM (SELECT set_config('request.headers','{json.dumps({'x-forwarded-for':ip})}',false)) h",'anon')
    status=lambda rid:q(f"SELECT details->>'to' FROM request_events WHERE request_id='{rid}' AND action='status_changed' ORDER BY id DESC LIMIT 1",owner)
    R=submit(BA)
    t=json.loads(track(R['request_number']));assert t=={'request_number':R['request_number'],'status':'received'},t
    passed('public tracking by REQ only returns number and general status')
    assert track('REQ99-999')=='' and track('abc')=='' and track(R['id'])==''
    passed('unknown, malformed or UUID lookups return a minimal empty response')
    denied('viewer cannot start review',f"SELECT public.start_request_review('{R['id']}')",'authenticated',V)
    denied('anon cannot start review',f"SELECT public.start_request_review('{R['id']}')",'anon')
    sql(f"SELECT public.start_request_review('{R['id']}'); SELECT public.start_request_review('{R['id']}')",'authenticated',A)
    assert status(R['id'])=='in_review' and q(f"SELECT count(*) FROM request_events WHERE request_id='{R['id']}' AND action='review_started'",owner)=='1'
    passed('review start (idempotent) moves to in_review with the validator recorded')
    sql(f"SELECT public.classify_request('{R['id']}','{json.dumps({'studio_code_id':PROCONT,'area_id':C000})}'::jsonb)",'authenticated',A)
    sql(f"SELECT public.approve_request('{R['id']}','{json.dumps({'project_type':'dual','priority':'high','assigned_dev':A,'assigned_admin':A})}'::jsonb,gen_random_uuid())",'authenticated',A)
    P=q(f"SELECT project_id FROM requests WHERE id='{R['id']}'",owner)
    assert status(R['id'])=='approved_backlog' and q(f"SELECT string_agg(current_phase,',') FROM project_flows WHERE project_id='{P}'",owner)=='backlog,backlog'
    passed('approval places the work in Backlog: approved_backlog')
    phase=lambda ft,ph:sql(f"UPDATE project_flows SET current_phase='{ph}' WHERE project_id='{P}' AND flow_type='{ft}'",'authenticated',A)
    phase('administrative','ready_to_start')
    assert status(R['id'])=='in_progress';passed('leaving Backlog to ANY active phase (ready_to_start) means in_progress')
    sql(f"UPDATE projects SET is_blocked=true,blocked_reason='Espera de información del cliente',blocked_since=now() WHERE id='{P}'",'authenticated',A)
    assert status(R['id'])=='blocked' and json.loads(track(R['request_number'],'10.0.0.2'))['status']=='blocked'
    assert q(f"SELECT current_phase FROM project_flows WHERE project_id='{P}' AND flow_type='administrative'",owner)=='ready_to_start'
    passed('blocking shows blocked publicly and keeps the technical phase')
    sql(f"UPDATE projects SET is_blocked=false,blocked_reason=NULL,blocked_since=NULL WHERE id='{P}'",'authenticated',A)
    assert status(R['id'])=='in_progress';passed('unblocking restores in_progress from the current phase')
    phase('administrative','backlog')
    assert status(R['id'])=='approved_backlog';passed('moving back to Backlog is recorded (regression)')
    sql(f"UPDATE projects SET is_blocked=true,blocked_reason='Dependencia externa',blocked_since=now() WHERE id='{P}'",'authenticated',A)
    assert status(R['id'])=='blocked'
    sql(f"UPDATE projects SET is_blocked=false WHERE id='{P}'",'authenticated',A)
    assert status(R['id'])=='approved_backlog';passed('blocked from Backlog returns to approved_backlog')
    phase('development','done');assert status(R['id'])=='in_progress'
    phase('administrative','deployed');assert status(R['id'])=='done'
    passed('done only when every flow reaches its final phase')
    b=q(f"SELECT string_agg(action||':'||coalesce(details->>'reason','')||':'||(actor_id='{A}'),' | ' ORDER BY id) FROM request_events WHERE request_id='{R['id']}' AND action IN ('blocked','unblocked')",owner)
    assert b=='blocked:Espera de información del cliente:true | unblocked:Espera de información del cliente:true | blocked:Dependencia externa:true | unblocked:Dependencia externa:true',b
    passed('block history keeps reason, responsible and dates after completion')
    seq=q(f"SELECT string_agg(details->>'to',',' ORDER BY id) FROM request_events WHERE request_id='{R['id']}' AND action='status_changed'",owner)
    assert seq=='received,in_review,approved_backlog,in_progress,blocked,in_progress,approved_backlog,blocked,approved_backlog,in_progress,done',seq
    assert q(f"SELECT count(*) FROM request_events WHERE request_id='{R['id']}' AND action='phase_changed'",owner)=='4'
    passed('full server-side transition and phase history recorded')
    R2=submit(CR)
    sql(f"SELECT public.classify_request('{R2['id']}','{json.dumps({'studio_code_id':CREY})}'::jsonb); SELECT public.reject_request_with_notes('{R2['id']}','Fuera de alcance','Nota interna')",'authenticated',A)
    t=json.loads(track(R2['request_number'],'10.0.0.3'));assert t=={'request_number':R2['request_number'],'status':'rejected'},t
    assert status(R2['id'])=='rejected' and q(f"SELECT project_id IS NULL FROM requests WHERE id='{R2['id']}'",owner)=='t'
    passed('rejection path: rejected, no backlog, no reason exposed publicly')
    for _ in range(10): track(R['request_number'],'10.0.0.9')
    assert json.loads(track(R['request_number'],'10.0.0.9'))=={'rate_limited':True}
    assert json.loads(track(R['request_number'],'10.0.0.10'))['status']=='done'
    passed('per-client rate limit blocks enumeration bursts without affecting others')
    denied('anon cannot read internal timeline',"SELECT * FROM request_events",'anon')
    assert int(q(f"SELECT count(*) FROM request_events WHERE request_id='{R['id']}'",'authenticated',V))>10
    passed('internal members read the timeline')
    version=sql('SHOW server_version').stdout.strip()
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5);log.close()
evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'migration':'20261118000600_request_tracking.sql','checks':checks,'passed':len(checks),'socket_only':True,'server_stopped':True,'synthetic_auth_stub_only':True,'storage_stub_only':True,'real_accounts_created':0,'remote_sql_executed':False,'previous_suites_repeated':False}
(ROOT/'docs/validation/request-tracking-local.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} new checks passed; isolated PostgreSQL stopped.')
