#!/usr/bin/env python3
"""Recovery-only tests in a marked /tmp Unix-socket PostgreSQL cluster.

Does not run behavior.sql, run_local.py, consumer tests, Auth inserts or bootstrap.
No remote mode, credentials, environment files, TCP connection or CLI login.
"""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_migration_recovery as recovery

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, required=True)
parser.add_argument('--socket', type=Path, required=True)
parser.add_argument('--cluster', type=Path, required=True)
parser.add_argument('--port', type=int, default=55474)
parser.add_argument('--evidence', type=Path, required=True)
args = parser.parse_args()
cluster, socket = args.cluster.resolve(), args.socket.resolve()
if not cluster.is_relative_to('/tmp') or not socket.is_relative_to('/tmp'):
    parser.error('Only /tmp disposable paths allowed')
if not (cluster / '.procont-isolated-tests').is_file():
    parser.error('Explicit isolation marker missing')
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env['PGPASSFILE'] = str(cluster / 'nonexistent-password-file')
env['PGSERVICEFILE'] = str(cluster / 'nonexistent-service-file')
base = [str(args.pg_bin / 'psql'), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1',
        '-h', str(socket), '-p', str(args.port), '-U', getpass.getuser(), '-Atq']


def sql(statement, db='postgres', check=True):
    result = subprocess.run(base + ['-d', db], input='SET search_path=pg_catalog,public;\n' + statement,
                            env=env, capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr)
    return result


server = json.loads(sql("SELECT json_build_object('directory',current_setting('data_directory'),"
                        "'listen',current_setting('listen_addresses'),'version',version())").stdout)
if Path(server['directory']).resolve() != cluster or server['listen'] != '':
    parser.error('Expected isolated cluster, TCP disabled')
approved = recovery.manifest()
migrations = [ROOT / 'supabase/migrations' / item['file'] for item in approved]
inventory_sql = (recovery.RECOVERY / 'inventory.sql').read_text()
results = []
databases = []


def record(name, **details):
    results.append(dict(test=name, passed=True, **details))
    print('PASS ' + name, flush=True)


def inventory(db):
    return json.loads(sql(inventory_sql, db).stdout)


def fixture():
    db = 'procont_recovery_' + uuid.uuid4().hex[:12]
    sql('CREATE DATABASE ' + db)
    databases.append(db)
    sql((ROOT / 'supabase/tests/support/auth_stub.sql').read_text(), db)
    sql("""
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
CREATE SCHEMA storage; CREATE SCHEMA realtime; CREATE SCHEMA extensions;
CREATE TABLE storage.platform_guard(id integer PRIMARY KEY, value text NOT NULL);
INSERT INTO storage.platform_guard VALUES (1,'preserve-platform-sentinel');
CREATE TABLE public.platform_guard(id integer PRIMARY KEY);
CREATE FUNCTION public.platform_guard_fn() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
CREATE FUNCTION auth.platform_guard_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER platform_guard BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION auth.platform_guard_trigger();
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_guard;
GRANT CREATE ON SCHEMA public TO PUBLIC;
GRANT CREATE ON SCHEMA public TO anon,authenticated WITH GRANT OPTION;
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO service_role;
""", db)
    recovery.validate_baseline(inventory(db))
    return db


def insert_history(db, index):
    path = migrations[index]
    # Model the separate post-COMMIT insert used by the pinned CLI. No CLI execution claimed.
    sql('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (' +
        ','.join([recovery.literal(path.name.split('_')[0]),
                  recovery.literal(path.stem.split('_', 1)[1]),
                  'ARRAY[' + recovery.literal(path.read_text()) + ']']) + ');', db)


def apply(db, through, missing_last_history=False):
    snapshots = [inventory(db)]
    for n in range(through):
        sql(migrations[n].read_text(), db)
        if not (missing_last_history and n == through - 1):
            insert_history(db, n)
        snapshots.append(inventory(db))
    return snapshots


def recover(db, snapshots):
    sql(recovery.build(snapshots), db)
    assert inventory(db) == recovery.retain_cli_ledger(snapshots[0], snapshots[-1])
    finish_cli_repair_model(db, snapshots)
    assert inventory(db) == snapshots[0], 'Catalog/ACL/history restoration mismatch'
    assert sql('SELECT value FROM storage.platform_guard WHERE id=1', db).stdout.strip() == 'preserve-platform-sentinel'


def finish_cli_repair_model(db, snapshots):
    # Isolated model of native migration repair --status reverted, AFTER SQL compensation.
    # Never a direct remote ledger-edit procedure; this historical suite was not rerun in 2B.3D.
    for version in recovery.repair_plan(snapshots)['versions_to_mark_reverted']:
        sql('DELETE FROM supabase_migrations.schema_migrations WHERE version=' + recovery.literal(version), db)


