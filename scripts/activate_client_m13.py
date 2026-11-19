#!/usr/bin/env python3
"""Only authorized M13. Existing CLI login, exact dry-run, checkpoints and read-only verification.

No password prompt, seeds, custom roles, Vault, Auth accounts, tickets, deployment,
Git push or merge. An interrupted send can only be inspected with --verify-run.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/home/procont/projects/ticketera-procont')
PRIVATE = SOURCE / '.supabase-local'
REF, NAME = 'xsxdpaiivklqeudgqoqf', 'ticketera-procont'
FILE = '20261119000100_client_access.sql'
EVIDENCE = ROOT / 'docs/validation/client-m13-activation.json'


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


A = module('m13_apply', 'scripts/apply_supabase_migrations.py')
B = module('m13_existing_snapshot', 'scripts/activate_board_m12.py')
C = A.C
C.ROOT, C.PRIVATE = ROOT, PRIVATE


def checkpoint(value):
    EVIDENCE.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def read_api(run, name, sql, env):
    # The server enforces READ ONLY. The CLI's --read-only role cannot execute
    # restricted RPCs, so use existing postgres API access with this fixed wrapper.
    wrapped = 'BEGIN READ ONLY;\n' + sql + '\nROLLBACK;\n'
    path = run / (name + '.sql')
    A.private_text(path, wrapped)
    output = C.cli_run(['db', 'query', f'--remote={REF}', '--file', str(path),
                        '--yes', '--output', 'json', '--agent', 'no'], env, stage='m13_' + name)
    rows = json.loads(output)
    C.require(isinstance(rows, list) and len(rows) == 1 and len(rows[0]) == 1, 'Salida de lectura inesperada.')
    value = next(iter(rows[0].values()))
    value = json.loads(value) if isinstance(value, str) else value
    C.require(isinstance(value, dict), 'Falta el resultado de lectura.')
    C.save_private(run / (name + '.json'), value)
    return value


def local():
    C.ROOT = SOURCE
    target = C.read_private_json(PRIVATE / 'target.json')
    C.require(target.get('project_ref') == REF and target.get('expected_name') == NAME, 'Destino diferente del autorizado.')
    C.saved_link_route(target)
    C.ROOT = ROOT
    files = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    C.require(len(files) == 13 and files[-1].name == FILE, 'Conjunto diferente de M1–M13.')
    for path in files[:-1]:
        expected = subprocess.check_output(['git', '-C', str(ROOT), 'show', '35b9726:supabase/migrations/' + path.name])
        C.require(expected == path.read_bytes(), 'Cambió una de las doce migraciones anteriores.')
    sha = hashlib.sha256(files[-1].read_bytes()).hexdigest()
    tested = json.loads((ROOT / 'docs/validation/client-access-local.json').read_text())
    C.require(tested.get('migration_sha256') == sha and tested.get('passed') == 20, 'M13 no coincide con el SQL probado.')
    for commit in ['77fe593', 'aeeaa12', '19a10a8']:
        C.require(subprocess.run(['git', '-C', str(ROOT), 'merge-base', '--is-ancestor', commit, 'HEAD']).returncode == 0,
                  'Falta un commit de la integración de ambos agentes.')
    C.require(C.cli_run(['--version'], C.cli_environment(''), stage='m13_version').strip() == '3.2.0', 'CLI diferente de 3.2.0.')
    return files, sha


def permissions_sql():
    return """SELECT jsonb_build_object(
      'rpc',(SELECT jsonb_object_agg(p.proname,jsonb_build_object(
        'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
        'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
        'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'),
        'public',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0),
        'security_definer',p.prosecdef,'locked_path',p.proconfig @> ARRAY['search_path=""']))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
        AND (p.proname LIKE 'client_%' OR p.proname='set_client_company_studio')),
      'private_helpers_closed',(SELECT count(*)=5 AND bool_and(
        NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
        AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='app_private' AND p.proname LIKE 'client_%'),
      'tables_private',(SELECT count(*)=6 AND bool_and(c.relrowsecurity
        AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
        AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
        AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app_private'
        AND c.relkind='r' AND c.relname LIKE 'client_%'),
      'new_identity_rows',(SELECT count(*) FROM app_private.client_identities),
      'new_company_rows',(SELECT count(*) FROM app_private.client_companies),
      'new_session_rows',(SELECT count(*) FROM app_private.client_sessions),
      'new_code_rows',(SELECT count(*) FROM app_private.client_entry_codes),
      'new_ticket_links',(SELECT count(*) FROM app_private.client_request_links),
      'global_product_bindings',(SELECT count(*) FROM app_private.client_product_bindings),
      'read_only',current_setting('transaction_read_only')) AS checks;"""


def check_permissions(value):
    shared = {'client_session_info', 'client_logout', 'client_products', 'client_submit_request',
              'client_list_tickets', 'client_ticket_detail', 'client_reserve_attachments'}
    service = {'client_open_session', 'client_issue_entry_code', 'client_exchange_entry_code'}
    C.require(set(value['rpc']) == shared | service | {'set_client_company_studio'}, 'Conjunto RPC inesperado.')
    for name, actual in value['rpc'].items():
        expected = {'anon': name in shared, 'authenticated': name in shared or name == 'set_client_company_studio',
                    'service_role': name in shared or name in service, 'public': False, 'security_definer': True, 'locked_path': True}
        C.require(actual == expected, 'Permisos de una RPC no coinciden con M13.')
    C.require(value['private_helpers_closed'] is True and value['tables_private'] is True
              and value['global_product_bindings'] == 2 and value['read_only'] == 'on'
              and all(value[key] == 0 for key in ['new_identity_rows', 'new_company_rows', 'new_session_rows', 'new_code_rows', 'new_ticket_links']),
              'Tablas privadas, asociaciones o datos nuevos no satisfacen el alcance autorizado.')


def verify(run, files, env, summary):
    before = C.read_private_json(run / 'before.json')
    after = read_api(run, 'after', B.snapshot_sql(), env)
    B.validate_history(after['history'], files)
    C.require(after['database_oid'] == before['database_oid'] and after['history'][:-1] == before['history'], 'Instancia o historial inesperado.')
    C.require(after['business_digests'] == before['business_digests'], 'Cambió algún dato de negocio; detener integración.')
    C.require(all(after['functions'].get(name) == definition for name, definition in before['functions'].items()),
              'Cambió una función previa; detener integración.')
    summary.update(applied=True, history_count=13, previous_twelve_unchanged=True, business_data_unchanged=True,
                   existing_functions_unchanged=True, status='history_verified')
    checkpoint(summary)
    permissions = read_api(run, 'permissions', permissions_sql(), env)
    check_permissions(permissions)
    # No identities, accounts or tickets are created on the hosted project. Mutator
    # happy paths are covered by the isolated PostgreSQL fixture, never in production.
    smoke = """DO $probe$ BEGIN
      SET LOCAL ROLE anon;
    """
    for expression in ["public.client_session_info(repeat('0',64))", "public.client_products(repeat('0',64))",
                       "public.client_list_tickets(repeat('0',64))",
                       "public.client_ticket_detail(repeat('0',64),'00000000-0000-0000-0000-000000000000')"]:
        smoke += "BEGIN PERFORM " + expression + "; RAISE EXCEPTION 'Unexpected invalid session success'; EXCEPTION WHEN SQLSTATE 'PT401' THEN NULL; END;\n"
    smoke += "RESET ROLE; END $probe$; SELECT jsonb_build_object('invalid_session_denials',4,'read_only',current_setting('transaction_read_only')) AS checks;"
    rpc_check = read_api(run, 'rpc_readonly', smoke, env)
    C.require(rpc_check == {'invalid_session_denials': 4, 'read_only': 'on'}, 'Comprobación RPC de lectura no confirmada.')
    summary.update(status='applied_verified', permissions_verified=True, rpc_count=11, private_tables=6,
                   readonly_rpc_smoke=rpc_check, remote_test_accounts_created=0, remote_test_tickets_created=0,
                   real_tickets_modified=False, login_enabled=False, client_login_deployed=False)
    checkpoint(summary)
    print('M13 aplicada y verificada: 13/13; 11 RPC y permisos correctos; datos intactos. Ingreso real deshabilitado.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--verify-run', type=Path, help='Verificar un envío previo sin volver a aplicar.')
    args = parser.parse_args()
    C.require(not (args.apply and args.verify_run), 'Elegir aplicación o verificación, nunca ambas.')
    files, sha = local()
    if not args.apply and not args.verify_run:
        print('M13 y doce migraciones anteriores verificadas localmente. Sin SQL remoto.')
        return
    env = C.cli_environment('')
    token_path = Path.home() / '.supabase/access-token'
    C.require(token_path.is_file() and not token_path.is_symlink(), 'Falta la sesión CLI existente; no se pedirán contraseñas.')
    env['SUPABASE_ACCESS_TOKEN'] = token_path.read_text().strip()
    try:
        if args.verify_run:
            run = args.verify_run.resolve()
            C.require(run.parent == PRIVATE / 'recovery/applications' and run.name.startswith('m13-client-activation-'), 'Captura de verificación fuera del alcance.')
            summary = C.read_private_json(run / 'send.json')
            C.require(summary.get('sha256') == sha and summary.get('ref') == REF, 'Envío previo incompatible con el SQL actual.')
            verify(run, files, env, summary)
            return
        applications = PRIVATE / 'recovery/applications'
        C.require(not list(applications.glob('m13-client-activation-*/send.json')), 'Ya existe un envío M13; usar --verify-run, sin reaplicar.')
        run = applications / ('m13-client-activation-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f'))
        C.private_directory(run)
        summary = {'at_utc': datetime.now(timezone.utc).isoformat(), 'project': NAME, 'ref': REF, 'file': FILE,
                   'sha256': sha, 'run': run.name, 'status': 'preflight', 'applied': False,
                   'credentials_saved': False, 'password_requested': False, 'seeds': [], 'roles': [], 'vault_modified': False,
                   'pushed': False, 'deployed': False, 'main_merged': False}
        before = read_api(run, 'before', B.snapshot_sql(), env)
        B.validate_history(before['history'], files[:-1])
        previous = C.read_private_json(PRIVATE / 'recovery/applications/m12-20261119T135908086559/after.json')
        C.require(before['database_oid'] == previous['database_oid'] and before['history'] == previous['history'], 'Instancia o historial cambió desde M12.')
        C.require(not any(name.startswith(('public.client_', 'app_private.client_')) for name in before['functions']), 'Ya existen funciones M13; no aplicar.')
        A.push(ROOT, REF, env, [FILE], dry_run=True, stage='m13_exact_dry_run')
        summary.update(status='exact_plan_verified', pending=[FILE], previous_migrations=12)
        C.save_private(run / 'dry-run.json', summary)
        checkpoint(summary)
        print('Destino confirmado: ticketera-procont; solo M13 pendiente, sin seeds, roles ni Vault.', flush=True)
        C.save_private(run / 'send.json', summary)
        summary['status'] = 'application_sent_unverified'
        checkpoint(summary)
        A.push(ROOT, REF, env, [FILE], dry_run=False, stage='m13_apply_once')
        summary.update(applied=True, status='application_acknowledged')
        checkpoint(summary)
        verify(run, files, env, summary)
    finally:
        env.pop('SUPABASE_ACCESS_TOKEN', None)


if __name__ == '__main__':
    try:
        main()
    except C.ConnectionError as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
    except (ValueError, KeyError, TypeError, OSError, KeyboardInterrupt):
        print('Proceso detenido. Conservar evidencia; no reenviar la migración ni forzar la integración.', file=sys.stderr)
        sys.exit(2)
