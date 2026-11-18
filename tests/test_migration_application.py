"""New application-runner safeguards; synthetic fixtures, no database or network."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('migration_application',
    Path(__file__).resolve().parents[1] / 'scripts/apply_supabase_migrations.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ApplicationSafeguards(unittest.TestCase):
    def test_only_exact_pending_plan_without_seeds_or_roles(self):
        valid = {'success': True, 'data': {'migrations': ['first.sql'], 'seeds': [], 'roles': [], 'dryRun': True}}
        MODULE.structured_plan(json.dumps(valid), ['first.sql'], True)
        for key, value in [('migrations', ['first.sql', 'extra.sql']), ('roles', ['role.sql']),
                           ('seeds', ['seed.sql']), ('dryRun', False)]:
            bad = json.loads(json.dumps(valid))
            bad['data'][key] = value
            with self.subTest(key=key), self.assertRaises(MODULE.C.ConnectionError):
                MODULE.structured_plan(json.dumps(bad), ['first.sql'], True)

    def test_private_workdir_contains_only_exact_prefix(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'supabase/migrations').mkdir(parents=True)
            (root / 'supabase/config.toml').write_text('[db.seed]\nenabled=false\n')
            run = root / 'run'
            run.mkdir(mode=0o700)
            manifest = []
            for index in range(4):
                name = f'20261117000{index+1}00_synthetic.sql'
                data = f'-- synthetic {index}\n'.encode()
                (root / 'supabase/migrations' / name).write_bytes(data)
                manifest.append({'file': name, 'sha256': hashlib.sha256(data).hexdigest()})
            with patch.object(MODULE, 'ROOT', root):
                folder = MODULE.prefix_workdir(run, manifest, 2)
            files = sorted((folder / 'supabase/migrations').iterdir())
            self.assertEqual([p.name for p in files], [x['file'] for x in manifest[:2]])
            self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in files))
            self.assertFalse((folder / 'supabase/seed.sql').exists())
            self.assertFalse((folder / 'supabase/roles.sql').exists())

    def test_push_failure_stops_before_next_migration_and_observes_once(self):
        manifest = [{'file': version + '_synthetic.sql', 'sha256': 'unused'} for version in MODULE.EXPECTED]
        proof = {'route': {'user': 'postgres', 'host': 'pinned'}}
        with tempfile.TemporaryDirectory() as temporary, contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(MODULE, 'PRIVATE', Path(temporary)))
            stack.enter_context(patch('sys.argv', ['apply']))
            stack.enter_context(patch.object(MODULE, 'validate_local', return_value=({}, proof, {}, manifest)))
            stack.enter_context(patch.object(MODULE.C, 'cli_run', return_value='3.2.0'))
            stack.enter_context(patch.object(MODULE.C, 'private_directory'))
            stack.enter_context(patch.object(MODULE.C, 'save_private'))
            stack.enter_context(patch.object(MODULE.R, 'manifest', return_value=manifest))
            stack.enter_context(patch.object(MODULE.sys.stdin, 'isatty', return_value=True))
            stack.enter_context(patch.object(MODULE.sys.stderr, 'isatty', return_value=True))
            stack.enter_context(patch.object(MODULE.getpass, 'getpass', return_value='synthetic-password'))
            stack.enter_context(patch.object(MODULE, 'guarded_preflight'))
            stack.enter_context(patch.object(MODULE, 'prefix_workdir', return_value=Path(temporary)))
            pushes = stack.enter_context(patch.object(MODULE, 'push', side_effect=[None, None, MODULE.C.ConnectionError('synthetic failure')]))
            observed = stack.enter_context(patch.object(MODULE.C, 'query', return_value={'observed': True}))
            success = stack.enter_context(patch.object(MODULE, 'record_success'))
            commit = stack.enter_context(patch.object(MODULE.subprocess, 'run'))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            with self.assertRaises(MODULE.C.ConnectionError):
                MODULE.main()
            self.assertEqual(pushes.call_count, 3)
            self.assertEqual(observed.call_count, 1)
            success.assert_not_called()
            commit.assert_not_called()

    def test_missing_ledger_version_stops(self):
        manifest = [{'file': MODULE.EXPECTED[0] + '_schema.sql'}]
        with patch.object(MODULE.R, 'history', return_value={}):
            with self.assertRaises(MODULE.C.ConnectionError):
                MODULE.assert_history({}, manifest)


if __name__ == '__main__':
    unittest.main()
