"""New activation guards only; no network, real accounts, or repeated backend suites."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('activation', ROOT / 'scripts/activate_board_m12.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ActivationGuards(unittest.TestCase):
    def test_extra_or_missing_remote_version_stops(self):
        file = Path(m.FILE)
        row = {'version': '20261118000800', 'name': 'board_operations', 'statements_checksum': 'a' * 32}
        m.validate_history([row], [file])
        for rows in [[], [row, row], [dict(row, version='20261118009900')]]:
            with self.subTest(rows=rows), self.assertRaises(m.C.ConnectionError):
                m.validate_history(rows, [file])

    def test_history_repair_or_bad_checksum_stops(self):
        for row in [{'version': '20261118000800', 'name': 'unexpected', 'statements_checksum': 'a' * 32},
                    {'version': '20261118000800', 'name': 'board_operations', 'statements_checksum': None}]:
            with self.subTest(row=row), self.assertRaises(m.C.ConnectionError):
                m.validate_history([row], [Path(m.FILE)])

    def test_smoke_uses_missing_ids_and_rollback_without_dml(self):
        sql = m.smoke_sql()
        self.assertTrue(sql.startswith('BEGIN;'))
        self.assertTrue(sql.endswith('ROLLBACK;'))
        for name in ['get_board_ticket', 'operate_board_ticket', 'operate_board_tickets', 'reserve_board_evidence']:
            self.assertIn('public.' + name, sql)
        self.assertEqual(sql.count(m.MISSING), 8)
        self.assertNotRegex(sql, r'(?i)\b(INSERT|UPDATE|DELETE|TRUNCATE)\b')

    def test_recovery_snapshot_excludes_new_column_from_existing_data_digests(self):
        sql = m.snapshot_sql()
        self.assertIn("to_jsonb(t)-'workflow_version'", sql)
        self.assertIn('md5(statements::text)', sql)
        self.assertIn("'missing_id_absent'", sql)
        self.assertNotRegex(sql, r'(?i)\b(INSERT|UPDATE|DELETE|TRUNCATE)\b')


if __name__ == '__main__':
    unittest.main()
