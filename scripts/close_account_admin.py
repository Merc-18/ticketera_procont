#!/usr/bin/env python3
"""Local-only closeout from normal Ubuntu when the agent's .git is read-only."""
import importlib.util
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('closeout',ROOT/'scripts/close_supabase_preparation.py')
closeout=importlib.util.module_from_spec(spec);spec.loader.exec_module(closeout)
closeout.FILES={
    'README.md','supabase/README.md','docs/account-administration.md',
    'docs/validation/account-administration-local.json',
    'scripts/bootstrap_auth_identity.mjs','scripts/bootstrap_superadmin.py',
    'scripts/close_account_admin.py','src/hooks/useUsers.ts','src/lib/account-admin.ts',
    'scripts/close_supabase_preparation.py',
    'supabase/config.toml','supabase/migrations/20261118000100_account_administration.sql',
    'supabase/functions/_shared/account-admin.mjs','supabase/functions/admin-users/index.ts',
    'supabase/tests/account_admin_local.py','tests/account-admin.test.mjs',
}
sys.argv=[sys.argv[0],'--message','feat: preparar administración segura de cuentas',*sys.argv[1:]]
closeout.main()
