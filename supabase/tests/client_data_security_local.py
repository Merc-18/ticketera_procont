#!/usr/bin/env python3
"""M16: real disposable PostgreSQL with Auth/Storage stubs, never remote Supabase.

Requires explicit persistent --work-root. Each invocation preserves its cluster,
stops the server in finally and emits only sanitized evidence. No passwords/DSN.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
M16 = '20261123000100_client_request_data_security.sql'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
parser.add_argument('--work-root', type=Path, required=True)
parser.add_argument('--scenario', choices=['clean', 'upgrade'], required=True)
parser.add_argument('--frontend-repo', type=Path, help='Optional read-only adapter source directory for real SQL contract bridge')
args = parser.parse_args()
args.work_root.mkdir(parents=True, exist_ok=True)
work = Path(tempfile.mkdtemp(prefix='m16-'+args.scenario+'-', dir=args.work_root))
cluster, socket = work/'cluster', work/'socket'
socket.mkdir(mode=0o700)
env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-pass'), PGSERVICEFILE=str(work/'no-service'))
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
        '-Atq', '-h', str(socket), '-p', '55526', '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_m16_owner'
server, checks, frontend_evidence = None, [], None
S,A,D,V,I,N = [f'00000000-0000-4000-8000-{n:012d}' for n in range(1601,1607)]


def lit(value):
    return 'NULL' if value is None else "'"+str(value).replace("'", "''")+"'"


def data(value):
    return lit(json.dumps(value, ensure_ascii=False))+'::jsonb'


def sanitized(value):
    return re.sub(r'[0-9a-f]{64}', '[REDACTED_CAPABILITY]', value)


def sql(text, role=owner, actor=None):
    assert role in [None,owner,'anon','authenticated','service_role']
    prefix = (f'SET ROLE {role};\n' if role else '')+f'SET request.jwt.claim.sub={lit(actor or "")};\n'
    return subprocess.run(base,input=prefix+text,env=env,text=True,capture_output=True)


def q(text, role=owner, actor=None):
    r = sql(text,role,actor)
    if r.returncode:
        raise RuntimeError(sanitized(r.stderr))
    return r.stdout.strip()


def j(text, role='anon', actor=None):
    return json.loads(q(text,role,actor))


def denied(text, code='42501', role='anon', actor=None):
    r = sql(text,role,actor)
    assert r.returncode and code in r.stderr, 'Expected SQLSTATE '+code+': '+sanitized(r.stderr)


def passed(name):
    checks.append(name)
    print('PASS '+name,flush=True)


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def session(user='Alpha', provider='quipu', source='username', subject=None, ruc='20000000016', name=None, platform=False):
    token = secrets.token_hex(32)
    if provider=='quipufac':
        user,source,subject = None,'company','company'
    values=[provider,ruc,subject if subject is not None else user,source,user,name,digest(token)]
    if platform:
        q('SELECT public.client_issue_entry_code('+','.join(map(lit,values))+",now()+interval '1 minute')",'service_role')
        code_hash=digest(token);token=secrets.token_hex(32)
        q(f"SELECT public.client_exchange_entry_code({lit(provider)},{lit(code_hash)},{lit(digest(token))},now()+interval '8 hours')",'service_role')
    else:
        q('SELECT public.client_open_session('+','.join(map(lit,values))+",now()+interval '8 hours')",'service_role')
    return token


def info(token):
    return j(f'SELECT public.client_session_info({lit(token)})')


def payload(**fields):
    return dict(system_id=other,request_type_id=typ,title='Synthetic M16 request',description='Local disposable fixture; no real incident.') | fields


def command(token,p=None,key=None):
    return f'SELECT public.client_submit_request({lit(token)},{data(p if p is not None else payload())},{lit(key or str(uuid.uuid4()))}::uuid)'


def submit(token,p=None,key=None):
    return j(command(token,p,key))


def tickets(token,limit=100,offset=0):
    return j(f'SELECT public.client_list_tickets({lit(token)},{limit},{offset})')


def detail(token,rid):
    return j(f'SELECT public.client_ticket_detail({lit(token)},{lit(rid)}::uuid)')


def rows():
    tables=j("SELECT jsonb_agg(format('%I.%I',n.nspname,c.relname) ORDER BY n.nspname,c.relname) FROM pg_class c "
      "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN('public','app_private','auth','storage')",None)
    return {table:q("SELECT md5(coalesce(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text) FROM (SELECT to_jsonb(t) "
      "-'requested_priority'-'requested_subsystem_id'-'requester_name_source'-'authenticated_username' v FROM "+table+' t) x',None) for table in tables}


def functions():
    return j("SELECT jsonb_object_agg(n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),' ','')||')',jsonb_build_object('owner',pg_get_userbyid(p.proowner),"
      "'acl',p.proacl::text,'body',p.prosrc,'config',p.proconfig,'definer',p.prosecdef)) FROM pg_proc p "
      "JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app_private')",None)


try:
    subprocess.run([str(args.pg_bin/'initdb'),'-D',str(cluster),'-A','trust','--locale=C.UTF-8','-E','UTF8'],
      env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    with (work/'server.log').open('w') as log:
        server=subprocess.Popen([str(args.pg_bin/'postgres'),'-D',str(cluster),'-c','listen_addresses=',
          '-c',f'unix_socket_directories={socket}','-c','wal_level=logical','-c','log_min_messages=panic',
          '-c','log_min_error_statement=panic','-c','log_statement=none','-p','55526'],env=env,stdout=log,stderr=log)
    for _ in range(100):
        if sql('SELECT 1',None).returncode==0:break
        if server.poll() is not None:raise RuntimeError('Disposable PostgreSQL exited')
        time.sleep(.05)
    else:raise RuntimeError('Disposable PostgreSQL unavailable')
    assert Path(q('SHOW data_directory',None)).resolve()==cluster
    assert q('SHOW listen_addresses',None)==''
    version=q('SHOW server_version',None)
    assert version.startswith('17.')
    q(f'CREATE ROLE {owner} NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; '
      f'CREATE ROLE service_role NOLOGIN BYPASSRLS; ALTER DATABASE postgres OWNER TO {owner};',None)
    q((ROOT/'supabase/tests/support/auth_stub.sql').read_text(),None)
    q(f'ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz; GRANT USAGE ON SCHEMA auth TO {owner}; '
      f'GRANT SELECT(id,email,raw_user_meta_data,email_confirmed_at),REFERENCES(id) ON auth.users TO {owner}; '
      f'ALTER PUBLICATION supabase_realtime OWNER TO {owner};',None)
    q(f'''CREATE SCHEMA storage AUTHORIZATION {owner};
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,created_at timestamptz DEFAULT now(),metadata jsonb DEFAULT '{{}}'::jsonb);
      ALTER TABLE storage.buckets OWNER TO {owner}; ALTER TABLE storage.objects OWNER TO {owner}; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated; GRANT SELECT,INSERT ON storage.objects TO anon,authenticated;''',None)
    paths=sorted((ROOT/'supabase/migrations').glob('*.sql'))
    assert len(paths)==16 and paths[-1].name==M16
    for path in paths[:15]:q(path.read_text())
    if args.scenario=='clean':
        before,old_functions=rows(),functions();q(paths[-1].read_text());assert rows()==before
        passed('Clean installation M1-M16 changes no existing application rows')
    for actor,label in [(S,'superadmin'),(A,'admin'),(D,'developer'),(V,'viewer'),(I,'inactive'),(N,'external')]:
        q(f"INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES({lit(actor)},{lit(label+'@fixture.invalid')},'{{}}',now())",None)
        if actor!=N:q(f"SELECT app_private.{'bootstrap_superadmin' if actor==S else 'provision_auth_profile'}({lit(actor)})")
    for actor,role,active in [(A,'admin',True),(D,'developer',True),(V,'viewer',True),(I,'admin',False)]:
        q(f"UPDATE public.users SET role={lit(role)},is_active={'true' if active else 'false'} WHERE id={lit(actor)}")
    study=q("INSERT INTO public.studios(name,ruc) VALUES('M16 synthetic study','20000000016') RETURNING id")
    q("INSERT INTO public.studios(name,ruc) VALUES('M16 other synthetic study','20000000017')")
    code=q(f"INSERT INTO public.studio_codes(studio_id,code) VALUES({lit(study)},'M16_FIXTURE') RETURNING id")
    other=q("SELECT id FROM public.catalog_systems WHERE name='Otros'")
    quipu=q("SELECT id FROM public.catalog_systems WHERE name='Quipu'")
    fac=q("SELECT id FROM public.catalog_systems WHERE name='Quipu_Fac'")
    typ=q("SELECT id FROM public.request_types WHERE name='Mejora'")
    desk=q(f"SELECT id FROM public.catalog_subsystems WHERE system_id={lit(quipu)} AND name='Escritorio'")
    web=q(f"SELECT id FROM public.catalog_subsystems WHERE system_id={lit(fac)} AND name='Web'")
    android=q(f"SELECT id FROM public.catalog_subsystems WHERE system_id={lit(fac)} AND name='Android'")
    if args.scenario=='upgrade':
        legacy_token=session('LegacyUsername');legacy=submit(legacy_token,payload(requester_name='Legacy declared label',urgent_requested=True))
        legacy_fac=session(provider='quipufac');legacy_business=submit(legacy_fac,payload(requester_name='Legacy enterprise creator'))
        old_a=session('OriginalA',source='provider_id',subject='colliding-id')
        old_key=str(uuid.uuid4());old_payload=payload(requester_name='Original historical declaration')
        old_ticket=submit(old_a,old_payload,old_key)
        old_b=session('OriginalB',source='provider_id',subject='colliding-id')
        assert info(old_a)['identity']['id']==info(old_b)['identity']['id']
        assert old_ticket['id'] in {t['id'] for t in tickets(old_b)}
        passed('Pre-M16 provider_id collision reproduced: B could read A ticket after username overwrite')
        old_code=secrets.token_hex(32)
        q("SELECT public.client_issue_entry_code('quipu','20000000016','colliding-id','provider_id','OriginalB',NULL,"+lit(old_code)+",now()+interval '1 minute')",'service_role')
        duplicate_safe=session('DuplicatedLegacy')
        duplicate_safe_ticket=submit(duplicate_safe,payload(requester_name='Legacy duplicated account'))
        duplicate_provider=session('DuplicatedLegacy',source='provider_id',subject='duplicate-source')
        duplicate_provider_ticket=submit(duplicate_provider,payload(requester_name='Legacy other source'))
        before,old_functions=rows(),functions()
        body=paths[-1].read_text().replace('BEGIN;','',1).rsplit('COMMIT;',1)[0]
        q('BEGIN;\n'+body+'\nROLLBACK;')
        assert rows()==before and functions()==old_functions
        assert q("SELECT count(*) FROM pg_attribute WHERE attrelid='public.requests'::regclass AND attname='requested_priority'")=='0'
        passed('Transactional rollback restores schema/functions/ACLs and all historical rows before commit')
        q(paths[-1].read_text());assert rows()==before
        for rid in [legacy['id'],legacy_business['id'],old_ticket['id']]:
            assert q(f"SELECT requested_priority IS NULL AND requested_subsystem_id IS NULL AND requester_name_source IS NULL FROM public.requests WHERE id={lit(rid)}")=='t'
        assert detail(legacy_token,legacy['id'])['urgent_requested']
        assert detail(legacy_token,legacy['id'])['requested_priority'] is None
        assert legacy_business['id'] in {t['id'] for t in tickets(legacy_fac)}
        passed('Upgrade preserves every old column including urgency, ownership and audit; new historical fields NULL; username/enterprise sessions remain valid')
        for token in [old_a,old_b]:
            denied(f'SELECT public.client_session_info({lit(token)})','PT401')
            denied(command(token),'PT401')
        denied(f"SELECT public.client_exchange_entry_code('quipu',{lit(old_code)},{lit(secrets.token_hex(32))},now()+interval '8 hours')",'42501','service_role')
        fresh_b=session('OriginalB',source='provider_id',subject='colliding-id')
        assert old_ticket['id'] not in {t['id'] for t in tickets(fresh_b)}
        denied(f"SELECT public.client_ticket_detail({lit(fresh_b)},{lit(old_ticket['id'])})",'PT404')
        denied(command(fresh_b,old_payload,old_key),'PT404')
        denied(f"SELECT public.client_reserve_attachments({lit(fresh_b)},{lit(old_ticket['id'])},'[]')",'PT404')
        passed('Ambiguous old provider_id links/sessions/codes fail closed without reassignment or historical-row updates')
        denied("SELECT public.client_open_session('quipu','20000000016','DuplicatedLegacy','username','DuplicatedLegacy',NULL,"+lit(secrets.token_hex(32))+",now()+interval '8 hours')",'22023','service_role')
        assert detail(duplicate_safe,duplicate_safe_ticket['id'])['id']==duplicate_safe_ticket['id']
        denied(f'SELECT public.client_session_info({lit(duplicate_provider)})','PT401')
        assert q(f"SELECT count(*) FROM public.requests WHERE id IN ({lit(duplicate_safe_ticket['id'])},{lit(duplicate_provider_ticket['id'])})")=='2'
        passed('Multiple historical identities for one exact username are not merged or chosen randomly; new login requires review and old rows remain')

    new_functions=functions()
    for signature,old in old_functions.items():
        assert new_functions[signature]['owner']==old['owner']
        assert new_functions[signature]['acl']==old['acl'],signature
    for name in ['submit_request(jsonb,uuid)','submit_classified_request(jsonb,jsonb,uuid)','client_login_throttle(text,text)']:
        assert old_functions['public.'+name]==new_functions['public.'+name]
    passed('All existing owners/effective ACL definitions preserved; M14 and internal M15 bodies unchanged')

    a,b=session('Alpha'),session('alpha');a2=session('Alpha')
    assert info(a)['identity']['id']==info(a2)['identity']['id']!=info(b)['identity']['id']
    alternate_a=session('Alpha',platform=True,source='provider_id',subject='alternate-verified-subject')
    assert info(alternate_a)['identity']['id']==info(a)['identity']['id']
    pa,pb=session('ProviderA',source='provider_id',subject='same-id'),session('ProviderB',source='provider_id',subject='same-id')
    assert info(pa)['identity']['id']!=info(pb)['identity']['id']
    ca,ca2=session(provider='quipufac'),session(provider='quipufac',name='Enterprise name only')
    cb=session(provider='quipufac',ruc='20000000017')
    assert info(ca)['identity']['id']==info(ca2)['identity']['id']!=info(cb)['identity']['id']
    receipts={a:submit(a),b:submit(b),pa:submit(pa),pb:submit(pb),ca:submit(ca,payload(requester_name='Declared A')),cb:submit(cb,payload(requester_name='Declared B'))}
    for token,receipt in receipts.items():
        assert receipt['id'] in {t['id'] for t in tickets(token)}
        assert detail(token,receipt['id'])['id']==receipt['id']
        for foreign in (r for t,r in receipts.items() if t!=token):
            assert foreign['id'] not in {r['id'] for r in tickets(token)}
            denied(f"SELECT public.client_ticket_detail({lit(token)},{lit(foreign['id'])})",'PT404')
        denied(f"SELECT public.client_ticket_detail({lit(token)},{lit(str(uuid.uuid4()))})",'PT404')
        assert info(token)['identity']['id']
    assert receipts[a]['id'] in {t['id'] for t in tickets(alternate_a)}
    passed('Six identities isolate every cross-UUID list/detail combination; exact same username shares direct/platform account despite subject differences; case variants and colliding provider_ids stay separate')
    shared=submit(ca2,payload(requester_name='Another declared creator'))
    enterprise={t['id']:t['requester_name'] for t in tickets(ca)}
    assert enterprise[receipts[ca]['id']]=='Declared A' and enterprise[shared['id']]=='Another declared creator'
    assert detail(ca2,receipts[ca]['id'])['requester_name']=='Declared A'
    passed('Same-RUC QuipuFac sessions share enterprise tickets with each original declared name; other RUC/provider denied')
    assert detail(a,receipts[a]['id'])['requester_name']=='Alpha'
    assert detail(a,receipts[a]['id'])['requester_name_source']=='username'
    assert not detail(a,receipts[a]['id'])['requester_name_verified']
    verified=session('NamedUser',name='Trusted synthetic name');trusted=submit(verified)
    assert detail(verified,trusted['id'])['requester_name']=='Trusted synthetic name'
    assert detail(verified,trusted['id'])['requester_name_verified']
    denied(command(a,payload(requester_name='Impersonation')),'22023')
    for bad in [None,'',' ','\u200b',123,'x'*201]:denied(command(ca,payload(requester_name=bad)),'22023')
    denied(command(ca),'22023')
    for forged in ['studio_id','company_id','identity_id','requester_name_source']:
        denied(command(a,payload(**{forged:str(uuid.uuid4())})),'22023')
    passed('Quipu name is derived and cannot be impersonated; QuipuFac name required per ticket; caller cannot choose owner/studio/provenance')
    ids={}
    for priority in ['low','medium','high','urgent']:
        for urgency in [False,True]:
            r=submit(a,payload(requested_priority=priority,urgent_requested=urgency));ids[priority]=r['id']
            t=detail(a,r['id']);assert t['requested_priority']==priority and t['urgent_requested']==urgency
    assert detail(a,receipts[a]['id'])['requested_priority']=='medium'
    assert not detail(a,receipts[a]['id'])['urgent_requested']
    legacy_input=submit(a,payload(urgent_requested=True));t=detail(a,legacy_input['id'])
    assert t['requested_priority']=='medium' and t['urgent_requested']
    for bad in ['critical','Medio','',None,True,0,[],{}]:denied(command(a,payload(requested_priority=bad)),'22023')
    for bad in [None,123,'true']:denied(command(a,payload(urgent_requested=bad)),'22023')
    passed('All four priorities and medium default persist independently from both urgency values; no inference or rejected valid combinations')
    stats=j(f'SELECT public.get_requester_urgency_month(NULL,{lit(study)})','authenticated',A)
    assert stats['urgent_requests']==int(q(f"SELECT count(*) FROM public.requests WHERE studio_id={lit(study)} AND number_series='REQ' AND urgent_requested"))
    assert stats['total_requests']==int(q(f"SELECT count(*) FROM public.requests WHERE studio_id={lit(study)} AND number_series='REQ'"))
    assert old_functions['public.get_requester_urgency_month(date,uuid)']==new_functions['public.get_requester_urgency_month(date,uuid)']
    passed('Existing monthly urgency metric uses the independent original boolean; M11 function body/permissions unchanged')

    denied(f"UPDATE public.requests SET requested_priority='urgent' WHERE id={lit(ids['low'])}",'23514',owner)
    q(f"SELECT public.classify_request({lit(ids['high'])},{data({'studio_code_id':code})})",'authenticated',A)
    approved=j(f"SELECT public.approve_request({lit(ids['high'])},{data({'priority':'low','project_type':'development','assigned_dev':D})},gen_random_uuid())",'authenticated',A)
    assert q(f"SELECT priority FROM public.projects WHERE request_id={lit(ids['high'])}")=='low'
    assert q(f"SELECT requested_priority FROM public.requests WHERE id={lit(ids['high'])}",'authenticated',A)=='high'
    assert j(f"SELECT to_jsonb(r) FROM public.projects p CROSS JOIN LATERAL public.requests(p) r WHERE p.request_id={lit(ids['high'])}",'authenticated',A)['requested_priority']=='high'
    passed('Staff SELECT and existing requests(projects) embedding expose requested_priority; admin-approved projects.priority remains independent')
    for parent in [quipu,fac,other]:
        assert all(r['system_id']==parent for r in j(f'SELECT public.client_subprojects({lit(a)},{lit(parent)})'))
    assert j(f'SELECT public.client_subprojects({lit(a)},{lit(other)})')==[]
    denied(f'SELECT public.client_subprojects({lit(ca)},{lit(quipu)})','PT403')
    for provider,parent,child in [('quipu',quipu,desk),('quipufac',fac,web)]:
        platform=session('Platform'+provider,provider=provider,platform=True,source='provider_id',subject='platform-'+provider)
        p=payload(system_id=parent,subsystem_id=child)
        if provider=='quipufac':p['requester_name']='Declared platform creator'
        assert submit(platform,p)['id']
        denied(command(platform,payload(requester_name='Declared')),'PT403')
    passed('Authorized active child catalogs and all four direct/platform product rules hold; fixed-platform creation works')
    entry_hash=secrets.token_hex(32)
    q("SELECT public.client_issue_entry_code('quipu','20000000016','EntryRace','provider_id','EntryRace',NULL,"+lit(entry_hash)+",now()+interval '1 minute')",'service_role')
    def exchange(_):
        token=secrets.token_hex(32)
        r=sql(f"SELECT public.client_exchange_entry_code('quipu',{lit(entry_hash)},{lit(digest(token))},now()+interval '8 hours')",'service_role')
        if r.returncode:
            assert '42501' in r.stderr
            return None
        return token
    with ThreadPoolExecutor(max_workers=8) as pool:winners=[t for t in pool.map(exchange,range(8)) if t]
    assert len(winners)==1 and info(winners[0])['identity']['username']=='EntryRace'
    assert submit(winners[0],payload(system_id=quipu,subsystem_id=desk))['id']
    passed('Eight simultaneous platform-code exchanges have exactly one winner and preserve verified username for authenticated creation')

    chosen=submit(a,payload(system_id=fac,subsystem_id=web))
    assert detail(a,chosen['id'])['requested_subsystem_id']==web
    q(f"SELECT public.classify_request({lit(chosen['id'])},{data({'studio_code_id':code,'subsystem_id':android})})",'authenticated',A)
    assert q(f"SELECT subsystem_id FROM public.requests WHERE id={lit(chosen['id'])}")==android
    assert detail(a,chosen['id'])['requested_subsystem_id']==web
    denied(f"UPDATE public.requests SET requested_subsystem_id={lit(android)} WHERE id={lit(chosen['id'])}",'23514',owner)
    for bad in [desk,str(uuid.uuid4()),'',12]:denied(command(a,payload(system_id=fac,subsystem_id=bad)),'22023')
    denied(command(a,payload(system_id=fac)),'22023')
    q(f"UPDATE public.catalog_subsystems SET is_active=false WHERE id={lit(android)}")
    denied(command(a,payload(system_id=fac,subsystem_id=android)),'22023')
    assert android not in {r['id'] for r in j(f'SELECT public.client_subprojects({lit(a)},{lit(fac)})')}
    q(f"UPDATE public.catalog_subsystems SET is_active=false WHERE system_id={lit(quipu)}")
    assert detail(a,submit(a,payload(system_id=quipu))['id'])['requested_subsystem_id'] is None
    passed('Original subproject survives staff classification; missing/foreign/inactive/malformed children rejected; empty required catalog accepts NULL')
    q('DO $$ BEGIN FOR n IN 1..105 LOOP PERFORM public.client_submit_request('+lit(b)+','+data(payload())+",gen_random_uuid()); END LOOP; END $$;",'anon')
    pages=[tickets(b,40,offset) for offset in [0,40,80,120]]
    flat=[t['id'] for page in pages for t in page]
    assert len(flat)==len(set(flat))==106
    bid=info(b)['identity']['id']
    expected=j(f"SELECT jsonb_agg(r.id ORDER BY r.created_at DESC,r.id DESC) FROM app_private.client_request_links l JOIN public.requests r ON r.id=l.request_id WHERE l.identity_id={lit(bid)}",owner)
    assert flat==expected and tickets(b,40,120)==[]
    assert not set(flat)&{r['id'] for t,r in receipts.items() if t!=b}
    for limit,offset in [(101,0),(0,0),(50,-1),(50,100001)]:denied(f'SELECT public.client_list_tickets({lit(b)},{limit},{offset})','22023')
    assert len(j(f'SELECT public.client_list_tickets({lit(b)})'))==50
    assert len(j(f'SELECT public.client_list_tickets({lit(b)},100)'))==100
    assert j("SELECT to_jsonb(proargnames) FROM pg_proc WHERE oid='public.client_subprojects(text,uuid)'::regprocedure",owner)==['p_session_token','p_system_id']
    assert j("SELECT to_jsonb(proargnames) FROM pg_proc WHERE oid='public.client_list_tickets(text,integer,integer)'::regprocedure",owner)==['p_session_token','p_limit','p_offset']
    summary=tickets(ca)[0]
    assert set(summary)=={'id','request_number','title','created_at','status','general_status','system_id','requester_name','requester_name_verified','requester_name_source','requested_priority','requested_subsystem_id'}
    passed('106 owned tickets paginate stably through timestamp ties without duplicates or foreign rows; defaults/limits, named RPC arguments and JSON fields match handoff')
    if args.frontend_repo:
        bridge=subprocess.run(['node','supabase/tests/client_data_security_bridge.mjs'],cwd=ROOT,env=env,
          input=json.dumps(dict(frontend=str(args.frontend_repo.resolve()),psql=base,a=a,b=b,fac=ca,sameFac=ca2,otherFac=cb,
            quipuProduct=quipu,facProduct=fac,child=web,other=other,type=typ,logout=session('BridgeLogout'))),capture_output=True,text=True)
        if bridge.returncode:raise RuntimeError('SQL adapter bridge: '+sanitized(bridge.stderr[-2500:]))
        frontend_evidence=json.loads(bridge.stdout)
        assert frontend_evidence['passed']
        passed('Exact Agent 2 adapter against real SQL: names, independent urgency/priority, subprojects, 106-ticket pagination, company sharing, cross-identity denial and logout')

    key=str(uuid.uuid4());p=payload(requested_priority='low')
    with ThreadPoolExecutor(max_workers=8) as pool:retries=list(pool.map(lambda _:submit(a,p,key),range(8)))
    assert len({r['id'] for r in retries})==1
    assert submit(b,p,key)['id']!=retries[0]['id']
    denied(command(a,payload(requested_priority='high'),key),'22023')
    passed('Eight concurrent retries create once; replay keys remain per identity and changed payload cannot duplicate')
    q(f"SELECT public.update_request_details({lit(trusted['id'])},NULL,'Staff corrected name')",'authenticated',A)
    assert detail(verified,trusted['id'])['requester_name_source']=='internal_correction'
    assert not detail(verified,trusted['id'])['requester_name_verified']
    passed('Authorized staff correction remains available and does not retain false upstream-name verification')
    files=[dict(upload_key=str(uuid.uuid4()),file_name='fixture.pdf',size_bytes=12,mime_type='application/pdf')]
    grants=j(f"SELECT public.client_reserve_attachments({lit(pa)},{lit(receipts[pa]['id'])},{data(files)})")
    q(f"INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('request-attachments',{lit(grants[0]['path'])},{data({'size':12,'mimetype':'application/pdf'})})",'anon')
    denied(f"SELECT public.client_reserve_attachments({lit(pb)},{lit(receipts[pa]['id'])},{data(files)})",'PT404')
    passed('Own attachment reservation and Storage SQL policy work; foreign reservation denied (Storage stub, not HTTP upload)')
    expired=session('Expired')
    q(f"UPDATE app_private.client_sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE token_hash={lit(digest(expired))}")
    q(f'SELECT public.client_logout({lit(a)})','anon')
    for token in [None,'',secrets.token_hex(32),expired,a]:
        denied(f'SELECT public.client_list_tickets({lit(token)})','PT401')
        denied(f"SELECT public.client_ticket_detail({lit(token)},{lit(receipts[b]['id'])})",'PT401')
        denied(f'SELECT public.client_subprojects({lit(token)},{lit(other)})','PT401')
        denied(command(token,p,key),'PT401')
        denied(f"SELECT public.client_reserve_attachments({lit(token)},{lit(receipts[b]['id'])},'[]')",'PT401')
    passed('Absent, wrong, expired and revoked sessions cannot list/detail/create/replay/subprojects/reserve')
    denied(f"UPDATE app_private.client_identities SET username='Forged' WHERE id={lit(info(pa)['identity']['id'])}",'23514',owner)
    denied(f"UPDATE app_private.client_request_links SET identity_id={lit(info(pb)['identity']['id'])} WHERE request_id={lit(receipts[pa]['id'])}",'23514',owner)
    passed('Immutable identity scope and ticket links prevent ownership reassignment')
    for role,actor in [('anon',None),('authenticated',N),('authenticated',I)]:
        if role=='anon':denied('SELECT * FROM public.requests',role=role)
        else:assert q('SELECT count(*) FROM public.requests',role,actor)=='0'
        denied('SELECT * FROM app_private.client_request_links',role=role,actor=actor)
        denied("SELECT public.submit_client_request('{}',gen_random_uuid())",role=role,actor=actor)
    usage={role:q(f"SELECT has_schema_privilege({lit(role)},'app_private','USAGE')")=='t' for role in ['anon','authenticated']}
    q('GRANT USAGE ON SCHEMA app_private TO anon,authenticated')
    for table in ['client_companies','client_identities','client_sessions','client_entry_codes','client_request_links']:
        q(f'GRANT SELECT ON app_private.{table} TO anon,authenticated')
        assert q(f'SELECT count(*) FROM app_private.{table}','anon')=='0'
        assert q(f'SELECT count(*) FROM app_private.{table}','authenticated',N)=='0'
        q(f'REVOKE SELECT ON app_private.{table} FROM anon,authenticated')
    for role,existing in usage.items():
        if not existing:q(f'REVOKE USAGE ON SCHEMA app_private FROM {role}')
    assert q('SELECT count(*)>0 FROM public.requests','authenticated',V)=='t'
    passed('Real ACLs deny direct client reads; RLS still denies rows even with temporary test-only SELECT grants; internal viewer reads preserved')
    for actor in [N,I,V]:
        denied("SELECT public.submit_request('{}',gen_random_uuid())",role='authenticated',actor=actor)
        denied("SELECT public.submit_classified_request('{}','{}',gen_random_uuid())",role='authenticated',actor=actor)
    for actor in [S,A,D]:
        internal_payload=dict(requester_name='Internal synthetic author',requester_area='Internal synthetic area',request_type='Mejora',description='Internal fixture')
        for fn in ['submit_request','submit_classified_request']:
            if fn=='submit_request':args_sql=data(internal_payload)
            else:args_sql=data({k:v for k,v in internal_payload.items() if k!='requester_area'})+','+data(dict(studio_id=study,system_id=other))
            k=str(uuid.uuid4());statement=f'SELECT public.{fn}({args_sql},{lit(k)})'
            first=j(statement,'authenticated',actor);assert j(statement,'authenticated',actor)==first
    passed('Active superadmin/admin/developer keep both internal RPC creation and idempotent replay under M16')
    for role in ['anon','authenticated','service_role']:
        assert q(f"SELECT has_function_privilege({lit(role)},'public.submit_client_request(jsonb,uuid)','EXECUTE')")=='f'
        assert q(f"SELECT has_function_privilege({lit(role)},'app_private.client_owns_request(uuid,uuid)','EXECUTE')")=='f'
    assert q("SELECT public.client_login_throttle(repeat('a',64),repeat('b',64))",'service_role')=='t'
    tracked=j(f"SELECT public.track_request_status({lit(receipts[b]['request_number'])})")
    assert set(tracked)=={'request_number','status'}
    passed('M14, M15 effective permissions and editor authorization preserved; public REQ response remains exactly number/status')
finally:
    if server and server.poll() is None:
        subprocess.run([str(args.pg_bin/'pg_ctl'),'-D',str(cluster),'stop','-m','fast','-w','-t','20'],
          env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server.wait(timeout=5)

out=ROOT/f'docs/validation/client-data-security-{args.scenario}-20261123.json'
out.write_text(json.dumps(dict(at_utc=datetime.now(timezone.utc).isoformat(),scenario=args.scenario,postgresql=version,
  passed=len(checks),checks=checks,migration_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
  socket_only=True,server_stopped=True,auth_storage_stubs=True,real_postgresql=True,remote_operations=False,
  provider_logins=False,statement_logging=False,work_dir=str(work),frontend_bridge=frontend_evidence),ensure_ascii=False,indent=2)+'\n')
print(f'{len(checks)} M16 {args.scenario} groups passed; persistent local cluster stopped.')
