#!/usr/bin/env python3
"""M14 only (client_login_throttle) on a disposable PostgreSQL 17 Unix socket.

M1-M13 are fixture setup only; their own suites are not invoked. No network, no remote.
"""
import argparse
import getpass
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
M14 = '20261119000200_client_login_throttle.sql'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
args = parser.parse_args()
work = Path(tempfile.mkdtemp(prefix='procont-client-m14-', dir='/tmp'))
cluster, socket = work/'cluster', work/'socket'
socket.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(LD_LIBRARY_PATH=str(args.runtime_lib), PGPASSFILE=str(work/'no-pass'), PGSERVICEFILE=str(work/'no-service'))
base = [str(args.pg_bin/'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq', '-h', str(socket),
        '-p', '55514', '-U', getpass.getuser(), '-d', 'postgres']
owner = 'procont_client_owner'
server = None

def sql(text, role=None):
    return subprocess.run(base, input=(f'SET ROLE {role};\n' if role else '')+text, env=env, text=True, capture_output=True)
def q(text, role=owner):
    result = sql(text, role)
    if result.returncode: raise RuntimeError(result.stderr)
    return result.stdout.strip()
def denied(text, role, code='42501'):
    result = sql(text, role)
    assert result.returncode != 0 and code in result.stderr, result.stderr or 'unexpected success'
def key(label): return hashlib.sha256(label.encode()).hexdigest()
def attempt(subject, ip): return q(f"SELECT public.client_login_throttle('{key(subject)}','{key(ip)}')", 'service_role')
def passed(name): print('PASS '+name, flush=True)

try:
    subprocess.run([str(args.pg_bin/'initdb'), '-D', str(cluster), '-A', 'trust', '--locale=C.UTF-8', '-E', 'UTF8'],
                   env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    log = (work/'server.log').open('w')
    server = subprocess.Popen([str(args.pg_bin/'postgres'), '-D', str(cluster), '-c', 'listen_addresses=',
        '-c', f'unix_socket_directories={socket}', '-c', 'wal_level=logical', '-p', '55514'], env=env, stdout=log, stderr=log)
    for _ in range(100):
        if sql('SELECT 1').returncode == 0: break
        time.sleep(.05)
    else: raise RuntimeError('Isolated PostgreSQL unavailable')
    assert q('SHOW listen_addresses', None) == ''
    q(f'CREATE ROLE {owner} NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; ALTER DATABASE postgres OWNER TO {owner};', None)
    q((ROOT/'supabase/tests/support/auth_stub.sql').read_text(), None)
    q(f'ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz; GRANT USAGE ON SCHEMA auth TO {owner}; GRANT SELECT(id,email,raw_user_meta_data,email_confirmed_at),REFERENCES(id) ON auth.users TO {owner}; ALTER PUBLICATION supabase_realtime OWNER TO {owner};', None)
    q(f'''CREATE SCHEMA storage AUTHORIZATION {owner};
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,created_at timestamptz DEFAULT now(),metadata jsonb DEFAULT '{{}}'::jsonb);
      ALTER TABLE storage.buckets OWNER TO {owner}; ALTER TABLE storage.objects OWNER TO {owner};
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated; GRANT SELECT,INSERT ON storage.objects TO anon,authenticated;''', None)
    # Historical M14 suite: do not mistake later files for a broken M14 baseline.
    paths = [p for p in sorted((ROOT/'supabase/migrations').glob('*.sql')) if p.name <= M14]
    assert len(paths) == 14 and paths[-1].name == M14, [p.name for p in paths]
    for path in paths[:-1]: q(path.read_text())
    before = q("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app_private')")
    q(paths[-1].read_text())
    after = q("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app_private')")
    assert int(after) == int(before) + 1
    passed('M14 applies on top of M1-M13 and adds exactly one function')

    for n in range(10): assert attempt('quipu:20000000001:UserA', f'ip-a-{n}') == 't'
    assert attempt('quipu:20000000001:UserA', 'ip-a-10') == 'f'
    assert attempt('quipu:20000000001:UserB', 'ip-b') == 't'
    passed('subject limit: 10 attempts per window, other identities unaffected')

    for n in range(50): attempt(f'quipufac:200000000{n:02d}', 'shared-ip')
    assert attempt('quipufac:20000000099', 'shared-ip') == 'f'
    assert attempt('quipufac:20000000098', 'other-ip') == 't'
    passed('IP limit: 50 attempts per window')

    stored = q("SELECT string_agg(bucket, ' ') FROM app_private.client_login_attempts")
    assert '20000000001' not in stored and 'UserA' not in stored and 'shared-ip' not in stored
    assert q("SELECT count(*) FROM app_private.client_login_attempts WHERE bucket !~ '^((subject|ip):[0-9a-f]{64}|global)$'") == '0'
    passed('only SHA-256 buckets are stored (no RUC, username or address)')

    for bad in ["'not-a-hash'", 'NULL', f"'{key('x').upper()}'"]:
        denied(f"SELECT public.client_login_throttle({bad},'{key('ip')}')", 'service_role', '22023')
    passed('invalid keys rejected with 22023')

    for role in ['anon', 'authenticated']:
        denied(f"SELECT public.client_login_throttle('{key('s')}','{key('i')}')", role)
        denied('SELECT count(*) FROM app_private.client_login_attempts', role)
    denied('SELECT count(*) FROM app_private.client_login_attempts', 'service_role')
    passed('only service_role may call the function; nobody reads the table directly')

    q("UPDATE app_private.client_login_attempts SET window_start = window_start - interval '15 minutes'", None)
    assert attempt('quipu:20000000001:UserA', 'ip-new-window') == 't'
    passed('counters reset in the next 15-minute window')
    print('ALL M14 LOCAL CHECKS PASSED')
finally:
    if server and server.poll() is None:
        server.terminate(); server.wait(timeout=20)
    shutil.rmtree(work, ignore_errors=True)
