#!/usr/bin/env python3
"""M12 dry-run only. Password is entered in the local terminal; never stored or passed in argv."""
import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import importlib.util
import json
import subprocess
import sys
import warnings
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
REF = 'xsxdpaiivklqeudgqoqf'
NAME = 'ticketera-procont'
M12 = '20261118000800_board_operations.sql'
EVIDENCE = Path('docs/validation/board-recovery-dry-run.json')

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result

C = module('board_cli_connection', ROOT/'scripts/connect_supabase_cli.py')
A = module('board_cli_plan', ROOT/'scripts/apply_supabase_migrations.py')

def run_plan(connection, workdir, url, env):
    # There is deliberately no execution/apply mode, --yes, seed, role or vault write.
    arguments = ['db', 'push', f'--remote={url}', '--workdir', str(workdir), '--skip-vault',
                 '--output-format', 'json', '--agent', 'no', '--dry-run']
    output = connection.cli_run(arguments, env, stage='board_m12_dry_run_only')
    A.structured_plan(output, [M12], True)
    return {'migrations': [M12], 'seeds': [], 'roles': [], 'dryRun': True}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--connection-workdir', type=Path, help='Existing linked project checkout; read only')
    parser.add_argument('--commit-evidence', action='store_true', help='Commit only the verified dry-run evidence locally')
    args = parser.parse_args()
    C.require(sys.stdin.isatty() and sys.stderr.isatty(), 'Ejecutar desde una terminal local interactiva; entrada oculta obligatoria.')
    if args.commit_evidence:
        state = subprocess.check_output(['git', '-C', str(ROOT), 'status', '--porcelain'], text=True).strip()
        C.require(state in ('', '?? 1'), 'Hay cambios pendientes: conservarlos antes de registrar la evidencia.')
    linked = args.connection_workdir
    if linked is None:
        linked = next((p for p in [ROOT, *ROOT.parents] if (p/'supabase/.temp/project-ref').is_file()), None)
    C.require(linked is not None, 'Falta el enlace CLI existente; indicar --connection-workdir.')
    linked = linked.resolve()
    C.ROOT = linked
    target = C.read_private_json(linked/'.supabase-local/target.json')
    C.require(target.get('project_ref') == REF and target.get('expected_name') == NAME, 'Destino diferente de ticketera-procont.')
    route = C.saved_link_route(target)
    C.ROOT = ROOT
    C.private_directory(C.PRIVATE)
    C.require(C.cli_run(['--version'], C.cli_environment(''), stage='board_cli_version').strip() == '3.2.0', 'Se requiere CLI 3.2.0.')
    migrations = sorted((ROOT/'supabase/migrations').glob('*.sql'))
    C.require(len(migrations) == 12 and migrations[-1].name == M12, 'El conjunto local no coincide con M1–M12.')
    for path in migrations:
        base = '1ba71b2' if path.name == M12 else '94bd8fd'
        expected = subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{base}:supabase/migrations/{path.name}'])
        C.require(path.read_bytes() == expected, 'Una migración cambió respecto de su commit de referencia.')
    print('Destino ticketera-procont verificado. Solo dry-run; no se aplicará SQL ni se crearán roles.')
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        password = getpass.getpass('Contraseña PostgreSQL (entrada oculta, no se guarda): ')
    C.require(bool(password) and not any(c in password for c in '\r\n\x00'), 'Contraseña vacía o inválida.')
    env = C.cli_environment(password); del password
    url = f"postgresql://{route['user']}@{route['host']}:5432/postgres?" + urlencode({'sslmode': 'verify-full', 'connect_timeout': '15'})
    try: plan = run_plan(C, ROOT, url, env)
    finally: env.pop('PGPASSWORD', None)
    evidence = {'checked_at_utc': datetime.now(timezone.utc).isoformat(), 'project': NAME, 'ref': REF,
        'cli_version': '3.2.0', 'status': 'verified', 'plan': plan, 'applied': False,
        'migration_sha256': hashlib.sha256((ROOT/'supabase/migrations'/M12).read_bytes()).hexdigest(),
        'inventory_repeated': False, 'credentials_saved': False}
    (ROOT/EVIDENCE).write_text(json.dumps(evidence, indent=2)+'\n')
    print('Dry-run confirmado: únicamente M12 pendiente, sin seeds/roles/vault. No aplicada.')
    if args.commit_evidence:
        result = subprocess.run(['git', '-C', str(ROOT), 'commit', '--only', '-m',
            'docs: verificar dry-run M12 en ticketera-procont', '--', str(EVIDENCE)], capture_output=True, text=True)
        C.require(result.returncode == 0, 'Evidencia verificada y guardada; no se pudo crear el commit local.')
        print('Commit local de evidencia: '+subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', '--short', 'HEAD'], text=True).strip())

if __name__ == '__main__':
    try: main()
    except (C.ConnectionError, A.C.ConnectionError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
    except (json.JSONDecodeError, getpass.GetPassWarning):
        print('Dry-run no confirmado. Se requiere entrada oculta y plan CLI válido; sin aplicación ni reintento automático.', file=sys.stderr)
        sys.exit(2)
