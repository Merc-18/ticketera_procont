#!/usr/bin/env python3
"""Apply only the four approved migrations with native CLI and strict recovery.

Run from the user's local terminal: password is hidden and never saved. A single
failed command or comparison stops the sequence. No automatic repair/rollback.
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
from urllib.parse import urlencode
import warnings

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.supabase-local'
EXPECTED = ['20261117000100', '20261117000200', '20261117000300', '20261117000400']


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


C = module('connection', 'scripts/connect_supabase_cli.py')
R = module('recovery', 'scripts/build_migration_recovery.py')


def validate_local():
    target = C.read_private_json(PRIVATE / 'target.json')
    proof = C.read_private_json(PRIVATE / 'cli-connection.json')
    baseline_path = PRIVATE / 'recovery/snapshots/0.json'
    baseline = C.read_private_json(baseline_path)
    identity = C.read_private_json(PRIVATE / 'recovery/cli-identity.json')
    receipt = C.read_private_json(PRIVATE / 'recovery/catalog-evidence-receipt.json')
    manifest = R.manifest()
    C.require([item['file'].split('_')[0] for item in manifest] == EXPECTED,
              'La secuencia local no coincide con las cuatro versiones autorizadas.')
    C.require(target.get('project_ref') == proof.get('project_ref') == 'xsxdpaiivklqeudgqoqf'
              and target.get('expected_name') == proof.get('expected_name') == 'ticketera-procont',
              'El destino no coincide con ticketera-procont.')
    C.require(proof.get('identity_verified') is True and proof.get('baseline_validated') is True
              and proof.get('password_saved') is False and proof.get('migrations') == manifest,
              'La evidencia nativa no satisface los requisitos de aplicación.')
    C.require(proof.get('baseline_sha256') == hashlib.sha256(baseline_path.read_bytes()).hexdigest()
              and proof.get('source_catalog_sha256') == receipt.get('source_sha256')
              == hashlib.sha256((PRIVATE / 'recovery/source-catalog.txt').read_bytes()).hexdigest(),
              'Hashes de baseline o exportación incompatibles.')
    C.require(C.saved_link_route(target) == proof.get('route'), 'El enlace cambió desde el baseline.')
    C.require(baseline['database_oid'] == identity['database_oid']
              and baseline['operator'] == identity['current_user'] == identity['session_user'] == 'postgres'
              and int(baseline['server_version_num']) == identity['server_version_num'] == 170012,
              'Identidad/versión/permisos incompatibles con el baseline.')
    C.verify_identity(identity, {'database_oid': baseline['database_oid'],
                                 'server_version_num': int(baseline['server_version_num']),
                                 'current_user': baseline['operator'], 'session_user': 'postgres'})
    R.validate_baseline(baseline)
    public = baseline['schemas']['public']
    C.require(all(grant['grantor'] == public['owner'] for grant in public['acl']),
              'La compensación de permisos públicos necesita una revisión específica.')
    C.require(not any((PRIVATE / f'recovery/snapshots/{stage}.json').exists() for stage in range(1, 5)),
              'Existen capturas posteriores: no reanudar ni repetir migraciones automáticamente.')
    return target, proof, baseline, manifest


def structured_plan(output, names, dry_run):
    """Accept only the pinned CLI's structured, exact plan, no seeds or roles."""
    value = json.loads(output)
    found = []

    def walk(item):
        if isinstance(item, dict):
            if {'migrations', 'seeds', 'roles', 'dryRun'} <= item.keys():
                found.append(item)
            else:
                for child in item.values():
                    walk(child)
        elif isinstance(item, list):
            for child in item:
                walk(child)

    walk(value)
    C.require(len(found) == 1, 'La CLI no entregó un plan estructurado inequívoco.')
    plan = found[0]
    C.require(plan['migrations'] == names and plan['seeds'] == [] and plan['roles'] == []
              and plan['dryRun'] is dry_run, 'El plan CLI difiere de la operación autorizada.')


def push(workdir, url, env, names, *, dry_run, stage):
    args = ['db', 'push', f'--remote={url}', '--workdir', str(workdir),
            '--skip-vault', '--output-format', 'json', '--agent', 'no']
    args += ['--dry-run'] if dry_run else ['--yes']
    output = C.cli_run(args, env, stage=stage)
    structured_plan(output, names, dry_run)


def private_text(path, content):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(content)


