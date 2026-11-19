#!/usr/bin/env python3
"""Activate the authorized M12 only. Run --execute in normal Ubuntu; secret input is hidden.

Stops on any failed check. Never retries a push, repairs history, seeds, creates
roles, writes Vault, pushes GitHub, deploys, or mutates an existing ticket.
"""
import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import warnings

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/home/procont/projects/ticketera-procont')
PRIVATE = SOURCE / '.supabase-local'
REF, NAME = 'xsxdpaiivklqeudgqoqf', 'ticketera-procont'
FILE = '20261118000800_board_operations.sql'
SHA = '66995addf02ce4af8d53b6794fd030f4369ed88a02284d8815afe99e0dafc6be'
EVIDENCE = ROOT / 'docs/validation/board-m12-activation.json'
MISSING = '00000000-0000-0000-0000-000000000000'
SIGNATURES = ['public.get_board_ticket(uuid)', 'public.operate_board_ticket(uuid,text,jsonb,uuid)',
              'public.operate_board_tickets(uuid[],text,jsonb,uuid)',
              'public.reserve_board_evidence(uuid,uuid,text,bigint,text)']


def module(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


A = module('activation_apply', 'scripts/apply_supabase_migrations.py')
C = A.C


def git(*args, cwd=ROOT):
    result = subprocess.run(['git', '-C', str(cwd), *args], capture_output=True, text=True)
    C.require(result.returncode == 0, 'Git local falló; detenerse sin descartar cambios.')
    return result.stdout.strip()


def validate_local():
    C.ROOT = SOURCE
    target = C.read_private_json(PRIVATE / 'target.json')
    C.require(target.get('project_ref') == REF and target.get('expected_name') == NAME,
              'Destino diferente de ticketera-procont.')
    route = C.saved_link_route(target)
    C.ROOT = ROOT
    C.PRIVATE = PRIVATE
    C.ROOT_CA = ROOT / 'supabase/recovery/cli-root-ca.pem'
    files = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    C.require(len(files) == 12 and files[-1].name == FILE, 'Conjunto diferente de M1–M12.')
    for path in files:
        base = '1ba71b2' if path.name == FILE else '94bd8fd'
        expected = subprocess.check_output(['git', '-C', str(ROOT), 'show',
                                             f'{base}:supabase/migrations/{path.name}'])
        C.require(path.read_bytes() == expected, 'Una migración cambió respecto de su referencia.')
    receipt = json.loads((ROOT / 'docs/validation/board-recovery-dry-run.json').read_text())
    C.require(receipt.get('status') == 'verified' and receipt.get('applied') is False
              and receipt.get('ref') == REF and receipt.get('migration_sha256') == SHA
              and receipt.get('plan') == {'migrations': [FILE], 'seeds': [], 'roles': [], 'dryRun': True},
              'No coincide el recibo aprobado del dry-run.')
    for commit in ['17c8c19', '6a4bce5', '83b148e', '1ba71b2']:
        git('merge-base', '--is-ancestor', commit, 'HEAD')
    C.require(git('branch', '--show-current') == 'integration/board-operations-recovery',
              'Ejecutar en la rama de recuperación.')
    C.require(git('status', '--porcelain') == '', 'La copia recuperada debe estar limpia y registrada.')
    C.require(git('status', '--porcelain', cwd=SOURCE) in ('', '?? 1'),
              'Hay cambios en el proyecto original; conservarlos antes de integrar.')
    C.require(git('rev-parse', 'main', cwd=SOURCE) == git('rev-parse', '94bd8fd'),
              'Main cambió; revisar antes de aplicar o integrar.')
    C.require(not EVIDENCE.exists() or json.loads(EVIDENCE.read_text()).get('applied') is False,
              'Ya hay evidencia de aplicación; no reenviar M12.')
    if EVIDENCE.exists():
        preserved = json.loads(EVIDENCE.read_text()).get('file_1_sha256')
        C.require(preserved is not None and (SOURCE / '1').is_file()
                  and hashlib.sha256((SOURCE / '1').read_bytes()).hexdigest() == preserved,
                  'El archivo 1 cambió desde la comprobación; conservarlo y revisar.')
    C.require(C.cli_run(['--version'], C.cli_environment(''), stage='m12_version').strip() == '3.2.0',
              'Se requiere CLI 3.2.0.')
    return files, route


def validate_history(rows, files):
    C.require([r['version'] for r in rows] == [p.name.split('_')[0] for p in files],
              'Historial remoto distinto de las versiones esperadas.')
    for row, path in zip(rows, files):
        C.require(row['name'] == path.name.split('_', 1)[1][:-4]
                  and re.fullmatch(r'[0-9a-f]{32}', row.get('statements_checksum', '') or ''),
                  'Nombre o checksum de historial incompatible.')


def function_bodies(sql):
    result = {}
    for match in re.finditer(r'^CREATE(?: OR REPLACE)? FUNCTION\s+((?:public|app_private)\.\w+)\s*\(', sql, re.I | re.M):
        tag = re.search(r'\$\w*\$', sql[match.end():])
        C.require(tag is not None, 'No se pudo leer una definición de función local.')
        start = match.end() + tag.end()
        end = sql.find(tag.group(), start)
        C.require(end >= 0, 'Cuerpo de función local incompleto.')
        result[match.group(1)] = sql[start:end]
    return result


def validate_target_functions(functions, files):
    previous = {}
    for path in files[:-1]:
        previous.update(function_bodies(path.read_text()))
    affected = function_bodies(files[-1].read_text())
    for name in affected:
        if name not in previous:
            C.require(name not in functions, 'Una función nueva de M12 ya existe; no aplicar.')
        else:
            definition = functions.get(name, {}).get('definition', '')
            tag = re.search(r'\$\w*\$', definition)
            C.require(tag is not None, 'Falta una función previa afectada por M12.')
            body = definition[tag.end():definition.find(tag.group(), tag.end())]
            C.require(body == previous[name], 'Cambió una función afectada respecto del SQL M1–M11; no aplicar.')


def query(run, name, sql, url, env, readonly=True):
    path = run / (name + '.sql')
    A.private_text(path, sql)
    if readonly:
        return C.query(url, path, env)
    # Used exclusively by the smoke test below: one transaction, no DML, ROLLBACK.
    C.cli_run(['db', 'query', f'--remote={url}', '--file', str(path), '--output', 'json',
               '--agent', 'no'], env, stage=name)
    return {'passed': True}


def snapshot_sql():
    # Only digests leave the server. Ignore the new nullable column in row digests.
    tables = ['users', 'requests', 'projects', 'project_flows', 'checklist_items',
              'checklist_templates', 'comments', 'activity_logs', 'request_events',
              'notifications', 'areas', 'catalog_systems', 'catalog_subsystems', 'studios', 'studio_codes']
    digests = []
    for table in tables:
        digests += [f"'{table}'", f"(SELECT md5(coalesce(string_agg((to_jsonb(t)-'workflow_version')::text,'' ORDER BY id),'')) FROM public.{table} t)"]
    return """SELECT jsonb_build_object(
      'database_oid',(SELECT oid FROM pg_database WHERE datname=current_database()),
      'operator',current_user,
      'history',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,
        'statements_checksum',md5(statements::text)) ORDER BY version) FROM supabase_migrations.schema_migrations),
      'business_digests',jsonb_build_object(""" + ','.join(digests) + """),
      'missing_id_absent',NOT EXISTS(SELECT 1 FROM public.projects WHERE id='""" + MISSING + """'),
      'functions',(SELECT coalesce(jsonb_object_agg(n.nspname||'.'||p.proname,
        jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl)), '{}'::jsonb)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','app_private') AND p.prokind='f'),
      'constraints',(SELECT jsonb_object_agg(conname,pg_get_constraintdef(oid)) FROM pg_constraint
        WHERE conrelid IN ('public.projects'::regclass,'public.project_flows'::regclass,
          'public.request_events'::regclass,'public.activity_logs'::regclass)),
      'column_acl',(SELECT jsonb_agg(jsonb_build_object('table',attrelid::regclass::text,
        'column',attname,'acl',attacl)) FROM pg_attribute WHERE attrelid IN
        ('public.projects'::regclass,'public.project_flows'::regclass,'public.checklist_items'::regclass)
        AND attnum>0 AND NOT attisdropped)
    ) AS snapshot;"""


def permissions_sql():
    signatures = ','.join("'" + s + "'" for s in SIGNATURES)
    return """SELECT jsonb_build_object(
      'rpc_permissions',(SELECT bool_and(has_function_privilege('authenticated',s,'EXECUTE')
        AND NOT has_function_privilege('anon',s,'EXECUTE')
        AND NOT has_function_privilege('service_role',s,'EXECUTE')
        AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0)
        AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']) FROM unnest(ARRAY[""" + signatures + """]) s
        JOIN pg_proc p ON p.oid=s::regprocedure),
      'private_helpers_closed',NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='app_private' AND (p.proname LIKE 'board_%' OR p.proname='immutable_board_history')
        AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE')
          OR has_function_privilege('service_role',p.oid,'EXECUTE'))),
      'direct_operational_writes_closed',
        NOT has_column_privilege('authenticated','public.project_flows','current_phase','UPDATE')
        AND NOT has_column_privilege('authenticated','public.project_flows','progress','UPDATE')
        AND NOT has_column_privilege('authenticated','public.project_flows','assigned_to','UPDATE')
        AND NOT has_column_privilege('authenticated','public.projects','status','UPDATE')
        AND NOT has_column_privilege('authenticated','public.projects','priority','UPDATE')
        AND NOT has_column_privilege('authenticated','public.projects','is_blocked','UPDATE'),
      'audit_writes_closed',NOT has_any_column_privilege('authenticated','public.request_events','INSERT')
        AND NOT has_any_column_privilege('authenticated','public.request_events','UPDATE')
        AND NOT has_table_privilege('authenticated','public.request_events','DELETE,TRUNCATE'),
      'historical_projects_preserved',NOT EXISTS(SELECT 1 FROM public.projects WHERE workflow_version IS NOT NULL),
      'context_empty',(SELECT count(*)=0 FROM app_private.board_command_context),
      'context_rls',(SELECT relrowsecurity FROM pg_class WHERE oid='app_private.board_command_context'::regclass)
    ) AS checks;"""


def smoke_sql():
    calls = [
        (f"public.get_board_ticket('{MISSING}')", '42501'),
        (f"public.operate_board_ticket('{MISSING}','set_priority','{{\"priority\":\"medium\"}}',gen_random_uuid())", '22023'),
        (f"public.operate_board_tickets(ARRAY['{MISSING}']::uuid[],'set_priority','{{\"priority\":\"medium\"}}',gen_random_uuid())", '22023'),
        (f"public.reserve_board_evidence('{MISSING}',gen_random_uuid(),'activation-probe.pdf',1,'application/pdf')", '42501')]
    def reject(call, code):
        return f"BEGIN PERFORM {call}; RAISE EXCEPTION 'Unexpected RPC success'; EXCEPTION WHEN SQLSTATE '{code}' THEN NULL; END;"
    # Existing editor only. No accounts, profiles, business rows or upload grants are created.
    sql = """BEGIN;
    DO $probe$ DECLARE actor uuid; pid uuid; snap jsonb; BEGIN
      SELECT id INTO actor FROM public.users WHERE is_active AND role IN ('superadmin','admin','developer') ORDER BY id LIMIT 1;
      IF actor IS NULL THEN RAISE EXCEPTION 'No existing editor for smoke test'; END IF;
      PERFORM set_config('request.jwt.claim.sub',actor::text,true);
      SELECT id INTO pid FROM public.projects WHERE status<>'deleted' ORDER BY id LIMIT 1;
      SET LOCAL ROLE authenticated;
      IF pid IS NOT NULL THEN
        snap:=public.get_board_ticket(pid);
        IF snap->>'project_id' IS DISTINCT FROM pid::text OR NOT (snap ?& ARRAY['flows','pending_fingerprint','pending_items'])
          THEN RAISE EXCEPTION 'Invalid board snapshot'; END IF;
      END IF;
    """
    sql += '\n'.join(reject(call, code) for call, code in calls)
    sql += "\nPERFORM set_config('request.jwt.claim.sub','',true);\n"
    sql += '\n'.join(reject(call, '42501') for call, _ in calls)
    sql += '\nRESET ROLE; END $probe$; ROLLBACK;'
    return sql


def execute(files, route):
    C.require(sys.stdin.isatty() and sys.stderr.isatty(), 'Ejecutar --execute en Ubuntu normal con entrada oculta.')
    runs = PRIVATE / 'recovery/applications'
    run = runs / ('m12-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f'))
    C.private_directory(run)
    # An interrupted/uncertain send must be reviewed, never automatically repeated.
    C.require(not any(runs.glob('m12-*/push-started.json')), 'Ya hubo un envío M12; revisar antes de reanudar.')
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        password = getpass.getpass('Contraseña PostgreSQL ticketera-procont (oculta, no se guarda): ')
    C.require(bool(password) and not any(c in password for c in '\r\n\x00'), 'Contraseña inválida.')
    env = C.cli_environment(password)
    del password
    url = f"postgresql://{route['user']}@{route['host']}:5432/postgres?sslmode=verify-full&connect_timeout=15"
    summary = {'at_utc': datetime.now(timezone.utc).isoformat(), 'project': NAME, 'ref': REF,
               'migration': FILE, 'sha256': SHA, 'applied': False, 'status': 'preflight',
               'credentials_saved': False, 'pushed': False, 'frontend_deployed': False,
               'file_1_sha256': hashlib.sha256((SOURCE / '1').read_bytes()).hexdigest(),
               'recovered_head_before_activation': git('rev-parse', 'HEAD')}
    try:
        before = query(run, 'before', snapshot_sql(), url, env)
        C.save_private(run / 'before.json', before)
        baseline = C.read_private_json(PRIVATE / 'recovery/applications/m11-cli-20261118T215100/before.json')
        C.require(before['database_oid'] == baseline['database_oid'] and before['operator'] == 'postgres'
                  and before['missing_id_absent'], 'Instancia, operador o ID de prueba inesperado.')
        validate_history(before['history'], files[:-1])
        validate_target_functions(before['functions'], files)
        old_history = A.R.history(baseline)
        C.require(all(row == old_history[row['version']] for row in before['history'][:-1]),
                  'Las diez entradas históricas capturadas antes de M11 cambiaron.')
        A.push(ROOT, url, env, [FILE], dry_run=True, stage='m12_exact_plan')
        summary['migration_plan_unchanged_from_dry_run'] = True
        summary['affected_function_bodies_match_M1_M11'] = True
        # The old receipt has no catalog digest: do not claim full schema equivalence.
        summary['prior_dry_run_has_catalog_digest'] = False
        print('Plan remoto confirmado: solo M12; historial 11/11. Captura privada de recuperación guardada.', flush=True)
        C.save_private(run / 'push-started.json', {'file': FILE, 'at_utc': datetime.now(timezone.utc).isoformat()})
        summary['status'] = 'application_sent_unverified'
        A.push(ROOT, url, env, [FILE], dry_run=False, stage='m12_apply_once')
        summary['applied'] = True
        after = query(run, 'after', snapshot_sql(), url, env)
        C.save_private(run / 'after.json', after)
        validate_history(after['history'], files)
        C.require(after['history'][:-1] == before['history'], 'Las once entradas previas cambiaron.')
        checks = query(run, 'permissions', permissions_sql(), url, env)
        C.require(checks and all(v is True for v in checks.values()), 'Permisos o compatibilidad no confirmados.')
        smoke = query(run, 'rpc_smoke', smoke_sql(), url, env, readonly=False)
        final = query(run, 'final', snapshot_sql(), url, env)
        C.require(before['business_digests'] == after['business_digests'] == final['business_digests'],
                  'Cambió algún dato de negocio durante la activación; detener integración.')
        C.require(final['history'] == after['history'], 'Cambió el historial durante la comprobación.')
        summary.update(status='applied_verified', history_count=12, previous_versions_unchanged=True,
                       permissions=checks, rpc_smoke=smoke, rpc_names=[s.split('(')[0] for s in SIGNATURES],
                       smoke_scope='existing editor; read snapshot if available; nonexistent IDs; missing-actor denial; ROLLBACK',
                       business_rows_unchanged=True, REQ26_001_unchanged=True,
                       backend_74_repeated=False, claude_sql_26_repeated=False, main_merged=False)
    finally:
        env.pop('PGPASSWORD', None)
        EVIDENCE.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + '\n')
    print('M12 aplicada y verificada: 12/12; cuatro RPC y permisos comprobados; tickets intactos.', flush=True)


