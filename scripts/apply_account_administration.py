#!/usr/bin/env python3
"""Apply only migration 20261118000100 (account administration) to ticketera-procont.

Run from the user's local terminal: the PostgreSQL password is hidden and never
saved. Reuses the native CLI route, private target and snapshot 4 from the first
four migrations. Any failed check stops; no automatic repair, retry or rollback.
Does not create accounts, deploy functions, change SMTP or touch other projects.
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
FILE = '20261118000100_account_administration.sql'
SHA256 = '66f0a0df721c29152bf2a7fe8e4e4a1c269a36f3dacb66e650d0f578a725f16e'
PREVIOUS = ['20261117000100', '20261117000200', '20261117000300', '20261117000400']


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
    C.require([m['file'].split('_')[0] for m in manifest] == PREVIOUS, 'Migraciones 1-4 inesperadas.')
    files = sorted(p.name for p in (ROOT / 'supabase/migrations').glob('*.sql'))
    C.require(files == [m['file'] for m in manifest] + [FILE], 'El directorio de migraciones no es 1-4 + 5.')
    C.require(hashlib.sha256((ROOT / 'supabase/migrations' / FILE).read_bytes()).hexdigest() == SHA256,
              'La migración 5 cambió desde su revisión.')
    snapshot4 = C.read_private_json(PRIVATE / 'recovery/snapshots/4.json')
    C.require(sorted(R.history(snapshot4)) == PREVIOUS, 'La captura 4 no refleja las cuatro versiones aplicadas.')
    C.require(not (PRIVATE / 'recovery/snapshots/5.json').exists(),
              'Ya existe la captura 5: no repetir la aplicación.')
    return proof, snapshot4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-local', action='store_true', help='Solo comprobaciones locales; sin red ni contraseña.')
    args = parser.parse_args()
    proof, snapshot4 = validate_local()
    C.require(C.cli_run(['--version'], C.cli_environment(''), stage='cli_version').strip() == '3.2.0',
              'CLI diferente de 3.2.0.')
    if args.check_local:
        print('Destino, enlace, captura 4 y hashes 1-5 válidos. Sin conexión remota ni SQL.')
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
    run = PRIVATE / 'recovery/applications' / ('m5-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f'))
    C.private_directory(run)

    # 1. Recovery capture + guard: live state must equal snapshot 4 (identity, objects, ledger).
    before = C.query(url, ROOT / 'supabase/recovery/inventory.sql', env)
    C.save_private(run / 'before.json', before)
    C.require(before.get('database_oid') == snapshot4.get('database_oid')
              and before.get('operator') == 'postgres', 'Instancia u operador inesperado; no se aplicó nada.')
    C.require(before == snapshot4, 'El estado remoto cambió desde la captura 4; no se aplicó nada.')

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
    C.save_private(PRIVATE / 'recovery/snapshots/5.json', after)
    ledger = R.history(after)
    C.require(sorted(ledger) == PREVIOUS + ['20261118000100']
              and ledger['20261118000100'].get('name') == 'account_administration'
              and all(ledger[v] == R.history(snapshot4)[v] for v in PREVIOUS),
              'Historial inesperado tras aplicar; conservar 5.json y no continuar.')
    check = C.query(url, ROOT / 'supabase/recovery/account_admin_check.sql', env)
    env.pop('PGPASSWORD', None)
    C.save_private(run / 'check.json', check)
    expected = {'migration_registered': True, 'ledger_versions': 5, 'tables_rls': 2, 'tables_closed': True,
                'rpc_service_role_only': True, 'private_functions_closed': True,
                'admin_update_user_authenticated': True, 'auth_users': 0, 'app_users': 0,
                'bootstrap_rows': 0, 'job_rows': 0}
    C.require(check == expected, 'Verificación posterior no satisfecha; revisar check.json privado.')
    summary = {'status': 'applied_verified', 'at_utc': datetime.now(timezone.utc).isoformat(),
               'project': NAME, 'version': '20261118000100', 'file_sha256': SHA256,
               'previous_versions_unchanged': True, 'recovery_capture_before': True,
               'post_check': expected, 'credentials_saved': False}
    evidence = ROOT / 'docs/validation/account-administration-remote.json'
    evidence.write_text(json.dumps({'migration': summary}, indent=2, ensure_ascii=False) + '\n')
    print('Migración 20261118000100 aplicada y verificada: historial 5/5, RLS, permisos y 0 cuentas.')


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
