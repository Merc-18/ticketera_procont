# Local M1-M15 reference: dumps the same function fingerprint as preflight/functions.sql.
import getpass, os, subprocess, sys, tempfile, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; pg, lib, root = map(Path, sys.argv[1:4])
work = Path(tempfile.mkdtemp(prefix='m15ref-', dir=root)); cl, so = work/'c', work/'s'; so.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')} | {'LD_LIBRARY_PATH': str(lib)}
base = [str(pg/'psql'), '-X', '-v', 'ON_ERROR_STOP=1', '-Atq', '-h', str(so), '-p', '55528', '-U', getpass.getuser(), '-d', 'postgres']
q = lambda t: subprocess.run(base, input=t, env=env, text=True, capture_output=True, check=True).stdout.strip()
subprocess.run([str(pg/'initdb'), '-D', str(cl), '-A', 'trust', '--locale=C.UTF-8', '-E', 'UTF8'], env=env, check=True, capture_output=True)
srv = subprocess.Popen([str(pg/'postgres'), '-D', str(cl), '-c', 'listen_addresses=', '-c', f'unix_socket_directories={so}', '-c', 'wal_level=logical', '-p', '55528'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(200):
        if subprocess.run(base, input='SELECT 1', env=env, text=True, capture_output=True).returncode == 0: break
        time.sleep(.05)
    o = 'procont_m16_owner'
    q(f'CREATE ROLE {o} NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; ALTER DATABASE postgres OWNER TO {o};')
    q((ROOT/'supabase/tests/support/auth_stub.sql').read_text())
    q(f'ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz; GRANT USAGE ON SCHEMA auth TO {o}; GRANT SELECT(id,email,raw_user_meta_data,email_confirmed_at),REFERENCES(id) ON auth.users TO {o}; ALTER PUBLICATION supabase_realtime OWNER TO {o};')
    q(f"CREATE SCHEMA storage AUTHORIZATION {o}; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,created_at timestamptz DEFAULT now(),metadata jsonb DEFAULT '{{}}'::jsonb); ALTER TABLE storage.buckets OWNER TO {o}; ALTER TABLE storage.objects OWNER TO {o};")
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'))[:15]: q(f'SET ROLE {o};\n' + m.read_text())
    print(q((ROOT/'docs/validation/m16b-preparation-20261123/preflight/functions.sql').read_text()))
finally:
    subprocess.run([str(pg/'pg_ctl'), '-D', str(cl), 'stop', '-m', 'fast', '-w'], env=env, capture_output=True)
