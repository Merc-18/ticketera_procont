#!/usr/bin/env python3
"""Apply only migration 20261118000200 (areas catalog) to ticketera-procont.

Run from the user's local terminal: the PostgreSQL password is hidden and never
saved. Reuses the native CLI route, private target and snapshot 5 taken after
migration 20261118000100. Any failed check stops; no automatic repair, retry or rollback.
Does not create areas or accounts, deploy functions or touch other projects.
"""
import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from urllib.parse import urlencode
import warnings

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.supabase-local'
REF, NAME = 'xsxdpaiivklqeudgqoqf', 'ticketera-procont'
FILE = '20261118000200_areas.sql'
SHA256 = 'e5c8d8f6f68ead3fb9088ccde36b1d3460dd54ff8de71d011e3586366923d16a'
PREVIOUS = ['20261117000100', '20261117000200', '20261117000300', '20261117000400', '20261118000100']
PREVIOUS_FILE = '20261118000100_account_administration.sql'


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


A = module('apply4', 'scripts/apply_supabase_migrations.py')
C, R = A.C, A.R


def validate_local():
    target = C.read_private_json(PRIVATE / 'target.json')
    proof = C.read_private_json(PRIVATE / 'cli-connection.json')
    C.require(target.get('project_ref') == proof.get('project_ref') == REF
              and target.get('expected_name') == proof.get('expected_name') == NAME,
              'El destino no coincide con ticketera-procont.')
    C.require(C.saved_link_route(target) == proof.get('route'), 'El enlace CLI cambió; detenerse.')
    manifest = R.manifest()  # also re-checks hashes of migrations 1-4
    C.require([m['file'].split('_')[0] for m in manifest] == PREVIOUS[:4], 'Migraciones 1-4 inesperadas.')
    files = sorted(p.name for p in (ROOT / 'supabase/migrations').glob('*.sql'))
    C.require(files == [m['file'] for m in manifest] + [PREVIOUS_FILE, FILE], 'El directorio de migraciones no es 1-5 + 6.')
    C.require(hashlib.sha256((ROOT / 'supabase/migrations' / PREVIOUS_FILE).read_bytes()).hexdigest()
              == '66f0a0df721c29152bf2a7fe8e4e4a1c269a36f3dacb66e650d0f578a725f16e', 'La migración 5 cambió.')
    C.require(hashlib.sha256((ROOT / 'supabase/migrations' / FILE).read_bytes()).hexdigest() == SHA256,
              'La migración 6 cambió desde su revisión.')
    snapshot5 = C.read_private_json(PRIVATE / 'recovery/snapshots/5.json')
    C.require(sorted(R.history(snapshot5)) == PREVIOUS, 'La captura 5 no refleja las cinco versiones aplicadas.')
    C.require(not (PRIVATE / 'recovery/snapshots/6.json').exists(),
              'Ya existe la captura 6: no repetir la aplicación.')
    return proof, snapshot5


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-local', action='store_true', help='Solo comprobaciones locales; sin red ni contraseña.')
    args = parser.parse_args()
    proof, snapshot5 = validate_local()
    C.require(C.cli_run(['--version'], C.cli_environment(''), stage='cli_version').strip() == '3.2.0',
              'CLI diferente de 3.2.0.')
    if args.check_local:
        print('Destino, enlace, captura 5 y hashes 1-6 válidos. Sin conexión remota ni SQL.')
        return
    C.require(sys.stdin.isatty() and sys.stderr.isatty(), 'Ejecutar en la terminal interactiva local.')
    print(f'Destino verificado: {NAME} ({REF}). Se aplicará solo {FILE}.')
    print('La contraseña no se guardará. Cualquier fallo detiene el flujo, sin reparación automática.')
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        password = getpass.getpass('Contraseña PostgreSQL de ticketera-procont (entrada oculta): ')
    C.require(bool(password) and not any(c in password for c in '\r\n\x00'), 'Contraseña vacía o inválida.')
    env = C.cli_environment(password)
    del password
    route = proof['route']
    url = f"postgresql://{route['user']}@{route['host']}:5432/postgres?" + urlencode(
        {'sslmode': 'verify-full', 'connect_timeout': '15'})
    run = PRIVATE / 'recovery/applications' / ('m6-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f'))
    C.private_directory(run)

    # 1. Recovery capture + guard. Accounts/bootstrap changed row counts since snapshot 5
    #    (superadmin), so compare everything except row counts, then require exact history.
    before = C.query(url, ROOT / 'supabase/recovery/inventory.sql', env)
    C.save_private(run / 'before.json', before)
    C.require(before.get('database_oid') == snapshot5.get('database_oid')
              and before.get('operator') == 'postgres', 'Instancia u operador inesperado; no se aplicó nada.')
    strip = lambda snap: {k: v for k, v in snap.items() if k != 'row_counts'}
    C.require(strip(before) == strip(snapshot5) and R.history(before) == R.history(snapshot5),
              'La estructura remota cambió desde la captura 5; no se aplicó nada.')

    # 2. Exact plan: only migration 5 pending, no seeds/roles.
    A.push(ROOT, url, env, [FILE], dry_run=True, stage='plan_5')
    C.save_private(run / 'push-started.json', {'file': FILE, 'at_utc': datetime.now(timezone.utc).isoformat()})
    try:
        A.push(ROOT, url, env, [FILE], dry_run=False, stage='apply_5')
    except (C.ConnectionError, ValueError, OSError, KeyboardInterrupt):
        try:
            C.save_private(run / 'failed-observed.json', C.query(url, ROOT / 'supabase/recovery/inventory.sql', env))
        except (C.ConnectionError, ValueError, OSError):
            pass
        raise C.ConnectionError('Aplicación detenida en la migración 5. Puede haber COMMIT parcial del '
                                'historial; revisar evidencia privada antes de actuar. No reintentar.') from None

    # 3. Post-verification (read-only).
    after = C.query(url, ROOT / 'supabase/recovery/inventory.sql', env)
    C.save_private(PRIVATE / 'recovery/snapshots/6.json', after)
    ledger = R.history(after)
    C.require(sorted(ledger) == PREVIOUS + ['20261118000200']
              and ledger['20261118000200'].get('name') == 'areas'
              and all(ledger[v] == R.history(snapshot5)[v] for v in PREVIOUS),
              'Historial inesperado tras aplicar; conservar 6.json y no continuar.')
    users_before = before['row_counts'].get('public.users')
    check = C.query(url, ROOT / 'supabase/recovery/areas_check.sql', env)
    env.pop('PGPASSWORD', None)
    C.save_private(run / 'check.json', check)
    expected = {'migration_registered': True, 'ledger_versions': 6, 'rls_enabled': True, 'policies': 5,
                'anon_write': False, 'delete_granted': False, 'areas': 0}
    C.require(after['row_counts'].get('public.users') == users_before, 'Perfiles alterados; revisar.')
    C.require(check == expected, 'Verificación posterior no satisfecha; revisar check.json privado.')
    summary = {'status': 'applied_verified', 'at_utc': datetime.now(timezone.utc).isoformat(),
               'project': NAME, 'version': '20261118000200', 'file_sha256': SHA256,
               'previous_versions_unchanged': True, 'recovery_capture_before': True,
               'post_check': expected, 'credentials_saved': False}
    evidence = ROOT / 'docs/validation/areas-remote.json'
    evidence.write_text(json.dumps({'migration': summary}, indent=2, ensure_ascii=False) + '\n')
    print('Migración 20261118000200 aplicada y verificada: historial 6/6, RLS, 5 políticas y catálogo vacío.')


if __name__ == '__main__':
    sys.dont_write_bytecode = True
    try:
        main()
    except C.ConnectionError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError, TypeError, OSError, getpass.GetPassWarning, EOFError, KeyboardInterrupt):
        print('Ejecución detenida; conservar evidencia privada. No reintentar ni compensar automáticamente.',
              file=sys.stderr)
        sys.exit(1)