def finish():
    summary = json.loads(EVIDENCE.read_text())
    C.require(summary.get('status') == 'applied_verified', 'No integrar una aplicación no verificada.')
    for command in [['npm', 'run', 'build'], [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_board_activation.py']]:
        C.require(subprocess.run(command, cwd=ROOT).returncode == 0, 'Build o pruebas fallaron; no integrar main.')
    summary.update(build='passed', activation_guard_tests=4)
    EVIDENCE.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + '\n')
    git('add', '--', str(EVIDENCE.relative_to(ROOT)))
    git('commit', '--only', '-m', 'docs: registrar activación M12 verificada 12/12', '--', str(EVIDENCE.relative_to(ROOT)))
    integration = git('rev-parse', 'HEAD')
    C.require(git('status', '--porcelain', cwd=SOURCE) in ('', '?? 1'), 'Árbol original cambió; no integrar.')
    C.require(git('rev-parse', 'main', cwd=SOURCE) == git('rev-parse', '94bd8fd'), 'Main cambió; no integrar.')
    git('fetch', str(ROOT), 'integration/board-operations-recovery:refs/heads/integration/board-operations-recovered', cwd=SOURCE)
    git('switch', 'main', cwd=SOURCE)
    git('merge', '--no-ff', '-m', 'feat: activar M12 e integrar tablero operativo recuperado', integration, cwd=SOURCE)
    for commit in ['17c8c19', '6a4bce5', '83b148e', '1ba71b2', integration]:
        git('merge-base', '--is-ancestor', commit, 'main', cwd=SOURCE)
    C.require(hashlib.sha256((SOURCE / '1').read_bytes()).hexdigest() == summary['file_1_sha256'],
              'Revisar archivo 1; el merge no debe modificarlo.')
    final = git('rev-parse', 'main', cwd=SOURCE)
    C.save_private(PRIVATE / 'recovery/applications' / ('m12-merge-' + final + '.json'),
                   {'main': final, 'integration': integration, 'merged': True, 'pushed': False})
    print('MAIN local: ' + final + '. Commits conservados; sin push ni despliegue.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true', help='Aplicar M12 y verificar; contraseña oculta en Ubuntu.')
    parser.add_argument('--finalize-main', action='store_true', help='Tras verificar, build, pruebas nuevas, evidencia y merge local autorizado.')
    args = parser.parse_args()
    C.require(not args.finalize_main or args.execute, '--finalize-main requiere --execute.')
    files, route = validate_local()
    if not args.execute:
        print('Validación local correcta: commits recuperados, M1–M12 y recibo de ayer intactos. Sin SQL remoto.')
        return
    execute(files, route)
    if args.finalize_main:
        finish()


if __name__ == '__main__':
    sys.dont_write_bytecode = True
    try:
        main()
    except C.ConnectionError as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
    except (ValueError, KeyError, TypeError, OSError, EOFError, KeyboardInterrupt, getpass.GetPassWarning):
        print('Proceso detenido. Conservar evidencia privada; no reenviar M12 ni forzar el merge.', file=sys.stderr)
        sys.exit(2)
