"""New checks for the M12-only dry-run command; no real CLI invocation or network."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('board_dry_run', ROOT/'scripts/check_board_m12_dry_run.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class DryRunOnly(unittest.TestCase):
    def call(self, plan):
        class Fake:
            calls=[]
            @classmethod
            def cli_run(cls, args, env, **kwargs):
                cls.calls.append(args)
                self.assertNotIn('masked-secret', ' '.join(args))
                self.assertIn('--dry-run', args)
                self.assertIn('--skip-vault', args)
                self.assertFalse(any(x in args for x in ['--yes','--include-seed','--include-roles']))
                return json.dumps(plan)
        result = m.run_plan(Fake, ROOT, 'postgresql://fixture', {'PGPASSWORD':'masked-secret'})
        self.assertEqual(len(Fake.calls),1)
        return result
    def plan(self, **kw):
        return {'migrations':[m.M12], 'seeds':[], 'roles':[], 'dryRun':True} | kw
    def test_only_m12_verified(self): self.assertEqual(self.call(self.plan())['migrations'],[m.M12])
    def test_other_migration_rejected(self):
        with self.assertRaises(ValueError): self.call(self.plan(migrations=['unexpected.sql']))
    def test_apply_plan_rejected(self):
        with self.assertRaises(ValueError): self.call(self.plan(dryRun=False))
    def test_role_or_seed_rejected(self):
        for change in [{'roles':['role']},{'seeds':['seed.sql']}]:
            with self.subTest(change=change), self.assertRaises(ValueError): self.call(self.plan(**change))

if __name__=='__main__': unittest.main()
