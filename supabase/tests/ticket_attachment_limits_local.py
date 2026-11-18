#!/usr/bin/env python3
"""New four-file/2,500,000 actual-byte cases only. No hosted API or old suites."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
import getpass,json,os
from pathlib import Path
import subprocess,tempfile,time,uuid

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin',type=Path,required=True)
parser.add_argument('--runtime-lib',type=Path,required=True)
args=parser.parse_args()
work=Path(tempfile.mkdtemp(prefix='procont-byte-limits-',dir='/tmp'))
cluster=work/'cluster';socket=work/'socket';socket.mkdir(mode=0o700)
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib),PGPASSFILE=str(work/'no-pass'),PGSERVICEFILE=str(work/'no-service'))
base=[str(args.pg_bin/'psql'),'-X','--no-password','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq','-h',str(socket),'-p','55491','-U',getpass.getuser(),'-d','postgres']
owner='procont_byte_owner';server=None;checks=[]
def lit(value):return "'"+value.replace("'","''")+"'"
def sql(text,role=None,ok=True):
    result=subprocess.run(base,input=(f'SET ROLE {role};\n' if role else '')+text,env=env,text=True,capture_output=True)
    if ok and result.returncode:raise RuntimeError(result.stderr)
    return result
def q(text,role=None):return sql(text,role).stdout.strip()
def passed(name):checks.append(name);print('PASS '+name,flush=True)
def rejected(name,statement,role='anon',code='23514'):
    result=sql(statement,role,False)
    assert result.returncode and code in result.stderr,name+': expected rejection'
    passed(name)
def item(size,name='fixture.txt'):
    return {'upload_key':str(uuid.uuid4()),'file_name':name,'size_bytes':size,'mime_type':'text/plain'}
def batch(ticket,items,token=None):
    return f"SELECT public.reserve_request_attachments('{ticket['id']}','{token or ticket['tracking_token']}',{lit(json.dumps(items))}::jsonb)"
def upload(grant,size=None,mime='text/plain',probe=False):
    data={'mimetype':mime} if probe else {'size':grant['size_bytes'] if size is None else size,'mimetype':mime}
    return f"INSERT INTO storage.objects(bucket_id,name,metadata,user_metadata) VALUES('request-attachments',{lit(grant['path'])},{lit(json.dumps(data))}::jsonb,'{{\"size\":1}}'::jsonb)"
def committed(ticket):
    return json.loads(q(f"SELECT json_build_object('files',count(*),'bytes',coalesce(sum((metadata->>'size')::bigint),0)) FROM storage.objects WHERE bucket_id='request-attachments' AND split_part(name,'/',1)='{ticket['id']}'",owner))
try:
    subprocess.run([str(args.pg_bin/'initdb'),'-D',str(cluster),'-A','trust','--no-locale','-E','UTF8'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    log=(work/'server.log').open('w')
    server=subprocess.Popen([str(args.pg_bin/'postgres'),'-D',str(cluster),'-c','listen_addresses=','-c',f'unix_socket_directories={socket}','-c','wal_level=logical','-p','55491'],env=env,stdout=log,stderr=log)
    for _ in range(100):
        if sql('SELECT 1',ok=False).returncode==0:break
        if server.poll() is not None:raise RuntimeError('Isolated PostgreSQL exited')
        time.sleep(.05)
    else:raise RuntimeError('Isolated PostgreSQL unavailable')
    assert Path(q("SELECT current_setting('data_directory')")).resolve()==cluster
    assert q("SELECT current_setting('listen_addresses')")==''
    sql(f'CREATE ROLE {owner} NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; ALTER DATABASE postgres OWNER TO {owner};')
    sql((ROOT/'supabase/tests/support/auth_stub.sql').read_text())
    sql(f'ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz; GRANT USAGE ON SCHEMA auth TO {owner}; GRANT SELECT(id,email,raw_user_meta_data,email_confirmed_at),REFERENCES(id) ON auth.users TO {owner}; ALTER PUBLICATION supabase_realtime OWNER TO {owner};')
    sql(f"""CREATE SCHEMA storage AUTHORIZATION {owner};
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,metadata jsonb,user_metadata jsonb,UNIQUE(bucket_id,name));
      ALTER TABLE storage.buckets OWNER TO {owner}; ALTER TABLE storage.objects OWNER TO {owner};
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated;
      GRANT SELECT,INSERT ON storage.objects TO anon,authenticated;""")
    # Contrato de M9: cadena M1–M9 (migraciones posteriores se prueban en sus propias suites).
    migrations=[p for p in sorted((ROOT/'supabase/migrations').glob('*.sql')) if p.name<='20261118000500_ticket_security.sql']
    for path in migrations[:-1]:sql(path.read_text(),owner)
    studio=q('SELECT studio_id FROM studio_codes ORDER BY code LIMIT 1',owner)
    system=q("SELECT id FROM catalog_systems WHERE name='Otros'",owner)
    kind=q("SELECT id FROM request_types WHERE name='Otros'",owner)
    def ticket():
        payload={'requester_name':'Synthetic byte fixture','studio_id':studio,'system_id':system,'request_type_id':kind,'title':'Byte fixture','description':'Synthetic byte test','urgent_requested':False}
        return json.loads(q(f'SELECT public.submit_client_request({lit(json.dumps(payload))}::jsonb,gen_random_uuid())','anon'))
    legacy=ticket();unknown=ticket()
    sql(f"INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('request-attachments','{legacy['id']}/legacy.txt','{{\"size\":1500000,\"mimetype\":\"text/plain\"}}'); INSERT INTO storage.objects(bucket_id,name) VALUES('request-attachments','{unknown['id']}/unknown.txt')",owner)
    sql(migrations[-1].read_text(),owner)
    assert q("SELECT (NOT public)||':'||file_size_limit FROM storage.buckets WHERE id='request-attachments'",owner)=='true:2500000'
    passed('private bucket maximum is exactly 2500000 decimal bytes')
    exact=ticket();items=[item(x) for x in [1000000,750000,500000,250000]]
    grants=json.loads(q(batch(exact,items),'anon'))
    assert json.loads(q(batch(exact,items),'anon'))==grants
    assert q(f"SELECT count(*)||':'||sum(size_bytes) FROM app_private.request_attachment_grants WHERE request_id='{exact['id']}'",owner)=='4:2500000'
    passed('atomic four-file batch accepts exact total and idempotent retry consumes no extra quota')
    with ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(lambda g:sql(upload(g),'anon',False),grants))
    assert all(x.returncode==0 for x in results)
    assert committed(exact)=={'files':4,'bytes':2500000}
    passed('concurrent final writes at exact boundary commit four files and 2500000 actual bytes')
    rejected('fifth file is rejected even when zero bytes',batch(exact,[item(0)]))
    too_many=ticket()
    rejected('five-file batch is rejected',batch(too_many,[item(0) for _ in range(5)]),code='22023')
    over=ticket()
    rejected('combined total plus one byte rolls back whole batch',batch(over,[item(1500000),item(1000001)]))
    assert q(f"SELECT count(*) FROM app_private.request_attachment_grants WHERE request_id='{over['id']}'",owner)=='0'
    rejected('single file above total cap is rejected',batch(over,[item(2500001)]),code='22023')
    raced=ticket()
    with ThreadPoolExecutor(max_workers=3) as pool:
        results=list(pool.map(lambda _:sql(batch(raced,[item(1000000)]),'anon',False),range(3)))
    assert sum(x.returncode==0 for x in results)==2 and all(x.returncode==0 or '23514' in x.stderr for x in results)
    passed('parallel reservations cannot exceed combined byte quota')
    lied=ticket();g=json.loads(q(batch(lied,[item(1)]),'anon'))[0]
    rejected('actual size greater than declaration fails at commit despite user_metadata size',upload(g,1000000))
    rejected('changed compressed size below reservation also fails at commit',upload(g,0))
    rejected('actual size is mandatory at final commit',upload(g,probe=True))
    rejected('changed actual MIME fails at commit',upload(g,1,mime='application/pdf'))
    assert committed(lied)=={'files':0,'bytes':0}
    sql('BEGIN;'+upload(g,probe=True)+';ROLLBACK;','anon')
    passed('rolled-back Storage permission probe may omit size without committing a file')
    sql(upload(g,1),owner)
    passed('valid privileged Storage final write is checked and accepted')
    legacy_grant=json.loads(q(batch(legacy,[item(1000000)]),'anon'))[0]
    sql(upload(legacy_grant),'anon')
    assert committed(legacy)=={'files':2,'bytes':2500000}
    rejected('legacy actual bytes count toward the combined cap',batch(legacy,[item(1)]))
    rejected('unknown historical size requires review rather than zero-byte assumption',batch(unknown,[item(1)]))
    # Deliberately corrupt test-only reservation rows to exercise the independent
    # final-write guard, even if a privileged writer bypasses reservation logic.
    for sizes,label,expected in [([1000000]*3,'actual byte quota',2),([1]*5,'actual file count',4)]:
        target=ticket();forced=[]
        for index,size in enumerate(sizes):
            capability=str(uuid.uuid4());path=target['id']+'/'+capability+'-fixture.txt'
            sql(f"INSERT INTO app_private.request_attachment_grants(request_id,upload_key,file_name,mime_type,size_bytes,object_name,expires_at) VALUES('{target['id']}',gen_random_uuid(),'fixture.txt','text/plain',{size},{lit(path)},now()+interval '30 minutes')",owner)
            forced.append({'path':path,'size_bytes':size})
        with ThreadPoolExecutor(max_workers=5) as pool:
            results=list(pool.map(lambda g:sql(upload(g),owner,False),forced))
        assert sum(x.returncode==0 for x in results)==expected
        assert all(x.returncode==0 or '23514' in x.stderr for x in results)
        actual=committed(target);assert actual['files']<=4 and actual['bytes']<=2500000
        passed('privileged concurrent final writes independently enforce '+label)
    unauth=ticket()
    rejected('new batch still requires the private tracking token',batch(unauth,[item(1)],str(uuid.uuid4())),code='42501')
    expiry=ticket();eg=json.loads(q(batch(expiry,[item(1)]),'anon'))[0]
    sql(f"UPDATE public.requests SET created_at=now()-interval '31 minutes' WHERE id='{expiry['id']}'",owner)
    rejected('final privileged write cannot bypass thirty minute deadline',upload(eg),owner,code='42501')
    version=q('SHOW server_version')
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5);log.close()
evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'checks':checks,'passed':len(checks),
          'max_files':4,'max_total_bytes':2500000,'actual_server_metadata_checked_at_commit':True,
          'socket_only':True,'server_stopped':True,'synthetic_storage_auth_only':True,'hosted_http_upload_tested':False,
          'remote_sql_executed':False,'real_tickets_or_accounts_created':False,'previous_suites_repeated':False}
(ROOT/'docs/validation/ticket-attachment-limits-local.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(f'{len(checks)} new byte-limit checks passed; isolated PostgreSQL stopped.')
