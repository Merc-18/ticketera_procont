"""New native CLI wrapper checks: synthetic fixtures and no SQL/network."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('cli_connection',
    Path(__file__).resolve().parents[1] / 'scripts/connect_supabase_cli.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
REF = 'a' * 20


class CliConnectionTests(unittest.TestCase):
    def test_only_pinned_project_and_session_pooler(self):
        route, password = MODULE.parse_target(f'postgresql://postgres:synthetic@db.{REF}.supabase.co/postgres', REF)
        self.assertEqual(route['host'], f'db.{REF}.supabase.co')
        self.assertEqual(password, 'synthetic')
        pooler = f'postgresql://postgres.{REF}:[YOUR-PASSWORD]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
        self.assertEqual(MODULE.parse_target(pooler, REF)[1], '')
        wrong = [f'postgresql://postgres@db.{"b" * 20}.supabase.co/postgres',
                 pooler.replace(':5432/', ':6543/'), pooler.replace(REF, 'b' * 20),
                 pooler + '?host=localhost', pooler + '?sslmode=disable',
                 'postgresql://postgres@localhost/postgres']
        for url in wrong:
            with self.subTest(url=url), self.assertRaises(MODULE.ConnectionError):
                MODULE.parse_target(url, REF)

    def test_percent_encoded_password_never_in_route(self):
        route, password = MODULE.parse_target(f'postgresql://postgres:p%40ss%3Aword@db.{REF}.supabase.co/postgres', REF)
        self.assertEqual(password, 'p@ss:word')
        self.assertNotIn('password', route)
        self.assertNotIn(password, json.dumps(route))

    def test_password_in_child_environment_only(self):
        with patch.dict('os.environ', {'SUPABASE_ACCESS_TOKEN': 'synthetic-token', 'PGSERVICE': 'other'}):
            env = MODULE.cli_environment('synthetic-password')
        self.assertEqual(env['PGPASSWORD'], 'synthetic-password')
        self.assertEqual(env['PGSSLMODE'], 'verify-full')
        self.assertEqual(env['PGSERVICE'], '')
        self.assertNotIn('SUPABASE_ACCESS_TOKEN', env)
        self.assertEqual(env['SUPABASE_TELEMETRY_DISABLED'], '1')

    def test_query_routes_to_read_only_native_driver(self):
        with patch.object(MODULE, 'cli_run', return_value='[{"result":{"ok":true}}]') as run:
            self.assertEqual(MODULE.query('postgresql://pinned', Path('query.sql'), {}), {'ok': True})
        arguments = run.call_args.args[0]
        self.assertIn('--remote=postgresql://pinned', arguments)
        self.assertIn('--read-only', arguments)
        self.assertNotIn('--remote', arguments)
        with patch.object(MODULE, 'cli_run', return_value='[]'):
            with self.assertRaises(MODULE.ConnectionError):
                MODULE.query('postgresql://pinned', Path('query.sql'), {})

    def test_saved_link_reuses_only_pinned_endpoint(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / 'supabase' / '.temp'
            folder.mkdir(parents=True)
            target = {'project_ref': REF, 'expected_name': 'ticketera-procont'}
            (folder / 'project-ref').write_text(REF)
            (folder / 'pooler-url').write_text(
                f'postgresql://postgres.{REF}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres')
            (folder / 'linked-project.json').write_text(json.dumps(
                {'ref': REF, 'name': 'ticketera-procont'}))
            with patch.object(MODULE, 'ROOT', Path(temporary)):
                self.assertEqual(MODULE.saved_link_route(target)['user'], f'postgres.{REF}')
                (folder / 'project-ref').write_text('b' * 20)
                with self.assertRaises(MODULE.ConnectionError):
                    MODULE.saved_link_route(target)

    def test_identity_and_privilege_failures_stop(self):
        previous = {'database_oid': 1, 'server_version_num': 170012,
                    'current_user': 'postgres', 'session_user': 'postgres'}
        identity = {**previous, 'checks': {}}
        with self.assertRaises(MODULE.ConnectionError):
            MODULE.verify_identity(identity, previous)
        identity['database_oid'] = 2
        with self.assertRaises(MODULE.ConnectionError):
            MODULE.verify_identity(identity, previous)


class DiagnosticsTests(unittest.TestCase):
    def test_classifies_only_fixed_categories(self):
        messages = {
            'tls': 'SELF_SIGNED_CERT_IN_CHAIN synthetic-secret',
            'password': 'password authentication failed for user synthetic-secret SQLSTATE 28P01',
            'endpoint': 'Tenant or user not found synthetic-secret',
            'connection': 'connect ECONNREFUSED synthetic-secret',
            'cli_execution': 'Unknown option synthetic-secret',
            'api_auth': 'Unauthorized synthetic-secret',
            'sql_permissions': 'permission denied SQLSTATE 42501 synthetic-secret',
            'sql': 'syntax error SQLSTATE 42601 synthetic-secret',
            'unclassified': 'synthetic-secret',
        }
        for category, text in messages.items():
            with self.subTest(category=category):
                self.assertEqual(MODULE.classify_failure(text), category)

    def test_diagnostic_contains_no_raw_output_or_secrets(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / 'recovery'
            folder.mkdir()
            process = __import__('subprocess').CompletedProcess([], 1,
                stdout='synthetic-password sbp_synthetic-token',
                stderr='SELF_SIGNED_CERT_IN_CHAIN postgresql://private-endpoint')
            with patch.object(MODULE, 'PRIVATE', Path(temporary)), \
                    patch.object(MODULE.subprocess, 'run', return_value=process):
                with self.assertRaises(MODULE.ConnectionError) as error:
                    MODULE.cli_run(['db', 'query'], {'PGPASSWORD': 'synthetic-password'}, stage='identity_native')
            output = str(error.exception)
            files = list(folder.iterdir())
            self.assertEqual(len(files), 1)
            output += files[0].read_text()
            for secret in ('synthetic-password', 'sbp_synthetic-token', 'private-endpoint'):
                self.assertNotIn(secret, output)
            self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(files[0].read_text())['category'], 'tls')

    def test_unknown_error_keeps_native_stage_without_password_guess(self):
        with tempfile.TemporaryDirectory() as temporary:
            (Path(temporary) / 'recovery').mkdir()
            process = __import__('subprocess').CompletedProcess([], 1, stdout='', stderr='unrecognized failure')
            with patch.object(MODULE, 'PRIVATE', Path(temporary)), \
                    patch.object(MODULE.subprocess, 'run', return_value=process):
                with self.assertRaises(MODULE.ConnectionError) as error:
                    MODULE.query('postgresql://pinned', Path('connection_check.sql'), {})
            self.assertIn('connection_check_native', str(error.exception))
            self.assertIn('SIN CLASIFICAR', str(error.exception))
            diagnostic = json.loads(next((Path(temporary) / 'recovery').iterdir()).read_text())
            self.assertEqual(diagnostic['category'], 'unclassified')

    def test_native_mode_keeps_full_verification_with_explicit_ca(self):
        env = MODULE.cli_environment('synthetic-password')
        self.assertEqual(env['PGSSLMODE'], 'verify-full')
        self.assertEqual(env['PGSSLROOTCERT'], str(MODULE.ROOT_CA))
        __import__('ssl').create_default_context(cafile=env['PGSSLROOTCERT'])


if __name__ == '__main__':
    unittest.main()
