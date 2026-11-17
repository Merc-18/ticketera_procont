"""New preparation helper tests only; no previous SQL/consumer suite or network."""
import importlib.util
import io
import json
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('preparation', Path(__file__).parents[1] / 'scripts/prepare_supabase_local.py')
preparation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preparation)
URL = 'https://' + 'a' * 20 + '.supabase.co'
KEY = 'sb_publishable_test_only_nonfunctional_fixture'


def git_result(command, **kwargs):
    return subprocess.CompletedProcess(command, 0 if 'check-ignore' in command else 1)


class PreparationTests(unittest.TestCase):
    def test_exact_target_and_canonical_url_required(self):
        self.assertEqual(preparation.validate_values(URL, KEY, 'ticketera-procont'), 'a' * 20)
        for url, name in [(URL, 'otro-proyecto'), (URL + '/path', 'ticketera-procont'),
                          (URL.replace('https:', 'http:'), 'ticketera-procont'),
                          ('https://user:password@' + 'a' * 20 + '.supabase.co', 'ticketera-procont')]:
            with self.assertRaises(preparation.PreparationError) as error:
                preparation.validate_values(url, KEY, name)
            self.assertNotIn(url, str(error.exception))
            self.assertNotIn(KEY, str(error.exception))

    def test_only_publishable_keys_accepted(self):
        for value in ['sb_' + 'secret_test_only_nonfunctional_fixture', 'eyJ.test.test', 'NOT_A_VALID_PUBLIC_KEY', KEY + '\nextra']:
            with self.assertRaises(preparation.PreparationError) as error:
                preparation.validate_values(URL, value, 'ticketera-procont')
            self.assertNotIn(value, str(error.exception))

    def test_probe_sends_only_get_schema_without_redirects(self):
        seen = []

        def opener(request, timeout):
            seen.append(request)
            response = io.BytesIO(b'{"swagger":"2.0","paths":{}}')
            response.status = 200
            return response

        result = preparation.probe_data_api(URL, KEY, opener)
        self.assertTrue(result['accepted'])
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0].get_method(), 'GET')
        self.assertEqual(seen[0].full_url, URL + '/rest/v1/')
        self.assertIsNone(seen[0].data)
        self.assertIsNone(preparation.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.invalid'))

    def test_http_errors_never_return_response_details_or_credentials(self):
        def opener(request, timeout):
            raise urllib.error.HTTPError(request.full_url, 401, KEY, {}, None)
        result = preparation.probe_data_api(URL, KEY, opener)
        self.assertFalse(result['accepted'])
        self.assertEqual(result['http_status'], 401)
        self.assertNotIn(KEY, json.dumps(result))
        self.assertNotIn(URL, json.dumps(result))

    def test_private_files_permissions_and_honest_status(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(preparation.subprocess, 'run', git_result):
            root = Path(directory)
            status = preparation.save_configuration(root, URL, KEY, 'a' * 20,
                {'accepted': True, 'http_status': 200, 'reason': 'openapi_received'}, [])
            self.assertEqual(stat.S_IMODE((root / '.env.local').stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE((root / '.supabase-local').stat().st_mode), 0o700)
            self.assertIn('VITE_SUPABASE_PUBLISHABLE_KEY=', (root / '.env.local').read_text())
            self.assertFalse(status['project_name_verified_by_management_api'])
            self.assertFalse(status['exposed_schemas_verified'])
            self.assertFalse(status['rls_verified_remotely'])
            self.assertFalse(status['remote_mutations_authorized'])
            self.assertNotIn(KEY, json.dumps(status))
            self.assertNotIn(URL, json.dumps(status))

    def test_existing_file_and_symlink_are_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = root / 'original'
            original.write_text('existing configuration')
            target = root / '.env.local'
            target.symlink_to(original)
            with self.assertRaises(preparation.PreparationError):
                preparation.write_private(target, 'replacement')
            with self.assertRaises(preparation.PreparationError):
                preparation.save_configuration(root, URL, KEY, 'a' * 20, {}, [])
            self.assertEqual(original.read_text(), 'existing configuration')
            self.assertFalse((root / '.supabase-local').exists())

    def test_no_values_saved_if_git_does_not_ignore_them(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(preparation.subprocess, 'run',
                lambda command, **kwargs: subprocess.CompletedProcess(command, 1)):
            root = Path(directory)
            with self.assertRaises(preparation.PreparationError):
                preparation.save_configuration(root, URL, KEY, 'a' * 20, {}, [])
            self.assertEqual(list(root.iterdir()), [])

    def test_migration_manifest_matches_the_four_existing_files(self):
        self.assertEqual([item['file'] for item in preparation.migration_manifest()], list(preparation.MIGRATION_FILES))


if __name__ == '__main__':
    unittest.main(verbosity=2)