def guarded_preflight(run, baseline, url, env):
    # Compare live state to the existing baseline inside a read-only transaction;
    # return only a Boolean, not another copy of the catalog or any user records.
    inventory = (ROOT / 'supabase/recovery/inventory.sql').read_text().rstrip().rstrip(';')
    guard = run / 'baseline-guard.sql'
    private_text(guard, "SELECT jsonb_build_object('matches', current_setting('standard_conforming_strings') = 'on' AND "
                 '(SELECT inventory FROM (' + inventory + ') AS q(inventory)) IS NOT DISTINCT FROM '
                 + R.literal(json.dumps(baseline, ensure_ascii=False)) + '::jsonb) AS guard;\n')
    C.require(C.query(url, guard, env).get('matches') is True,
              'El estado remoto cambió desde el baseline; no se aplicó ninguna migración.')


def prefix_workdir(run, manifest, stage):
    workdir = run / f'stage-{stage}'
    C.private_directory(workdir)
    C.private_directory(workdir / 'supabase')
    C.private_directory(workdir / 'supabase/migrations')
    C.private_directory(workdir / 'supabase/.temp')
    private_text(workdir / 'supabase/config.toml', (ROOT / 'supabase/config.toml').read_text())
    private_text(workdir / 'supabase/.temp/project-ref', 'xsxdpaiivklqeudgqoqf')
    for item in manifest[:stage]:
        content = (ROOT / 'supabase/migrations' / item['file']).read_bytes()
        C.require(hashlib.sha256(content).hexdigest() == item['sha256'], 'Una migración cambió durante la ejecución.')
        destination = workdir / 'supabase/migrations' / item['file']
        fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
    return workdir


def assert_history(snapshot, manifest):
    ledger = R.history(snapshot)
    versions = [item['file'].split('_')[0] for item in manifest]
    C.require(set(ledger) == set(versions), 'Historial incompleto o inesperado; no continuar.')
    for item in manifest:
        row = ledger[item['file'].split('_')[0]]
        C.require(row.get('name') == item['file'].split('_', 1)[1][:-4]
                  and re.fullmatch('[0-9a-f]{32}', row.get('statements_checksum', '') or ''),
                  'Nombre o checksum de statements del historial incompatible.')


def recovery_artifacts(run, snapshots, stage):
    # Offline generation only, never executes compensation or migration repair.
    private_text(run / f'compensate-through-{stage}.sql', R.build(snapshots))
    C.save_private(run / f'compensate-through-{stage}.sql.repair-plan.json', R.repair_plan(snapshots))


