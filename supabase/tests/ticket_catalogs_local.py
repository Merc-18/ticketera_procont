#!/usr/bin/env python3
"""Ticket catalogs and classification only (migration 20261118000300), isolated PostgreSQL socket."""
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
work=Path(tempfile.mkdtemp(prefix='procont-catalog-tests-',dir='/tmp'))
cluster=work/'cluster';socket=work/'socket';socket.mkdir(mode=0o700)
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib),PGPASSFILE=str(work/'no-password-file'),PGSERVICEFILE=str(work/'no-service-file'))
base=[str(args.pg_bin/'psql'),'-X','--no-password','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq','-h',str(socket),'-p','55483','-U',getpass.getuser(),'-d','postgres']
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
owner='procont_catalog_owner'
try:
    subprocess.run([str(args.pg_bin/'initdb'),'-D',str(cluster),'-A','trust','--no-locale','-E','UTF8'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    log=(work/'server.log').open('w')
    server=subprocess.Popen([str(args.pg_bin/'postgres'),'-D',str(cluster),'-c','listen_addresses=','-c',f'unix_socket_directories={socket}','-c','wal_level=logical','-p','55483'],env=env,stdout=log,stderr=log)
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
    q=lambda text,role=None,actor=None: sql(text,role,actor).stdout.strip()
    counts=q("SELECT concat_ws(',',(SELECT count(*) FROM catalog_systems),(SELECT count(*) FROM catalog_subsystems),(SELECT count(*) FROM studios),(SELECT count(*) FROM studio_codes),(SELECT count(*) FROM areas WHERE parent_id IS NULL),(SELECT count(*) FROM areas WHERE parent_id IS NOT NULL),(SELECT count(*) FROM catalog_systems WHERE name='Quipu'))",owner)
    assert counts=='7,8,9,14,5,14,1',counts
    passed('seed catalogs: 7 systems, 8 subprojects, 9 studios, 14 codes, 5 areas, 14 subareas')
    assert q("SELECT count(DISTINCT ruc) FROM studios WHERE name IN ('BUSINESS ACCOMPANYING SAC','INVERSIONES Y SERVICIOS MULTIPLES SAN ROMAN SA') AND review_note IS NOT NULL",owner)=='1'
    passed('shared RUC kept as separate studios with review note')
    assert q("SELECT count(*) FROM studios",'anon')=='9'
    denied('anon cannot read RUC',"SELECT ruc FROM studios",'anon')
    denied('anon cannot read studio codes',"SELECT code FROM studio_codes",'anon')
    fixture(S,'super@example.invalid');sql(f"SELECT app_private.bootstrap_superadmin('{S}')",owner)
    for identity,email in [(A,'admin@example.invalid'),(V,'viewer@example.invalid')]:
        fixture(identity,email);sql(f"SELECT app_private.provision_auth_profile('{identity}')",owner)
    sql(f"UPDATE public.users SET role='admin',is_active=true WHERE id='{A}'; UPDATE public.users SET is_active=true WHERE id='{V}';",owner)
    ids=lambda t,w:q(f"SELECT id FROM {t} WHERE {w}",owner)
    BA=ids('studios',"name='BUSINESS ACCOMPANYING SAC'");CR=ids('studios',"name='ESTUDIO CONTABLE CREY'")
    FAC=ids('catalog_systems',"name='Quipu_Fac'");OT=ids('catalog_systems',"name='Otros'")
    WEB=ids('catalog_subsystems',f"system_id='{FAC}' AND name='Web'");NEG_WEB=q("SELECT s.id FROM catalog_subsystems s JOIN catalog_systems y ON y.id=s.system_id WHERE y.name='Negmin' AND s.name='Web'",owner)
    C000=ids('areas',"code='C000'");C001=ids('areas',"code='C001'");L001=ids('areas',"code='L001'");AD00=ids('areas',"code='AD00'")
    payload="'{\"requester_name\":\"Persona ficticia\",\"request_type\":\"Prueba\",\"description\":\"Contenido ficticio\",\"origin\":\"Interno\"}'::jsonb"
    def submit(cls,role='anon'):
        return sql(f"SELECT public.submit_classified_request({payload},'{json.dumps(cls)}'::jsonb,gen_random_uuid())->>'id'",role,ok=False)
    r=submit({'studio_id':BA,'system_id':FAC,'subsystem_id':WEB,'area_id':C000,'subarea_id':C001})
    assert r.returncode==0,r.stderr; R1=r.stdout.strip()
    assert q(f"SELECT requester_area||'|'||(studio_id='{BA}')||'|'||(subarea_id='{C001}') FROM requests WHERE id='{R1}'",owner)=='CONTABILIDAD / TRANSPORTES|true|true'
    passed('anon submits classified ticket with area/subarea')
    for name,cls in [('BA requires area',{'studio_id':BA,'system_id':OT}),
                     ('area with subareas requires subarea',{'studio_id':BA,'system_id':OT,'area_id':C000}),
                     ('subarea must belong to area',{'studio_id':BA,'system_id':OT,'area_id':C000,'subarea_id':L001}),
                     ('other studio cannot use areas',{'studio_id':CR,'system_id':OT,'area_id':C000}),
                     ('system requiring subproject rejects missing one',{'studio_id':CR,'system_id':FAC}),
                     ('subproject must belong to system',{'studio_id':CR,'system_id':FAC,'subsystem_id':NEG_WEB})]:
        r=submit(cls);assert r.returncode and '22023' in r.stderr,name;passed(name)
    r=submit({'studio_id':BA,'system_id':OT,'area_id':AD00});assert r.returncode==0,r.stderr;passed('area without subareas accepted')
    r=submit({'studio_id':CR,'system_id':OT});assert r.returncode==0,r.stderr;R2=r.stdout.strip()
    assert q(f"SELECT requester_area FROM requests WHERE id='{R2}'",owner)=='ESTUDIO CONTABLE CREY'
    passed('studio without areas and system without subproject accepted')
    denied('decision requires studio code',f"SELECT public.reject_request('{R1}','motivo')",'authenticated',A,code='23514')
    CR_CODE=ids('studio_codes',"code='CREY'");PROCONT=ids('studio_codes',"code='PROCONT'")
    denied('code must belong to request studio',f"SELECT public.assign_request_studio_code('{R1}','{CR_CODE}')",'authenticated',A,code='22023')
    denied('viewer cannot assign code',f"SELECT public.assign_request_studio_code('{R1}','{PROCONT}')",'authenticated',V)
    sql(f"SELECT public.assign_request_studio_code('{R1}','{PROCONT}'); SELECT public.reject_request('{R1}','motivo')",'authenticated',A)
    assert q(f"SELECT status||'|'||(studio_code_id='{PROCONT}')||'|'||(classified_by='{A}')||'|'||requester_area FROM requests WHERE id='{R1}'",owner)=='rejected|true|true|CONTABILIDAD / TRANSPORTES'
    passed('admin assigns code and decision keeps code and original data')
    denied('code frozen after decision',f"UPDATE requests SET studio_code_id=NULL WHERE id='{R1}'",owner,code='23514')
    denied('original classification immutable',f"UPDATE requests SET studio_id='{BA}' WHERE id='{R2}'",owner,code='23514')
    legacy=sql("SELECT public.submit_request('{\"requester_name\":\"Persona ficticia\",\"requester_area\":\"Texto libre\",\"request_type\":\"Prueba\",\"description\":\"Contenido ficticio\"}'::jsonb,gen_random_uuid())->>'id'",'anon').stdout.strip()
    sql(f"SELECT public.reject_request('{legacy}','motivo')",'authenticated',A)
    passed('legacy unclassified request flow unchanged')
    denied('admin cannot edit catalogs',"INSERT INTO studios(name) VALUES ('Nuevo')",'authenticated',A)
    sql(f"INSERT INTO studio_codes(studio_id,code) VALUES ('{CR}','CREY2'); UPDATE catalog_subsystems SET is_active=false WHERE id='{WEB}'",'authenticated',S)
    passed('superadmin edits catalogs')
    denied('catalog delete not permitted',"DELETE FROM studio_codes",'authenticated',S)
    denied('subarea parent must share studio',f"INSERT INTO areas(name,parent_id) VALUES ('X','{C000}')",'authenticated',S,code='23514')
    denied('area studio/parent immutable',f"UPDATE areas SET parent_id=NULL WHERE id='{C001}'",owner,code='23514')
    assert q(f"SELECT count(*) FROM catalog_subsystems WHERE id='{WEB}'",'anon')=='0'
    passed('inactive subproject hidden from public form')
    version=sql('SHOW server_version').stdout.strip()
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5);log.close()
evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'migration':'20261118000300_ticket_catalogs.sql','checks':checks,'passed':len(checks),'socket_only':True,'server_stopped':True,'synthetic_auth_stub_only':True,'real_accounts_created':0,'remote_sql_executed':False,'previous_suites_repeated':False}
(ROOT/'docs/validation/ticket-catalogs-local.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} new checks passed; isolated PostgreSQL stopped.')
