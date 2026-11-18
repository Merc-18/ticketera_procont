#!/usr/bin/env python3
"""Cycle/Lead Time comparable cohort (migration 20261118000700), isolated PostgreSQL socket."""
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
work=Path(tempfile.mkdtemp(prefix='procont-cohort-tests-',dir='/tmp'))
cluster=work/'cluster';socket=work/'socket';socket.mkdir(mode=0o700)
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib),PGPASSFILE=str(work/'no-password-file'),PGSERVICEFILE=str(work/'no-service-file'))
base=[str(args.pg_bin/'psql'),'-X','--no-password','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq','-h',str(socket),'-p','55489','-U',getpass.getuser(),'-d','postgres']
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
owner='procont_cohort_owner'
try:
    subprocess.run([str(args.pg_bin/'initdb'),'-D',str(cluster),'-A','trust','--no-locale','-E','UTF8'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    log=(work/'server.log').open('w')
    server=subprocess.Popen([str(args.pg_bin/'postgres'),'-D',str(cluster),'-c','listen_addresses=','-c',f'unix_socket_directories={socket}','-c','wal_level=logical','-p','55489'],env=env,stdout=log,stderr=log)
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
    ids=lambda t,w:q(f"SELECT id FROM {t} WHERE {w}",owner)
    CR=ids('studios',"name='ESTUDIO CONTABLE CREY'");OT=ids('catalog_systems',"name='Otros'")
    T=ids('request_types',"name='Mejora'");CREY=ids('studio_codes',"code='CREY'")
    fixture(S,'super@example.invalid');sql(f"SELECT app_private.bootstrap_superadmin('{S}')",owner)
    fixture(A,'admin@example.invalid');sql(f"SELECT app_private.provision_auth_profile('{A}')",owner)
    sql(f"UPDATE public.users SET role='admin',is_active=true WHERE id='{A}'",owner)
    def ticket(name,board):
        p=json.dumps({'requester_name':name,'studio_id':CR,'system_id':OT,'request_type_id':T,'title':'Ficticio','description':'Ficticio'})
        r=json.loads(q(f"SELECT public.submit_client_request('{p}'::jsonb,gen_random_uuid())",'anon'))
        sql(f"SELECT public.classify_request('{r['id']}','{json.dumps({'studio_code_id':CREY})}'::jsonb)",'authenticated',A)
        sql(f"SELECT public.approve_request('{r['id']}','{json.dumps({'project_type':board,'priority':'medium','assigned_dev':A,'assigned_admin':A})}'::jsonb,gen_random_uuid())",'authenticated',A)
        sql(f"UPDATE requests SET created_at='2026-11-01 10:00Z' WHERE id='{r['id']}'",owner)
        return r['id'],q(f"SELECT project_id FROM requests WHERE id='{r['id']}'",owner)
    def at(rid,stmt,ts):
        before=q(f"SELECT coalesce(max(id),0) FROM request_events WHERE request_id='{rid}'",owner)
        sql(stmt,'authenticated',A)
        sql(f"UPDATE request_events SET created_at='{ts}' WHERE request_id='{rid}' AND id>{before}",owner)
    def phase(rid,pid,ft,ph,ts): at(rid,f"UPDATE project_flows SET current_phase='{ph}' WHERE project_id='{pid}' AND flow_type='{ft}'",ts)
    # T1: espera 2 días en Backlog; flujos simultáneos (dual); bloqueo intermedio. Cycle 4d, Lead 6d.
    t1,p1=ticket('Persona Uno','dual')
    phase(t1,p1,'development','design','2026-11-03 10:00Z')
    phase(t1,p1,'administrative','ready_to_start','2026-11-04 10:00Z')
    at(t1,f"UPDATE projects SET is_blocked=true,blocked_reason='Espera' WHERE id='{p1}'",'2026-11-04 12:00Z')
    at(t1,f"UPDATE projects SET is_blocked=false WHERE id='{p1}'",'2026-11-05 09:00Z')
    phase(t1,p1,'development','done','2026-11-05 10:00Z')
    phase(t1,p1,'administrative','deployed','2026-11-07 10:00Z')
    # T2: reapertura (vuelve a Backlog tras terminar) y nuevo cierre. Cycle 5d (primer inicio), Lead 7d.
    t2,p2=ticket('Persona Dos','development')
    phase(t2,p2,'development','dev','2026-11-03 10:00Z')
    phase(t2,p2,'development','done','2026-11-04 10:00Z')
    phase(t2,p2,'development','backlog','2026-11-05 10:00Z')
    phase(t2,p2,'development','testing','2026-11-06 10:00Z')
    phase(t2,p2,'development','done','2026-11-08 10:00Z')
    # T3: terminado sin salida de Backlog registrada → solo Lead (2d); queda fuera de la cohorte.
    t3,p3=ticket('Persona Tres','development')
    at(t3,f"UPDATE projects SET status='completed' WHERE id='{p3}'",'2026-11-03 10:00Z')
    # T4: en proceso, sin terminar → fuera de todo.
    t4,p4=ticket('Persona Cuatro','development')
    phase(t4,p4,'development','dev','2026-11-02 10:00Z')
    perf={r['request_id']:r for r in json.loads(q("SELECT jsonb_agg(to_jsonb(m)) FROM public.get_ticket_performance() m",'authenticated',A))}
    assert (perf[t1]['cycle_time_seconds'],perf[t1]['lead_time_seconds'])==(4*86400,6*86400),perf[t1]
    assert (perf[t2]['cycle_time_seconds'],perf[t2]['lead_time_seconds'])==(5*86400,7*86400),perf[t2]
    assert perf[t3]['cycle_time_seconds'] is None and perf[t3]['lead_time_seconds']==2*86400 and perf[t3]['metric_status']=='missing_start'
    assert perf[t4]['metric_status']=='not_completed'
    assert all(r['lead_time_seconds']>=r['cycle_time_seconds'] for r in perf.values() if r['cycle_time_seconds'] is not None and r['lead_time_seconds'] is not None)
    passed('per ticket: Backlog wait, simultaneous flows, blocking and reopening; Lead >= Cycle')
    avg=json.loads(q("SELECT public.metrics_time_averages(NULL,NULL)",'authenticated',A))
    assert avg['completed_count']==3 and avg['cycle_sample_size']==2 and avg['lead_sample_size']==2 and avg['excluded_count']==1 and avg['cohort']=='paired_complete',avg
    assert abs(avg['avg_cycle_time_days']-4.5)<1e-9 and abs(avg['avg_lead_time_days']-6.5)<1e-9,avg
    assert avg['avg_lead_time_days']>=avg['avg_cycle_time_days']
    passed('averages use the same paired cohort (Lead-only ticket excluded): Cycle 4.5d, Lead 6.5d')
    naive=json.loads(q("SELECT jsonb_build_object('c',avg(cycle_time_seconds)/86400,'l',avg(lead_time_seconds)/86400) FROM app_private.ticket_performance(NULL) WHERE general_status='done'",owner))
    assert abs(naive['l']-5.0)<1e-9 and abs(naive['c']-4.5)<1e-9
    passed('documented: mixing cohorts would have averaged Lead over 3 tickets (5.0d) vs Cycle over 2 (4.5d)')
    sql(f"UPDATE projects SET status='active' WHERE id='{p3}'",'authenticated',A)
    empty=json.loads(q(f"SELECT public.metrics_time_averages(NULL,'{ids('studios',"name='COMUNIDAD CAMPESINA DE UNTUCA'")}')",'authenticated',A))
    assert empty['avg_cycle_time_days'] is None and empty['avg_lead_time_days'] is None and empty['completed_count']==0
    passed('no finished tickets: averages null (UI «Sin datos suficientes»)')
    denied('anon cannot read averages',"SELECT public.metrics_time_averages(NULL,NULL)",'anon')
    version=sql('SHOW server_version').stdout.strip()
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5);log.close()
evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'migration':'20261118000700_business_metrics.sql','checks':checks,'passed':len(checks),'socket_only':True,'server_stopped':True,'synthetic_data_only':True,'remote_sql_executed':False}
(ROOT/'docs/validation/metrics-cohort-local.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} new checks passed; isolated PostgreSQL stopped.')