def record_success(manifest, snapshots):
    final = snapshots[-1]
    own_tables = ['public.' + x for x in R.TABLES] + ['app_private.' + x for x in R.PRIVATE]
    C.require(all(final['relations'][name]['rls'] for name in own_tables), 'RLS no quedó habilitado en todas las tablas propias.')
    C.require(final['row_counts']['public.checklist_templates'] == 35, 'Contenido inicial de checklist incompatible.')
    summary = {'status': 'applied_verified', 'at_utc': datetime.now(timezone.utc).isoformat(),
               'versions': EXPECTED, 'migration_files_sha256': manifest,
               'remote_history_verified': True, 'all_four_transitions_validated': True,
               'compensation_bundles_prepared_offline': True,
               'application_tables': 13, 'application_tables_rls_enabled': True,
               'reference_checklist_rows': 35, 'auth_accounts_created': 0,
               'business_rows_created': 0, 'managed_event_triggers_preserved': True,
               'previous_suites_repeated': False, 'frontend_changed': False,
               'credentials_saved': False, 'push_merge_deploy_executed': False}
    evidence = ROOT / 'docs/validation/continuacion-af3259f-baseline.json'
    content = json.loads(evidence.read_text())
    content['remote_application'] = summary
    evidence.write_text(json.dumps(content, indent=2, ensure_ascii=False) + '\n')
    banner = ('\n**Aplicación remota verificada:** las versiones `20261117000100`, '
              '`20261117000200`, `20261117000300` y `20261117000400` quedaron registradas '
              'en ticketera-procont. Se comprobaron las cuatro transiciones con el alcance '
              'de recuperación, 13 tablas propias con RLS y 35 pasos genéricos de checklist. '
              'No se crearon cuentas ni superadmin. Las compensaciones se generaron solo '
              'en privado, sin ejecutarlas. La evidencia vigente está en '
              '`docs/validation/continuacion-af3259f-baseline.json`. Los estados NO APTO '
              'anteriores de estos informes son antecedentes, superados para este conjunto. '
              'Siguiente paso: definir con el propietario las áreas y la provisión inicial '
              'de acceso, bajo autorización separada.\n')
    for name in ['README.md', 'docs/conexion-cli-baseline.md', 'docs/fase-2b2-preparacion.md',
                 'docs/fase-2b3b-recovery-plan.md', 'docs/fase-2b3d-resolucion-bloqueos.md']:
        path = ROOT / name
        text = path.read_text()
        heading, rest = text.split('\n', 1)
        path.write_text(heading + '\n' + banner + rest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-local', action='store_true', help='Check existing local evidence only; no SQL or secret input.')
    args = parser.parse_args()
    target, proof, baseline, manifest = validate_local()
    C.require(C.cli_run(['--version'], C.cli_environment(''), stage='cli_version').strip() == '3.2.0', 'CLI diferente de 3.2.0.')
    if args.check_local:
        print('Baseline, identidad, ruta y cuatro hashes válidos. Sin conexión remota ni SQL.')
        return
    C.require(sys.stdin.isatty() and sys.stderr.isatty(), 'Ejecutar en la terminal interactiva local.')
    print('Destino verificado: ticketera-procont. Se aplicarán solo las cuatro migraciones autorizadas, por pasos.')
    print('La contraseña no se guardará. Cualquier fallo detiene el flujo, sin reparación automática.')
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        password = getpass.getpass('Contraseña PostgreSQL (entrada oculta): ')
    C.require(bool(password) and not any(c in password for c in '\r\n\x00'), 'Contraseña vacía o inválida.')
    env = C.cli_environment(password)
    del password
    route = proof['route']
    url = f"postgresql://{route['user']}@{route['host']}:5432/postgres?" + urlencode({'sslmode': 'verify-full', 'connect_timeout': '15'})
    runs = PRIVATE / 'recovery/applications'
    C.private_directory(runs)
    run = runs / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
    C.private_directory(run)
    guarded_preflight(run, baseline, url, env)
    push(ROOT, url, env, [item['file'] for item in manifest], dry_run=True, stage='verify_four_pending')
    scope = json.loads((ROOT / 'supabase/recovery/scope.json').read_text())
    snapshots = [baseline]
    for stage in range(1, 5):
        R.manifest()
        workdir = prefix_workdir(run, manifest, stage)
        push(workdir, url, env, [manifest[stage - 1]['file']], dry_run=True, stage=f'plan_{stage}')
        C.save_private(run / f'{stage}-push-started.json', {'stage': stage, 'at_utc': datetime.now(timezone.utc).isoformat()})
        try:
            push(workdir, url, env, [manifest[stage - 1]['file']], dry_run=False, stage=f'apply_{stage}')
        except (C.ConnectionError, ValueError, OSError, KeyboardInterrupt):
            # Capture uncertain state once; never retry the push or compensate.
            try:
                observed = C.query(url, ROOT / 'supabase/recovery/inventory.sql', env)
                C.save_private(run / f'failed-stage-{stage}-observed.json', observed)
            except (C.ConnectionError, ValueError, OSError):
                pass
            raise C.ConnectionError(f'Aplicación detenida en migración {stage}. Puede haber COMMIT o historial parcial; revisar evidencia privada antes de actuar.') from None
        after = C.query(url, ROOT / 'supabase/recovery/inventory.sql', env)
        C.save_private(PRIVATE / f'recovery/snapshots/{stage}.json', after)
        try:
            R.validate_transition(snapshots[-1], after, stage, scope)
            assert_history(after, manifest[:stage])
            snapshots.append(after)
            recovery_artifacts(run, snapshots, stage)
        except (ValueError, KeyError, OSError) as error:
            raise C.ConnectionError(f'Detenido tras enviar {EXPECTED[stage - 1]}: verificación o recuperación no satisfecha. Conservar {stage}.json privado; no reenviar ni continuar.') from None
        print(f'Migración {EXPECTED[stage - 1]} confirmada: historial, objetos y recuperación validados.')
    env.pop('PGPASSWORD', None)
    record_success(manifest, snapshots)
    print('Backend aplicado y verificado. Sin cuentas, superadmin, frontend ni publicación remota.')
    subprocess.run([sys.executable, str(ROOT / 'scripts/close_supabase_preparation.py'),
                    '--message', 'feat: aplicar y verificar migraciones de Ticketera Procont'], cwd=ROOT, check=True)


if __name__ == '__main__':
    sys.dont_write_bytecode = True
    try:
        main()
    except C.ConnectionError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError:
        print('El backend quedó verificado, pero el cierre Git local falló. No repetir la aplicación; revisar solo Git.', file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError, TypeError, OSError, getpass.GetPassWarning, EOFError, KeyboardInterrupt):
        print('Ejecución detenida; conservar evidencia privada y revisar la última etapa. No reintentar ni aplicar compensación automáticamente.', file=sys.stderr)
        sys.exit(1)
