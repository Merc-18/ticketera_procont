"""Only startup and secret isolation; no provider, database or browser requests."""
import argparse
import base64
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

spec=importlib.util.spec_from_file_location('local_launcher',Path(__file__).resolve().parents[1]/'scripts/run_client_login_local.py')
launcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(launcher)

def jwt(role,ref=launcher.PROJECT):
    payload=base64.urlsafe_b64encode(json.dumps({'role':role,'ref':ref}).encode()).decode().rstrip('=')
    return 'synthetic.'+payload+'.synthetic'


class LocalLauncher(unittest.TestCase):
    def test_frontend_never_inherits_server_or_unrelated_vite_secrets(self):
        private='synthetic-private-value'
        with patch.dict(os.environ,{'SUPABASE_SERVICE_ROLE_KEY':private,
            'SUPABASE_ACCESS_TOKEN':private,'VITE_SERVER_KEY':private,'QUIPU_PASSWORD':private}), \
            patch.object(launcher,'public_config',return_value={'VITE_SUPABASE_URL':launcher.SUPABASE_URL,
                'VITE_SUPABASE_PUBLISHABLE_KEY':'sb_publishable_synthetic'}):
            env=launcher.frontend_environment()
        self.assertNotIn(private,env.values())
        self.assertEqual(env['VITE_CLIENT_PORTAL_MOCK'],'0')
        self.assertEqual(env['VITE_CLIENT_LOGIN_DEV_ORIGIN'],'http://localhost:8000')

    def test_anon_and_other_project_keys_cannot_substitute_for_server_key(self):
        for value in [jwt('anon'),jwt('service_role','another-project'),'sb_publishable_synthetic','']:
            with self.assertRaises(ValueError):launcher.validate_server_key(value)
        launcher.validate_server_key(jwt('service_role'))
        launcher.validate_server_key('sb_secret_syntheticprivatekey123')

    def test_hidden_key_reaches_only_server_environment_not_argv_or_output(self):
        key=jwt('service_role');captured=[]
        child=Mock();child.poll.return_value=0;child.returncode=0
        def start(command,**options):
            captured.append((list(command),dict(options['env'])))
            return child
        output=io.StringIO()
        with patch.object(launcher,'public_config',return_value={}), \
            patch.object(launcher,'require_port'),patch.object(launcher,'deno_command',return_value=['deno','run','existing-index.ts']), \
            patch.object(launcher.sys.stdin,'isatty',return_value=True), \
            patch.object(launcher.getpass,'getpass',return_value=key), \
            patch.object(launcher.subprocess,'Popen',side_effect=start),contextlib.redirect_stdout(output):
            launcher.run(argparse.Namespace(frontend_only=False,server_only=True))
        self.assertEqual(len(captured),1)
        command,env=captured[0]
        self.assertNotIn(key,command);self.assertNotIn(key,output.getvalue())
        self.assertEqual(env['SUPABASE_SERVICE_ROLE_KEY'],key)
        self.assertEqual(env['SUPABASE_URL'],launcher.SUPABASE_URL)
        self.assertNotIn('--env-file', ' '.join(command))

    def test_noninteractive_input_never_starts_a_server_or_requests_a_visible_key(self):
        with patch.object(launcher,'public_config',return_value={}),patch.object(launcher,'require_port'), \
            patch.object(launcher,'deno_command',return_value=['deno']), \
            patch.object(launcher.sys.stdin,'isatty',return_value=False), \
            patch.object(launcher.getpass,'getpass') as read,patch.object(launcher.subprocess,'Popen') as start:
            with self.assertRaises(ValueError):launcher.run(argparse.Namespace(frontend_only=False,server_only=True))
            read.assert_not_called();start.assert_not_called()


if __name__=='__main__':unittest.main()
