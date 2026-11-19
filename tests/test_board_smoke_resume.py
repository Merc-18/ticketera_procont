"""Regression checks for the failed CLI confirmation and safe continuation only."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('smoke_resume', ROOT / 'scripts/activate_board_m12.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class SmokeResume(unittest.TestCase):
    def test_original_nonreadonly_query_supplies_required_cli_confirmation(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(m.C, 'cli_run', return_value='[]') as cli:
            m.query(Path(folder), 'probe', 'SELECT 1', 'postgresql://fixture', {}, readonly=False)
        args = cli.call_args.args[0]
        self.assertIn('--yes', args)
        self.assertNotIn('--read-only', args)

    def test_resume_cannot_enter_apply_or_merge(self):
        for flag in ['--execute', '--finalize-main']:
            with self.subTest(flag=flag), patch('sys.argv', ['activation', '--resume-verification', flag]), \
                    patch.object(m, 'resume_verification') as resume, patch.object(m, 'execute') as execute:
                with self.assertRaises(m.C.ConnectionError):
                    m.main()
                resume.assert_not_called()
                execute.assert_not_called()

    def test_completed_diagnosis_blocks_before_any_remote_query(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            receipt = root / 'docs/validation/board-m12-rpc-smoke-diagnosis.json'
            receipt.parent.mkdir(parents=True)
            receipt.write_text('{}')
            with patch.object(m, 'ROOT', root), patch.object(m, 'query_existing_session_readonly') as query:
                with self.assertRaises(m.C.ConnectionError):
                    m.resume_verification()
                query.assert_not_called()

    def test_explicit_rpc_session_cannot_send_a_readwrite_transaction(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(m.C, 'cli_run') as cli:
            with self.assertRaises(m.C.ConnectionError):
                m.query_existing_session_readonly(Path(folder), 'probe', 'BEGIN; SELECT 1; ROLLBACK;', explicit_transaction=True)
            cli.assert_not_called()
        sql = m.readonly_smoke_sql()
        self.assertTrue(sql.startswith('BEGIN READ ONLY;\n'))
        self.assertTrue(sql.rstrip().endswith('ROLLBACK;'))
        self.assertNotRegex(sql, r'(?i)\b(INSERT|UPDATE|DELETE|TRUNCATE)\b')


if __name__ == '__main__':
    unittest.main()
