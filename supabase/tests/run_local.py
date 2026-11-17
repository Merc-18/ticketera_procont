#!/usr/bin/env python3
"""One SQL suite against an explicitly marked disposable Unix-socket cluster.

No DATABASE_URL, network hosts, external services, or Python dependencies.
Provision the cluster separately; see docs/fase-2a-supabase.md.
"""
import argparse
import concurrent.futures
import getpass
import json
import os
from pathlib import Path
import re
import subprocess
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--socket', type=Path, required=True)
parser.add_argument('--cluster', type=Path, required=True)
parser.add_argument('--port', type=int, default=55473)
args = parser.parse_args()
cluster = args.cluster.resolve()
socket = args.socket.resolve()
if not str(cluster).startswith('/tmp/') or not str(socket).startswith('/tmp/'):
    parser.error('Only disposable cluster and socket directories under /tmp are allowed')
if not (cluster / '.procont-isolated-tests').is_file():
    parser.error('Missing explicit .procont-isolated-tests marker')
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env['PGPASSFILE'] = '/dev/null'
base = [str(args.pg_bin / 'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1',
        '-h', str(socket), '-p', str(args.port), '-U', getpass.getuser(), '-At']


def sql(statement, database='postgres', check=True):
    result = subprocess.run(base + ['-d', database, '-c', statement], env=env,
                            capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr)
    return result


metadata = json.loads(sql("SELECT json_build_object('directory',current_setting('data_directory'),"
                          "'listen',current_setting('listen_addresses'))").stdout)
if Path(metadata['directory']).resolve() != cluster or metadata['listen'] != '':
    parser.error('Server must be the expected isolated cluster with TCP disabled')
print('Isolation verified: expected /tmp cluster, Unix socket only', flush=True)
sql("DO $$ BEGIN "
    "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; "
    "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; "
    "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; "
    "END $$")
database = 'procont_test_' + uuid.uuid4().hex[:12]
assert re.fullmatch(r'procont_test_[a-f0-9]{12}', database)
sql('CREATE DATABASE ' + database)
root = Path(__file__).resolve().parents[2]


def file(path):
    result = subprocess.run(base + ['-d', database, '-f', str(path)], env=env,
                            capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{path.name}:\n{result.stderr}')
    print('PASS ' + path.name, flush=True)
    return result.stdout


def call_as(role, actor, statement, check=True):
    # Only fixed test role names and UUIDs; payload is SQL-quoted JSON below.
    assert role in ('anon', 'authenticated')
    if actor:
        actor = str(uuid.UUID(actor))
    return sql(f"SET ROLE {role}; SET request.jwt.claim.sub='{actor}'; {statement}", database, check)


def literal(value):
    return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"


try:
    file(root / 'supabase/tests/support/auth_stub.sql')
    for migration in sorted((root / 'supabase/migrations').glob('*.sql')):
        file(migration)
    output = file(root / 'supabase/tests/behavior.sql')
    print(output.strip().splitlines()[-1], flush=True)

    # Different keys contend on one REQ counter, including crossing 999.
    sql("INSERT INTO app_private.number_counters(series,year,last_value) "
        "VALUES ('REQ',extract(year FROM now() AT TIME ZONE 'America/Lima'),998) "
        "ON CONFLICT (series,year) DO UPDATE SET last_value=998", database)

    def submit(index):
        payload = {'requester_name': f'Persona ficticia {index}', 'requester_area': 'Área ficticia',
                   'request_type': 'Prueba', 'description': 'Carga concurrente ficticia'}
        result = call_as('anon', '', f"SELECT public.submit_request({literal(payload)},'{uuid.uuid4()}')")
        return json.loads(result.stdout.strip().splitlines()[-1])

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        submissions = list(pool.map(submit, range(12)))
    numbers = [item['request_number'] for item in submissions]
    assert len(set(numbers)) == 12
    assert sorted(int(n.split('-')[1]) for n in numbers) == list(range(999, 1011))
    print('PASS 12 concurrent REQ submissions, unique numbers 999..1010', flush=True)

    developer = '10000000-0000-4000-8000-000000000003'
    payload = {'title': 'Proyecto concurrente ficticio', 'description': 'Idempotencia concurrente',
               'project_type': 'dual'}
    same_key = str(uuid.uuid4())

    def create_same(_):
        result = call_as('authenticated', developer,
                         f"SELECT public.create_internal_project({literal(payload)},'{same_key}')")
        return json.loads(result.stdout.strip().splitlines()[-1])

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        projects = list(pool.map(create_same, range(4)))
    assert len({p['id'] for p in projects}) == 1
    print('PASS 4 concurrent retries: one INT project and one result', flush=True)

    admin = '10000000-0000-4000-8000-000000000002'
    request_id = submissions[0]['id']

    def approve(_):
        return call_as('authenticated', admin,
                       f"SELECT public.approve_request('{request_id}',"
                       f"'{json.dumps({'project_type': 'dual'})}'::jsonb,'{uuid.uuid4()}')", check=False)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        approvals = list(pool.map(approve, range(2)))
    assert sum(r.returncode == 0 for r in approvals) == 1
    assert any('Request is not pending' in r.stderr for r in approvals if r.returncode)
    assert sql(f"SELECT count(*) FROM public.projects WHERE request_id='{request_id}'", database).stdout.strip() == '1'
    print('PASS concurrent approvals: one project, second approval rejected', flush=True)

    # Exercise the independent INT allocator with different keys, not just retries.
    sql("INSERT INTO app_private.number_counters(series,year,last_value) "
        "VALUES ('INT',extract(year FROM now() AT TIME ZONE 'America/Lima'),998) "
        "ON CONFLICT (series,year) DO UPDATE SET last_value=998", database)

    def create_int(index):
        payload = {'title': f'Proyecto INT ficticio {index}', 'description': 'Concurrencia INT',
                   'project_type': 'development'}
        result = call_as('authenticated', developer,
                         f"SELECT public.create_internal_project({literal(payload)},'{uuid.uuid4()}')")
        return json.loads(result.stdout.strip().splitlines()[-1])

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        int_projects = list(pool.map(create_int, range(8)))
    assert sorted(int(p['project_number'].split('-')[1]) for p in int_projects) == list(range(999, 1007))
    print('PASS 8 concurrent INT projects, unique numbers 999..1006', flush=True)

    # The last-superadmin invariant must survive simultaneous demotions.
    super_a = '10000000-0000-4000-8000-000000000001'
    super_b = '10000000-0000-4000-8000-000000000006'
    sql(f"INSERT INTO auth.users(id,email) VALUES ('{super_b}','second-super@example.invalid')", database)
    sql(f"SELECT app_private.provision_auth_profile('{super_b}')", database)
    call_as('authenticated', super_a, f"SELECT public.admin_update_user('{super_b}','superadmin',true)")

    def demote(pair):
        actor, target = pair
        return call_as('authenticated', actor,
                       f"SELECT public.admin_update_user('{target}','viewer',true)", check=False)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        demotions = list(pool.map(demote, [(super_a, super_b), (super_b, super_a)]))
    assert sum(r.returncode == 0 for r in demotions) == 1
    assert sql("SELECT count(*) FROM public.users WHERE role='superadmin' AND is_active", database).stdout.strip() == '1'
    print('PASS concurrent administrative demotions preserve an active superadmin', flush=True)

    # Unchanged React queries need all their interface fields and computed FK paths.
    interfaces = (root / 'src/types/database.types.ts').read_text()
    mapping = {'User': 'users', 'Request': 'requests', 'Project': 'projects', 'ProjectFlow': 'project_flows',
               'ChecklistItem': 'checklist_items', 'Comment': 'comments', 'Notification': 'notifications',
               'ActivityLog': 'activity_logs'}
    for interface, table in mapping.items():
        body = re.search(r'export interface ' + interface + r'\s*\{([^}]+)\}', interfaces).group(1)
        fields = set(re.findall(r'^\s*(\w+)\??:', body, re.M)) - {'project_flows'}
        columns = set(sql(f"SELECT column_name FROM information_schema.columns WHERE table_schema='public' "
                          f"AND table_name='{table}'", database).stdout.splitlines())
        assert fields <= columns, (table, fields - columns)
    assert sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace "
               "AND proname IN ('requests','projects') AND prorows=1 AND NOT prosecdef", database).stdout.strip() == '2'
    print('PASS 8 TypeScript interfaces and two invoker computed relationships', flush=True)
    print('SUCCESS: SQL migrations, behavior, security, concurrency and static compatibility', flush=True)
finally:
    sql('DROP DATABASE ' + database)
    print('Disposable test database removed; cluster lifecycle remains with caller', flush=True)
