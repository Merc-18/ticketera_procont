#!/usr/bin/env python3
"""Commit the reviewed preparation files from a normal Ubuntu terminal.

No network, SQL, tests, credential reads or remote Git commands. Stops on any
unrelated changes. --check never writes Git metadata.
"""
import argparse
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'README.md', 'docs/fase-2b2-preparacion.md',
    'docs/fase-2b3-catalog-preflight.md', 'docs/fase-2b3b-recovery-plan.md',
    'docs/fase-2b3d-resolucion-bloqueos.md', 'docs/conexion-cli-baseline.md',
    'docs/validation/continuacion-af3259f-baseline.json',
    'scripts/connect_supabase_cli.py', 'scripts/import_supabase_inventory.py',
    'scripts/close_supabase_preparation.py', 'supabase/recovery/connection_check.sql',
    'scripts/apply_supabase_migrations.py', 'tests/test_migration_application.py',
    'supabase/recovery/cli-root-ca.pem',
    'tests/test_cli_connection.py', 'tests/test_inventory_import.py',
}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--message', default='feat: preparar conexión CLI y baseline de Supabase')
    args = parser.parse_args()
    entries = [entry for entry in git('status', '--porcelain=v1', '--untracked-files=all', '-z').split(b'\0') if entry]
    changed = set()
    for entry in entries:
        if b'R' in entry[:2] or b'C' in entry[:2]:
            raise SystemExit('Hay renombres/copias: revisar antes del cierre.')
        name = entry[3:].decode()
        if name not in FILES:
            raise SystemExit('Hay cambios fuera de la entrega preparada; no se modificó el índice.')
        changed.add(name)
    if not changed:
        print('Git ya está limpio; no se creó otro commit.')
        return
    subprocess.run(['git', 'diff', '--check'], cwd=ROOT, check=True)
    if args.check:
        print(f'Cierre local preparado: {len(changed)} archivos permitidos; sin escritura en .git.')
        return
    subprocess.run(['git', 'add', '--', *sorted(changed)], cwd=ROOT, check=True)
    staged = {path.decode() for path in git('diff', '--cached', '--name-only', '-z').split(b'\0') if path}
    if staged != changed:
        raise SystemExit('El índice cambió inesperadamente; detenerse sin crear commit.')
    subprocess.run(['git', 'commit', '-m', args.message], cwd=ROOT, check=True)
    if git('status', '--porcelain=v1').strip():
        raise SystemExit('Commit creado, pero aparecieron otros cambios; revisar Git.')
    print('Commit local creado y Git limpio. No se hizo push.')


if __name__ == '__main__':
    main()
