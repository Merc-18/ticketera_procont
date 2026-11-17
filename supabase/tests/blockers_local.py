#!/usr/bin/env python3
"""New 2B.3D cases only. Own socket-only /tmp cluster, no remote mode or Auth rows.

Starts/stops PostgreSQL and pg_ctl in the SAME PID namespace. Never imports or
runs the 72 SQL, 19 consumer or 26 historical recovery checks.
"""
import argparse
from datetime import datetime, timezone
import getpass
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_migration_recovery as recovery

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--runtime-lib', type=Path, required=True)
parser.add_argument('--evidence', type=Path, required=True)
args = parser.parse_args()
args.pg_bin = args.pg_bin.resolve()
work = Path(tempfile.mkdtemp(prefix='procont-2b3d-', dir='/tmp'))
cluster, socket = work / 'cluster', work / 'socket'
socket.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env['LD_LIBRARY_PATH'] = str(args.runtime_lib.resolve())
env['PGPASSFILE'] = str(work / 'nonexistent-password-file')
env['PGSERVICEFILE'] = str(work / 'nonexistent-service-file')
port = 55475
operator = 'procont_migrator_2b3d'
auth_owner = 'procont_auth_owner_2b3d'
platform_owner = 'procont_platform_owner_2b3d'
base = [str(args.pg_bin / 'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1',
        '-v', 'VERBOSITY=verbose', '-Atq', '-h', str(socket), '-p', str(port), '-U', getpass.getuser()]
tests = []
databases = []
server = None
log = (work / 'server.log').open('w')


def sql(statement, db='postgres', limited=False, check=True):
    prefix = f'SET ROLE {operator};\n' if limited else ''
    result = subprocess.run(base + ['-d', db], input=prefix + 'SET search_path=pg_catalog,public;\n' + statement,
                            env=env, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr)
    return result


def capture(db):
    return json.loads(sql((recovery.RECOVERY / 'inventory.sql').read_text(), db, limited=True).stdout)


def passed(name, **facts):
    tests.append(dict(name=name, passed=True, **facts))
    print('PASS ' + name, flush=True)


def fixture(index):
    db = f'procont_blockers_{index}'
    sql(f'CREATE DATABASE {db} OWNER {operator};')
    databases.append(db)
    sql((ROOT / 'supabase/tests/support/auth_stub.sql').read_text(), db)
    sql(f"""
ALTER SCHEMA auth OWNER TO {auth_owner};
ALTER TABLE auth.users OWNER TO {auth_owner};
ALTER FUNCTION auth.uid() OWNER TO {auth_owner};
GRANT USAGE ON SCHEMA auth TO {operator};
GRANT REFERENCES(id),SELECT(id,email,raw_user_meta_data) ON auth.users TO {operator};
ALTER PUBLICATION supabase_realtime OWNER TO {operator};
CREATE SCHEMA extensions AUTHORIZATION {platform_owner};
""", db)
    sql((ROOT / 'supabase/tests/support/pgrst_watchers_2b3d.sql').read_text(), db)
    sql(f"""
ALTER FUNCTION extensions.pgrst_ddl_watch() OWNER TO {platform_owner};
ALTER FUNCTION extensions.pgrst_drop_watch() OWNER TO {platform_owner};
CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end EXECUTE FUNCTION extensions.pgrst_ddl_watch();
CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop EXECUTE FUNCTION extensions.pgrst_drop_watch();
ALTER EVENT TRIGGER pgrst_ddl_watch OWNER TO {platform_owner};
ALTER EVENT TRIGGER pgrst_drop_watch OWNER TO {platform_owner};
""", db)
    for event_name, function_name, event, tag in [
        ('issue_graphql_placeholder','set_graphql_placeholder','sql_drop','DROP EXTENSION'),
        ('issue_pg_cron_access','grant_pg_cron_access','ddl_command_end','CREATE EXTENSION'),
        ('issue_pg_graphql_access','grant_pg_graphql_access','ddl_command_end','CREATE EXTENSION'),
        ('issue_pg_net_access','grant_pg_net_access','ddl_command_end','CREATE EXTENSION'),
    ]:
        sql(f"""
CREATE FUNCTION extensions.{function_name}() RETURNS event_trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Extension-only fixture must not fire during application DDL'; END $$;
ALTER FUNCTION extensions.{function_name}() OWNER TO {platform_owner};
CREATE EVENT TRIGGER {event_name} ON {event} WHEN TAG IN ('{tag}')
  EXECUTE FUNCTION extensions.{function_name}();
ALTER EVENT TRIGGER {event_name} OWNER TO {platform_owner};
""", db)
    return db


def cli_setup_model(db):
    # Pinned native createMigrationTable semantics, on disposable DB ONLY.
    # This is not a remote run or a replacement CLI implementation for deployment.
    sql("""BEGIN; SET LOCAL lock_timeout='4s';
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text NOT NULL PRIMARY KEY);
ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS statements text[];
ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS name text;
COMMIT;""", db, limited=True)


def apply_prefix(db, through, last_history_missing=False):
    snapshots = [capture(db)]
    recovery.validate_baseline(snapshots[0])
    assert snapshots[0]['history'] is None
    cli_setup_model(db)
    for index, item in enumerate(recovery.manifest()[:through], 1):
        content = (ROOT / 'supabase/migrations' / item['file']).read_text()
        response = sql('LISTEN pgrst;\n' + content, db, limited=True)
        assert 'reload schema' in response.stdout or index == 4
        if not (last_history_missing and index == through):
            version, name = item['file'][:-4].split('_', 1)
            sql('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (' +
                recovery.literal(version) + ',' + recovery.literal(name) + ',ARRAY[' + recovery.literal(content) + ']);',
                db, limited=True)
        snapshots.append(capture(db))
    return snapshots


def native_repair_model(db, snapshots):
    # Exact operation of supported CLI repair --status reverted, modeled locally.
    # Executed ONLY after successful schema compensation. No direct remote ledger edits.
    versions = recovery.repair_plan(snapshots)['versions_to_mark_reverted']
    if versions:
        sql('DELETE FROM supabase_migrations.schema_migrations WHERE version=ANY(ARRAY[' +
            ','.join(recovery.literal(v) for v in versions) + ']);', db, limited=True)
    return versions


try:
    subprocess.run([str(args.pg_bin / 'initdb'), '-D', str(cluster), '-A', 'trust', '--no-locale', '-E', 'UTF8'],
                   check=True, env=env, stdout=subprocess.DEVNULL, stderr=log)
    (cluster / '.procont-isolated-tests').touch()
    server = subprocess.Popen([str(args.pg_bin / 'postgres'), '-D', str(cluster),
        '-c', 'listen_addresses=', '-c', f'unix_socket_directories={socket}', '-p', str(port),
        '-c', 'wal_level=logical'], env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log)
    for attempt in range(100):
        ready = sql('SELECT 1;', check=False)
        if ready.returncode == 0:
            break
        if server.poll() is not None:
            raise RuntimeError('Disposable server exited; inspect private /tmp log')
        time.sleep(0.05)
    else:
        raise RuntimeError('Disposable server readiness timed out')
    server_info = json.loads(sql("SELECT json_build_object('directory',current_setting('data_directory'),"
                                "'listen',current_setting('listen_addresses'),'version',version())").stdout)
    assert Path(server_info['directory']).resolve() == cluster and server_info['listen'] == ''
    for role, suffix in [('anon',''),('authenticated',''),('service_role','BYPASSRLS'),
                         (operator,''),(auth_owner,''),(platform_owner,'SUPERUSER')]:
        sql(f'CREATE ROLE {role} NOLOGIN {suffix};')

    db = fixture(1)
    initial = capture(db)
    auth_triggers_before = sql("SELECT coalesce(jsonb_agg(jsonb_build_array(oid,tgname,tgisinternal) ORDER BY oid),'[]') "
                               "FROM pg_trigger WHERE tgrelid='auth.users'::regclass",db).stdout
    assert len(initial['event_triggers']) == 6
    assert initial['relations']['auth.users']['owner'] == auth_owner
    assert sql("SELECT has_table_privilege(current_user,'auth.users','TRIGGER') OR "
               "pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='auth.users'::regclass),'USAGE');",
               db, limited=True).stdout.strip() == 'f'
    recovery.validate_baseline(initial)
    passed('cold_cli_baseline_without_history_and_without_auth_ownership_accepted')

    snapshots = apply_prefix(db, 4)
    assert snapshots[0] == initial
    final = snapshots[-1]
    assert not any(k.startswith('auth.users.procont_') for k in final['triggers'])
    assert final['relations']['auth.users'] == initial['relations']['auth.users']
    assert final['event_triggers'] == initial['event_triggers']
    passed('four_revised_migrations_under_non_superuser_without_auth_trigger_privilege',
           application_ddl_succeeded=True, auth_owner_unchanged=True, auth_accounts=0)

    for role in ('anon','authenticated','service_role'):
        result = sql(f"SELECT has_function_privilege('{role}','app_private.provision_auth_profile(uuid)','EXECUTE');",db)
        assert result.stdout.strip() == 'f'
    assert not final['row_counts']['public.users'] and not final['row_counts']['auth.users']
    result = sql("SELECT app_private.provision_auth_profile('00000000-0000-0000-0000-000000000000');",
                 db, limited=True, check=False)
    assert result.returncode != 0 and '22023' in result.stderr
    passed('owner_only_provisioning_rejects_missing_identity_without_creating_accounts')

    bundle = recovery.build(snapshots)
    assert 'LOCK TABLE auth.users' not in bundle and 'DROP TRIGGER procont_auth_' not in bundle
    assert 'DELETE FROM supabase_migrations' not in bundle
    ledger_before = final['history']
    sql('LISTEN pgrst;\n' + bundle, db, limited=True)
    restored = capture(db)
    assert restored == recovery.retain_cli_ledger(initial, final)
    assert restored['history'] == ledger_before
    assert restored['event_triggers'] == initial['event_triggers']
    assert restored['relations']['auth.users'] == initial['relations']['auth.users']
    assert sql("SELECT coalesce(jsonb_agg(jsonb_build_array(oid,tgname,tgisinternal) ORDER BY oid),'[]') "
               "FROM pg_trigger WHERE tgrelid='auth.users'::regclass",db).stdout == auth_triggers_before
    passed('compensation_without_auth_ownership_preserves_native_ledger_and_six_event_triggers')

    reverted = native_repair_model(db, snapshots)
    assert len(reverted) == 4 and recovery.history(capture(db)) == {}
    assert 'supabase_migrations.schema_migrations' in capture(db)['relations']
    passed('separate_native_repair_semantics_restore_empty_history_without_dropping_platform_objects',
           native_cli_driver=False, remote_execution=False)

    db = fixture(2)
    snapshots = apply_prefix(db, 3, last_history_missing=True)
    plan = recovery.repair_plan(snapshots)
    assert len(plan['versions_to_mark_reverted']) == 2
    sql(recovery.build(snapshots), db, limited=True)
    assert capture(db) == recovery.retain_cli_ledger(snapshots[0], snapshots[-1])
    native_repair_model(db, snapshots)
    assert recovery.history(capture(db)) == {}
    passed('cold_cli_initialization_and_commit_without_last_version_recover_without_manual_ledger_sql')

    folder = work / 'snapshots'; folder.mkdir()
    for n, snap in enumerate(snapshots):
        (folder / f'{n}.json').write_text(json.dumps(snap))
    out = work / 'review.sql'
    subprocess.run([sys.executable,str(ROOT / 'scripts/build_migration_recovery.py'),
                    '--snapshots',str(folder),'--through','3','--output',str(out)],
                   check=True, env=env, capture_output=True)
    sidecar = out.with_suffix('.sql.repair-plan.json')
    assert out.stat().st_mode & 0o777 == sidecar.stat().st_mode & 0o777 == 0o600
    assert json.loads(sidecar.read_text())['versions_to_mark_reverted'] == plan['versions_to_mark_reverted']
    collision = work / 'collision.sql'
    collision.with_suffix('.sql.repair-plan.json').write_text('{}')
    refused = subprocess.run([sys.executable,str(ROOT / 'scripts/build_migration_recovery.py'),
                             '--snapshots',str(folder),'--through','3','--output',str(collision)],
                            env=env,capture_output=True)
    assert refused.returncode != 0 and not collision.exists()
    passed('offline_bundle_and_separate_supported_repair_plan_are_private_files')

    evidence = {'phase':'2B.3D','base_commit':'11b2c15','checked_at_utc':datetime.now(timezone.utc).isoformat(),
                'environment':server_info,'tests':tests,'passed':len(tests),
                'model':'non-superuser migration operator; platform owns Auth and six event-trigger models',
                'limits':['PostgreSQL 18.6 local; remote 17.12 only user-reported',
                         'No Auth identities created: positive provisioning/refresh with real identity not executed',
                         'PostgREST handlers modeled from reviewed behavior, not copied from hosted definitions',
                         'CLI initialization/repair SQL modeled from pinned source; native CLI driver not run'],
                'prior_suites_repeated':False,'auth_accounts_created':0,'bootstrap_executed':False,
                'remote_sql_executed':False,'external_mutations':False}
finally:
    if server is not None and server.poll() is None:
        try:
            for db in databases:
                sql('DROP DATABASE ' + db + ';', check=False)
        finally:
            stop = subprocess.run([str(args.pg_bin / 'pg_ctl'), '-D', str(cluster), '-m', 'fast', '-w', '-t', '30', 'stop'],
                                  env=env, capture_output=True, text=True)
        assert stop.returncode == 0, stop.stderr
        server.wait(timeout=10)
        assert not (cluster / 'postmaster.pid').exists()
        print('Disposable PostgreSQL stopped by pg_ctl in the same PID namespace', flush=True)
    log.close()

evidence['postgresql_shutdown_confirmed'] = True
args.evidence.write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(f'SUCCESS: {len(tests)} new 2B.3D checks; no Auth accounts or remote operations', flush=True)
