"""New offline importer checks; no database, credentials or previous suites."""
import contextlib
import csv
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    'inventory_import', Path(__file__).resolve().parents[1] / 'scripts/import_supabase_inventory.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def synthetic_rows():
    # Deliberately minimal structural fixture; never evidence of hosted state.
    sections = ['00_context', '01_summary', '02_checks', '10_schemas', '20_relations',
                '21_columns', '32_event_triggers', '40_acl', '42_roles', '50_publications']
    rows = []
    for index, section in enumerate(sections, 1):
        first_field = MODULE.FIELDS[section].split()[0]
        rows.append({'metadata_row_number': index, 'total_metadata_rows': len(sections),
                     'section': section, 'schema_name': None, 'object_name': 'synthetic',
                     'details': {first_field: None}})
    rows[0]['details'] = {'format': 'procont-catalog-preflight-v1', 'base_commit': '11b2c15'}
    return rows


class InventoryImportTests(unittest.TestCase):
    def test_original_formats(self):
        rows = synthetic_rows()
        expected = MODULE.validate_rows(rows)
        self.assertEqual(MODULE.validate_rows(MODULE.parse_export(json.dumps(rows).encode())), expected)
        for delimiter in (',', '\t'):
            with self.subTest(delimiter=delimiter):
                stream = io.StringIO()
                writer = csv.DictWriter(stream, fieldnames=list(rows[0]), delimiter=delimiter)
                writer.writeheader()
                for row in rows:
                    writer.writerow({**row, 'details': json.dumps(row['details'])})
                self.assertEqual(MODULE.validate_rows(MODULE.parse_export(stream.getvalue().encode())), expected)

    def test_truncation_and_duplicate_numbers(self):
        rows = synthetic_rows()
        with self.assertRaises(MODULE.InventoryError):
            MODULE.validate_rows(rows[:-1])
        rows[1]['metadata_row_number'] = rows[0]['metadata_row_number']
        with self.assertRaises(MODULE.InventoryError):
            MODULE.validate_rows(rows)

    def test_reject_record_fields_and_missing_sections(self):
        rows = synthetic_rows()
        rows[5]['details']['email'] = 'synthetic-value'
        with self.assertRaises(MODULE.InventoryError):
            MODULE.validate_rows(rows)
        rows = synthetic_rows()
        rows[-1]['section'] = '03_collisions'
        rows[-1]['details'] = {'oid': 0}
        with self.assertRaises(MODULE.InventoryError):
            MODULE.validate_rows(rows)

    def test_duplicate_json_keys_and_unsupported_text(self):
        with self.assertRaises(MODULE.InventoryError):
            MODULE.parse_export(b'[{"details":{},"details":{}}]')
        with self.assertRaises(MODULE.InventoryError):
            MODULE.parse_export(b'| a | markdown | table |')

    def test_reject_different_capture(self):
        rows = synthetic_rows()
        rows[0]['details']['format'] = 'procont-recovery-v1'
        with self.assertRaises(MODULE.InventoryError):
            MODULE.validate_rows(rows)

    def test_private_receipt_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            private = Path(temporary) / 'private' / 'recovery'
            with patch.object(MODULE, 'PRIVATE', private):
                MODULE.private_directory()
                source = private / 'source-catalog.txt'
                source.write_text(json.dumps(synthetic_rows()))
                source.chmod(0o600)
                original = source.read_bytes()
                with patch('sys.argv', ['importer', '--source', str(source)]), contextlib.redirect_stdout(io.StringIO()):
                    MODULE.main()
                    output = private / 'catalog-evidence-receipt.json'
                    receipt_bytes = output.read_bytes()
                    self.assertEqual(output.stat().st_mode & 0o777, 0o600)
                    self.assertFalse(json.loads(receipt_bytes)['recovery_baseline_compatible'])
                    self.assertNotIn('details', json.loads(receipt_bytes))
                    with self.assertRaises(FileExistsError):
                        MODULE.main()
                    self.assertEqual(output.read_bytes(), receipt_bytes)
                    self.assertEqual(source.read_bytes(), original)
                source.chmod(0o644)
                with patch('sys.argv', ['importer', '--source', str(source)]):
                    with self.assertRaises(MODULE.InventoryError):
                        MODULE.main()


if __name__ == '__main__':
    unittest.main()