def expect_failure(statement, db):
    result = sql(statement, db, check=False)
    assert result.returncode != 0, 'Expected fail-stop error'
    return result


try:
    # Platform roles only; never Auth accounts. Roles are confined to this disposable cluster.
    sql("DO $$ BEGIN "
        "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; "
        "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; "
        "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END $$;")

    for through in range(1, 5):
        db = fixture()
        snapshots = apply(db, through)
        # Error after the committed prefix; ON_ERROR_STOP must prevent the next command.
        expect_failure("SELECT 1/0; CREATE TABLE public.must_not_execute(id integer);", db)
        assert inventory(db) == snapshots[-1]
        recover(db, snapshots)
        # Reapply precisely the original files after a complete compensation.
        second = apply(db, 4)
        recover(db, second)
        record(f'failure_after_migration_{through}', restored_baseline=True,
               reapplication_of_original_four=True, platform_sentinel_preserved=True)

        db = fixture()
        snapshots = apply(db, through - 1)
        # The file fails before its own COMMIT: no changes or version for that file survive.
        content = migrations[through - 1].read_text()
        damaged = content.rsplit('COMMIT;', 1)[0] + "SELECT 1/0;\nCOMMIT;\n"
        expect_failure(damaged, db)
        assert inventory(db) == snapshots[-1]
        if through > 1:
            recover(db, snapshots)
        record(f'failure_inside_migration_{through}', failed_file_rolled_back=True)

        db = fixture()
        snapshots = apply(db, through, missing_last_history=True)
        recover(db, snapshots)
        record(f'commit_without_history_{through}', restored_baseline=True)

    db = fixture()
    snapshots = apply(db, 4)
    bundle = recovery.build(snapshots)
    # Failure INSIDE compensation after data removal must undo the removal and ledger edits.
    damaged = bundle.replace('DELETE FROM public.checklist_templates;',
                             'DELETE FROM public.checklist_templates; SELECT 1/0;', 1)
    expect_failure(damaged, db)
    assert inventory(db) == snapshots[-1]
    record('compensation_failure_rolls_back_everything')

    # An unforeseen dependency is preserved; the inventory guard rejects before any DROP.
    sql('CREATE VIEW public.foreign_dependency AS SELECT id FROM public.projects;', db)
    drift = inventory(db)
    expect_failure(bundle, db)
    assert inventory(db) == drift
    sql('DROP VIEW public.foreign_dependency;', db)
    sql("CREATE RULE foreign_rule AS ON UPDATE TO public.projects DO ALSO NOTIFY procont_test_rule;", db)
    drift = inventory(db)
    expect_failure(bundle, db)
    assert inventory(db) == drift
    sql('DROP RULE foreign_rule ON public.projects;', db)
    record('foreign_dependency_and_rule_preserved_and_recovery_refused')
    sql('GRANT SELECT ON public.requests TO anon;', db)
    drift = inventory(db)
    expect_failure(bundle, db)
    assert inventory(db) == drift
    record('permission_drift_refuses_recovery')

    db = fixture()
    snapshots = apply(db, 4)
    bundle = recovery.build(snapshots)
    sql("UPDATE public.checklist_templates SET description='changed later' WHERE id=(SELECT id FROM public.checklist_templates LIMIT 1);", db)
    drift = inventory(db)
    expect_failure(bundle, db)
    assert inventory(db) == drift
    record('changed_reference_templates_preserved')

    db = fixture()
    snapshots = apply(db, 3)
    bundle = recovery.build(snapshots)
    # A generic record in a private app table, without an Auth account or bootstrap.
    sql("INSERT INTO app_private.security_events(action) VALUES ('synthetic_recovery_guard');", db)
    drift = inventory(db)
    expect_failure(bundle, db)
    assert inventory(db) == drift
    try:
        recovery.build(snapshots[:-1] + [drift])
        raise AssertionError('Builder accepted business data')
    except ValueError:
        pass
    record('nonempty_app_table_preserved_and_builder_refused')

    db = fixture()
    sql('CREATE FUNCTION public.submit_request(text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;', db)
    try:
        recovery.validate_baseline(inventory(db))
        raise AssertionError('Accepted colliding RPC overload')
    except ValueError:
        pass
    db = fixture()
    sql('CREATE PUBLICATION foreign_all_tables FOR ALL TABLES;', db)
    try:
        recovery.validate_baseline(inventory(db))
        raise AssertionError('Accepted an ALL TABLES publication outside realtime')
    except ValueError:
        pass
    record('initial_rpc_collision_and_all_tables_publication_rejected')

    db = fixture()
    snapshots = apply(db, 1)
    # Keep versions/names of unrelated ledger entries intact, even when maliciously supplied.
    sql("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('99999999999999','foreign');", db)
    drift = inventory(db)
    try:
        recovery.build([snapshots[0], drift])
        raise AssertionError('Accepted foreign history')
    except ValueError:
        pass
    expect_failure(recovery.build(snapshots), db)
    assert inventory(db) == drift
    record('foreign_history_preserved_and_recovery_refused')

    db = fixture()
    snapshots = apply(db, 4)
    for stage in range(1, 5):
        expect_failure((recovery.RECOVERY / f'compensate_{stage:02}.sql').read_text(), db)
        assert inventory(db) == snapshots[-1]
    record('four_compensation_bodies_refuse_standalone_execution')

    # Atomic feasibility: strip ONLY known boundary lines on test copies and include ledger
    # writes within one transaction. This is NOT the unchanged CLI application path.
    for through in range(1, 6):
        db = fixture()
        initial = inventory(db)
        statements = ['BEGIN;']
        for n in range(min(through, 4)):
            content = migrations[n].read_text()
            lines = content.splitlines()
            assert sum(line == 'BEGIN;' for line in lines) == 1
            assert sum(line == 'COMMIT;' for line in lines) == 1
            statements.append('\n'.join(line for line in lines if line not in ('BEGIN;', 'COMMIT;')))
            statements.append('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (' +
                              recovery.literal(migrations[n].name.split('_')[0]) + ',' +
                              recovery.literal(migrations[n].stem.split('_', 1)[1]) + ',ARRAY[' +
                              recovery.literal(content) + ']);')
        if through <= 4:
            statements.extend(['SELECT 1/0;', 'COMMIT;'])
            expect_failure('\n'.join(statements), db)
            assert inventory(db) == initial
            record(f'atomic_test_copy_failure_{through}', ddl_and_ledger_rolled_back=True,
                   native_cli=False, approved_for_remote=False)
        else:
            statements.append('COMMIT;')
            sql('\n'.join(statements), db)
            assert len(recovery.history(inventory(db))) == 4
            assert inventory(db)['row_counts']['public.checklist_templates'] == 35
            record('atomic_test_copy_success', four_versions=True, native_cli=False,
                   approved_for_remote=False)

    # Evidence inventory contains only isolated fixture metadata, never remote data.
    db = fixture()
    snapshots = apply(db, 4)
    with tempfile.TemporaryDirectory(prefix='procont-recovery-cli-', dir='/tmp') as folder:
        directory = Path(folder)
        for n, snap in enumerate(snapshots):
            (directory / f'{n}.json').write_text(json.dumps(snap))
        output = directory / 'review.sql'
        command = [sys.executable, str(ROOT / 'scripts/build_migration_recovery.py'),
                   '--snapshots', folder, '--through', '4', '--output', str(output)]
        subprocess.run(command, check=True, capture_output=True, text=True)
        assert output.stat().st_mode & 0o777 == 0o600
        assert subprocess.run(command, capture_output=True).returncode != 0
        sql(output.read_text(), db)
        finish_cli_repair_model(db, snapshots)
        assert inventory(db) == snapshots[0]
    record('offline_generator_private_file_no_overwrite_and_executable_bundle')
    summary = {
        'phase': '2B.3B', 'base_commit': 'd48dbfb',
        'checked_at_utc': datetime.now(timezone.utc).isoformat(),
        'environment': {'postgresql': server['version'], 'tcp_enabled': False,
                        'auth': 'minimal stub; no accounts', 'history': 'CLI 3.2.0 shape; simulated insert'},
        'original_migrations': approved,
        'tests': results, 'passed': len(results), 'remote_sql_executed': False,
        'remote_mutations_performed': False, 'auth_accounts_created': 0,
        'bootstrap_calls': 0, 'prior_72_sql_tests_repeated': False,
        'prior_19_integration_tests_repeated': False,
        'limitations': ['No hosted Supabase services or CLI driver execution',
                        'Remote inventory/version/ACL grantors not yet captured',
                        'Atomic copy experiment is not an approved application path'],
        'baseline_example': snapshots[0],
        'object_counts_by_prefix': [{category: len(s[category]) for category in
                                    ('schemas', 'relations', 'functions', 'policies', 'triggers', 'publication_tables')}
                                   for s in snapshots],
    }
    args.evidence.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + '\n')
    print(f'SUCCESS: {len(results)} recovery-only checks; no Auth accounts or remote operations', flush=True)
finally:
    for database in databases:
        sql('DROP DATABASE ' + database)
    print('All disposable recovery databases removed', flush=True)
