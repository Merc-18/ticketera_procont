#!/usr/bin/env python3
"""M13 only, PostgreSQL 17 disposable Unix socket, synthetic accounts and tickets.

M1-M12 are fixture setup; none of their previous test suites are invoked.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import getpass
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
M13 = '20261119000100_client_access.sql'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
args = parser.parse_args()
work = Path(tempfile.mkdtemp(prefix='procont-client-m13-', dir='/tmp'))
cluster, socket = work/'cluster', work/'socket'
socket.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-pass'), PGSERVICEFILE=str(work/'no-service'))
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
        '-Atq', '-h', str(socket), '-p', '55513', '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_client_owner'
checks, server = [], None

def lit(value): return 'NULL' if value is None else "'"+str(value).replace("'", "''")+"'"
def data(value): return lit(json.dumps(value, ensure_ascii=False))+'::jsonb'
def sql(text, role=None, actor=None):
    prefix = (f'SET ROLE {role};\n' if role else '') + (f"SET request.jwt.claim.sub={lit(actor)};\n" if actor else '')
    return subprocess.run(base, input=prefix+text, env=env, text=True, capture_output=True)
def q(text, role=owner, actor=None):
    result = sql(text, role, actor)
    if result.returncode: raise RuntimeError(result.stderr)
    return result.stdout.strip()
def j(text, role='anon', actor=None): return json.loads(q(text, role, actor))
def passed(name): checks.append(name); print('PASS '+name, flush=True)
def denied(text, code='42501', role='anon', actor=None):
    result = sql(text, role, actor)
    assert result.returncode != 0 and code in result.stderr, result.stderr or 'unexpected success'
def digest(token): return hashlib.sha256(token.encode()).hexdigest()
def key(): return secrets.token_hex(32)
def rpc(name, *values): return 'SELECT public.'+name+'('+','.join(lit(v) for v in values)+')'
def session(provider='quipu', ruc='20000000001', subject='fixture-A', source='provider_id', username='FixtureA'):
    token = key()
    if provider == 'quipufac': subject, source, username = 'company', 'company', None
    q(f"SELECT public.client_open_session({lit(provider)},{lit(ruc)},{lit(subject)},{lit(source)},{lit(username)},'Verified fixture name',"
      f"'{digest(token)}',now()+interval '8 hours')", 'service_role')
    return token
def info(token): return j(rpc('client_session_info',token))
def products(token): return j(rpc('client_products',token))
def ticket_payload(system=None, name='Declared fixture person'):
    return {'requester_name':name,'system_id':system or quipu,'request_type_id':typ,
            'title':'Synthetic M13 ticket','description':'Fictitious request only','urgent_requested':True}
def submit(token, payload=None, idem=None):
    return j(f"SELECT public.client_submit_request({lit(token)},{data(payload or ticket_payload())},{lit(idem)}::uuid)" if idem else
             f"SELECT public.client_submit_request({lit(token)},{data(payload or ticket_payload())},gen_random_uuid())")
def issue(provider, token, ruc='20000000001', subject='fixture-A', source='provider_id', username='FixtureA'):
    if provider=='quipufac': subject, source, username='company','company',None
    q(f"SELECT public.client_issue_entry_code({lit(provider)},{lit(ruc)},{lit(subject)},{lit(source)},{lit(username)},NULL,"
      f"'{digest(token)}',now()+interval '1 minute')", 'service_role')
def exchange(provider, code):
    token=key()
    q(f"SELECT public.client_exchange_entry_code({lit(provider)},'{digest(code)}','{digest(token)}',now()+interval '8 hours')", 'service_role')
    return token

try:
    subprocess.run([str(args.pg_bin/'initdb'),'-D',str(cluster),'-A','trust','--locale=C.UTF-8','-E','UTF8'],
                   env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    log=(work/'server.log').open('w')
    server=subprocess.Popen([str(args.pg_bin/'postgres'),'-D',str(cluster),'-c','listen_addresses=',
      '-c',f'unix_socket_directories={socket}','-c','wal_level=logical','-p','55513'],env=env,stdout=log,stderr=log)
    for _ in range(100):
        if sql('SELECT 1').returncode==0: break
        if server.poll() is not None: raise RuntimeError('Isolated PostgreSQL exited')
        time.sleep(.05)
    else: raise RuntimeError('Isolated PostgreSQL unavailable')
    assert Path(q("SHOW data_directory",None)).resolve()==cluster
    assert q('SHOW listen_addresses',None)==''
    q(f'CREATE ROLE {owner} NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; ALTER DATABASE postgres OWNER TO {owner};',None)
    q((ROOT/'supabase/tests/support/auth_stub.sql').read_text(),None)
    q(f'ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz; GRANT USAGE ON SCHEMA auth TO {owner}; GRANT SELECT(id,email,raw_user_meta_data,email_confirmed_at),REFERENCES(id) ON auth.users TO {owner}; ALTER PUBLICATION supabase_realtime OWNER TO {owner};',None)
    q(f'''CREATE SCHEMA storage AUTHORIZATION {owner};
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,created_at timestamptz DEFAULT now(),metadata jsonb DEFAULT '{{}}'::jsonb);
      ALTER TABLE storage.buckets OWNER TO {owner}; ALTER TABLE storage.objects OWNER TO {owner};
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated; GRANT SELECT,INSERT ON storage.objects TO anon,authenticated;''',None)
    paths=sorted((ROOT/'supabase/migrations').glob('*.sql'))
    assert len(paths)==13 and paths[-1].name==M13
    for path in paths[:-1]: q(path.read_text())
    admin='00000000-0000-4000-8000-000000000013'
    q(f"INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES('{admin}','fixture-admin@example.invalid','{{\"full_name\":\"Synthetic admin\"}}',now())",None)
    q(f"SELECT app_private.bootstrap_superadmin('{admin}')")
    st=q("INSERT INTO public.studios(name,ruc) VALUES('Synthetic unique client','20000000001') RETURNING id")
    ambiguous=[q(f"INSERT INTO public.studios(name,ruc) VALUES('Synthetic ambiguous {n}','20000000002') RETURNING id") for n in range(2)]
    quipu=q("SELECT id FROM public.catalog_systems WHERE name='Quipu'")
    fac=q("SELECT id FROM public.catalog_systems WHERE name='Quipu_Fac'")
    typ=q("SELECT id FROM public.request_types WHERE name='Mejora'")
    legacy=j(f"SELECT public.submit_client_request({data(ticket_payload()|{'studio_id':st})},gen_random_uuid())")
    old_row=q(f"SELECT to_jsonb(r) FROM public.requests r WHERE id='{legacy['id']}'")
    old_users=q('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u')
    q(paths[-1].read_text())
    assert old_row==q(f"SELECT to_jsonb(r) FROM public.requests r WHERE id='{legacy['id']}'")
    assert old_users==q('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u')
    passed('M13 applies without changing historical ticket or staff profiles/roles')

    a=session(); b=session(subject='fixture-B',username='FixtureB'); company=session('quipufac'); company2=session('quipufac')
    assert info(a)['identity']['kind']=='user' and info(company)['identity']['kind']=='company'
    assert info(company)['identity']['id']==info(company2)['identity']['id']
    assert info(a)['identity']['id']!=info(b)['identity']['id']
    assert q('SELECT count(*) FROM app_private.client_companies')=='1'
    passed('Quipu users and QuipuFac company account have distinct authenticated scopes')
    renamed=session(subject='fixture-A',username='FixtureRenamed')
    assert info(renamed)['identity']['id']==info(a)['identity']['id']
    fallback=session(subject='User',source='username',username='User')
    fallback2=session(subject='user',source='username',username='user')
    assert info(fallback)['identity']['id']!=info(fallback2)['identity']['id']
    passed('stable provider id survives username change; fallback preserves distinct case-sensitive users')
    denied("SELECT public.client_open_session('quipufac','20000000001','company','company',NULL,NULL,repeat('a',64),now()+interval '8 hours')")
    denied("SELECT public.client_issue_entry_code('quipufac','20000000001','company','company',NULL,NULL,repeat('a',64),now()+interval '1 minute')")
    passed('anonymous caller cannot mint sessions or platform entry codes')

    platform={}
    for provider in ['quipu','quipufac']:
        code=key();issue(provider,code)
        denied(f"SELECT public.client_exchange_entry_code({lit('quipufac' if provider=='quipu' else 'quipu')},'{digest(code)}','{digest(key())}',now()+interval '8 hours')",role='service_role')
        platform[provider]=exchange(provider,code)
        denied(f"SELECT public.client_exchange_entry_code({lit(provider)},'{digest(code)}','{digest(key())}',now()+interval '8 hours')",role='service_role')
    passed('platform codes bind provider, are single-use and cannot widen direct access')
    active=int(q('SELECT count(*) FROM public.catalog_systems WHERE is_active'))
    assert len(products(a))==active
    assert len(products(company))==active-1 and quipu not in [x['id'] for x in products(company)]
    assert [p['id'] for p in products(platform['quipu'])]==[quipu]
    assert [p['id'] for p in products(platform['quipufac'])]==[fac]
    passed('all four product-selection cases are filtered in PostgreSQL')
    for token, product in [(company,quipu),(platform['quipu'],fac),(platform['quipufac'],quipu)]:
        denied(f"SELECT public.client_submit_request('{token}',{data(ticket_payload(product))},gen_random_uuid())",'PT403')
    passed('forged product id cannot bypass entry-context restrictions')

    idem=q('SELECT gen_random_uuid()')
    ta=submit(a,idem=idem); assert ta==submit(a,idem=idem)
    tb=submit(b,idem=idem)
    assert ta['id']!=tb['id'] and ta['tracking_token']!=tb['tracking_token']
    assert ta['request_number'].startswith('REQ')
    row=j(f"SELECT jsonb_build_object('name',requester_name,'urgent',urgent_requested,'studio',studio_id,'status',status) FROM public.requests WHERE id='{ta['id']}'",owner)
    assert row=={'name':'Declared fixture person','urgent':True,'studio':st,'status':'pending'}
    passed('creation reuses required name, urgency, REQ numbering, study and identity-scoped idempotency')
    link=j(f"SELECT jsonb_build_object('identity',identity_id,'company',company_id,'provider',provider,'context',entry_context) FROM app_private.client_request_links WHERE request_id='{ta['id']}'",owner)
    assert link['identity']==info(a)['identity']['id'] and link['provider']=='quipu' and link['context']=='direct'
    passed('ticket is linked to company, verified identity and authentication method')
    denied(f"SELECT public.client_submit_request('{a}',{data(ticket_payload(name='   '))},gen_random_uuid())",'22023')
    denied(f"SELECT public.client_submit_request('{a}',{data(ticket_payload()|{'studio_id':ambiguous[0]})},gen_random_uuid())",'22023')
    denied(f"SELECT public.client_submit_request('{a}',{data(ticket_payload()|{'title':'Changed'})},'{idem}')",'22023')
    passed('empty names, caller-selected study and changed idempotent payload are rejected')
    c1=submit(company,ticket_payload(fac,'Declared person one')); c2=submit(company2,ticket_payload(fac,'Declared person two'))
    assert {x['id'] for x in j(rpc('client_list_tickets',company))}=={c1['id'],c2['id']}
    assert {x['id'] for x in j(rpc('client_list_tickets',a))}=={ta['id']}
    assert {x['id'] for x in j(rpc('client_list_tickets',b))}=={tb['id']}
    assert all(x['requester_name_verified'] is False for x in j(rpc('client_list_tickets',company)))
    passed('My tickets isolates individual users and shares only the RUC company account; declared names stay unverified')
    for token, rid in [(a,tb['id']),(a,c1['id']),(company,ta['id']),(b,legacy['id']),(a,'00000000-0000-0000-0000-000000000000')]:
        denied(rpc('client_ticket_detail',token,rid),'PT404')
    passed('changing request id cannot read foreign, legacy-unlinked or nonexistent tickets')
    detail=j(rpc('client_ticket_detail',a,ta['id']))
    assert detail['general_status']=='received' and detail['timeline'] and detail['description']=='Fictitious request only'
    public=j(rpc('track_request_status',ta['request_number']))
    assert public=={'request_number':ta['request_number'],'status':'received'}
    assert j(rpc('track_request',ta['request_number'],ta['tracking_token']))['request_number']==ta['request_number']
    passed('authorized detail/timeline and both existing public tracking contracts remain compatible')

    files=[{'upload_key':q('SELECT gen_random_uuid()'),'file_name':'fixture.pdf','size_bytes':12,'mime_type':'application/pdf'}]
    grants=j(f"SELECT public.client_reserve_attachments('{a}','{ta['id']}',{data(files)})")
    assert len(grants)==1
    q(f"INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('request-attachments',{lit(grants[0]['path'])},'{json.dumps({'size':12,'mimetype':'application/pdf'})}'::jsonb)",'anon')
    assert q(f"SELECT count(*) FROM storage.objects WHERE name={lit(grants[0]['path'])}")=='1'
    denied(f"SELECT public.reserve_request_attachments('{ta['id']}','{tb['tracking_token']}',{data(files)})")
    denied(f"SELECT public.client_reserve_attachments('{b}','{ta['id']}',{data(files)})",'PT404')
    passed('existing private attachment reservation, final Storage write and cross-ticket capability checks work')

    amb=session(ruc='20000000002',subject='ambiguous',username='Ambiguous')
    assert info(amb)['company']['studio_mapping']=='required'
    denied(f"SELECT public.client_submit_request('{amb}',{data(ticket_payload())},gen_random_uuid())",'23514')
    denied(rpc('set_client_company_studio','20000000002',ambiguous[1]))
    q(rpc('set_client_company_studio','20000000002',ambiguous[1]),'authenticated',admin)
    assert info(amb)['company']['studio_id']==ambiguous[1]
    amb_ticket=submit(amb)
    assert q(f"SELECT studio_id FROM public.requests WHERE id='{amb_ticket['id']}'")==ambiguous[1]
    denied(rpc('client_ticket_detail',a,amb_ticket['id']),'PT404')
    passed('ambiguous RUC blocks creation until explicit staff mapping; other companies remain isolated')
    missing=session(ruc='20000000003',subject='unmapped',username='Unmapped')
    assert info(missing)['company']['studio_id'] is None
    denied(f"SELECT public.client_submit_request('{missing}',{data(ticket_payload())},gen_random_uuid())",'23514')
    passed('unknown RUC never selects an arbitrary catalog study')
    code=key(); issue('quipu',code)
    q(f"UPDATE app_private.client_entry_codes SET created_at=now()-interval '3 minutes',expires_at=now()-interval '1 minute' WHERE code_hash='{digest(code)}'")
    denied(f"SELECT public.client_exchange_entry_code('quipu','{digest(code)}','{digest(key())}',now()+interval '8 hours')",role='service_role')
    passed('expired platform codes are rejected')
    code=key(); issue('quipu',code)
    def race(_): return sql(f"SELECT public.client_exchange_entry_code('quipu','{digest(code)}','{digest(key())}',now()+interval '8 hours')",'service_role')
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(race,range(2)))
    assert sum(r.returncode==0 for r in results)==1 and any('42501' in r.stderr for r in results)
    passed('concurrent code exchange has exactly one winner')
    expired=session(subject='expired',username='Expired')
    q(f"UPDATE app_private.client_sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE token_hash='{digest(expired)}'")
    for token in ['malformed',key(),expired]:
        for expression in [rpc('client_session_info',token),rpc('client_products',token),rpc('client_list_tickets',token),
                           rpc('client_ticket_detail',token,ta['id']),f"SELECT public.client_submit_request({lit(token)},{data(ticket_payload())},gen_random_uuid())",
                           f"SELECT public.client_reserve_attachments({lit(token)},'{ta['id']}',{data(files)})"]:
            denied(expression,'PT401')
    q(rpc('client_logout',b),'anon'); q(rpc('client_logout',b),'anon')
    denied(rpc('client_session_info',b),'PT401'); denied(rpc('client_ticket_detail',b,tb['id']),'PT401')
    passed('malformed, missing, expired and revoked sessions fail before returning data or replaying a ticket')
    for table in ['client_companies','client_identities','client_sessions','client_entry_codes','client_product_bindings','client_request_links']:
        assert q(f"SELECT relrowsecurity FROM pg_class WHERE oid='app_private.{table}'::regclass")=='t'
        denied(f'SELECT * FROM app_private.{table}')
    assert q("SELECT count(*) FROM app_private.client_sessions WHERE token_hash !~ '^[0-9a-f]{64}$'")=='0'
    assert old_row==q(f"SELECT to_jsonb(r) FROM public.requests r WHERE id='{legacy['id']}'")
    assert old_users==q('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u')
    passed('private tables are RLS protected; no session plaintext, historical edits or staff-role changes')
    version=q('SHOW server_version',None)
finally:
    if server is not None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],
          env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5);log.close()
evidence={'at_utc':datetime.now(timezone.utc).isoformat(),'postgresql':version,'migration':M13,
  'migration_sha256':hashlib.sha256((ROOT/'supabase/migrations'/M13).read_bytes()).hexdigest(),
  'passed':len(checks),'checks':checks,'socket_only':True,'server_stopped':True,
  'synthetic_auth_and_storage_only':True,'real_tickets_modified':False,'remote_sql_executed':False,
  'previous_suites_repeated':False,'external_api_contracts_confirmed':False}
(ROOT/'docs/validation/client-access-local.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'{len(checks)} M13 PostgreSQL checks passed; isolated server stopped.')
