#!/usr/bin/env python3
"""CLI diagnosis and FIRST operational baseline; no migrations or role creation.

Only read-only CLI queries. Never login/link, mint roles, migrate, repair or run
the catalog preflight again. Password stays in memory/child environment only.
"""
import argparse
import errno
from datetime import datetime, timezone
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import warnings
from urllib.parse import unquote, urlsplit, urlencode

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.supabase-local'
CLI = Path('/home/procont/.local/lib/supabase-cli/3.2.0/supabase')
ROOT_CA = ROOT / 'supabase/recovery/cli-root-ca.pem'


class ConnectionError(ValueError):
    """Safe messages; never include raw connection strings or CLI output."""


def require(condition, message):
    if not condition:
        raise ConnectionError(message)


def read_private_json(path):
    require(not path.is_symlink() and path.is_file(), 'Falta un archivo privado requerido.')
    info = path.stat()
    require(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o600,
            'Un archivo privado requiere propietario actual y modo 600.')
    return json.loads(path.read_text())


def private_directory(path):
    require(not path.is_symlink(), 'Directorio privado con enlace simbólico; detenerse.')
    path.mkdir(mode=0o700, exist_ok=True)
    require(path.stat().st_uid == os.getuid() and stat.S_IMODE(path.stat().st_mode) == 0o700,
            'El directorio privado requiere propietario actual y modo 700.')


def save_private(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False)
        stream.write('\n')


def parse_target(value, ref):
    try:
        # Dashboard's literal placeholder uses brackets that urlsplit otherwise
        # interprets as an IPv6 authority. Remove only that password placeholder.
        value = re.sub(r':\[(?:YOUR-PASSWORD|YOUR_PASSWORD)\]@', ':@', value.strip())
        url = urlsplit(value)
        user = unquote(url.username or '')
        host = url.hostname or ''
        port = url.port or 5432
        direct = host == f'db.{ref}.supabase.co' and user == 'postgres'
        pooler = re.fullmatch(r'aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com', host) and user == f'postgres.{ref}'
        require(url.scheme in ('postgres', 'postgresql') and (direct or pooler),
                'La conexión no identifica exclusivamente el proyecto fijado con operador postgres.')
        require(port == 5432 and url.path == '/postgres' and not url.fragment,
                'Usar base postgres, puerto 5432 y conexión directa o pooler de sesión.')
        # Ignore Dashboard query settings; rebuild a single-host, verified TLS URL.
        # In particular, never permit a host/user/password override in the query.
        from urllib.parse import parse_qsl
        require(all(k == 'sslmode' and v in ('require', 'verify-full')
                    for k, v in parse_qsl(url.query, keep_blank_values=True)),
                'La URL incluye opciones no admitidas; usar la cadena de Connect sin opciones adicionales.')
        password = unquote(url.password or '')
        if password in ('[YOUR-PASSWORD]', 'YOUR-PASSWORD', '[YOUR_PASSWORD]'):
            password = ''
        return {'host': host, 'user': user, 'port': port, 'database': 'postgres'}, password
    except (TypeError, ValueError) as error:
        if isinstance(error, ConnectionError):
            raise
        raise ConnectionError('Cadena PostgreSQL inválida; no se guardó ni mostró su contenido.') from None


def saved_link_route(target):
    """Reuse CLI's saved link without API calls or temporary login roles."""
    folder = ROOT / 'supabase' / '.temp'
    ref_path = folder / 'project-ref'
    pooler_path = folder / 'pooler-url'
    require(ref_path.is_file() and not ref_path.is_symlink()
            and ref_path.read_text().strip() == target['project_ref'],
            'El enlace CLI no coincide con el destino fijado; detenerse.')
    require(pooler_path.is_file() and not pooler_path.is_symlink(),
            'Falta el endpoint de sesión guardado por la CLI.')
    route, saved_password = parse_target(pooler_path.read_text().strip(), target['project_ref'])
    require(not saved_password, 'El endpoint guardado contiene una contraseña; no reutilizarlo así.')
    metadata = folder / 'linked-project.json'
    if metadata.is_file():
        linked = json.loads(metadata.read_text())
        require(linked.get('ref') == target['project_ref']
                and linked.get('name') == target['expected_name'],
                'Los metadatos del enlace no corresponden a ticketera-procont.')
    return route


def cli_environment(password):
    env = os.environ.copy()
    # Explicitly neutralize project .env/libpq fallbacks and unrelated API tokens.
    for key in list(env):
        if key.startswith(('PG', 'SUPABASE_')):
            del env[key]
    for key in ('PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE',
                'PGSSLCERT', 'PGSSLKEY', 'PGSSLROOTCERT', 'PGSSLPASSWORD', 'PGAPPNAME'):
        env[key] = ''
    env.update({'SUPABASE_HOME': str(PRIVATE / 'cli-home'),
                'SUPABASE_TELEMETRY_DISABLED': '1', 'DO_NOT_TRACK': '1',
                'PGPASSWORD': password, 'PGPASSFILE': '/dev/null',
                'PGCONNECT_TIMEOUT': '15', 'PGSSLMODE': 'verify-full',
                'PGSSLROOTCERT': str(ROOT_CA)})
    return env


def classify_failure(output):
    """Return only fixed codes, never an excerpt or value from CLI output."""
    text = output.lower()
    if any(x in text for x in ('self signed certificate', 'self-signed certificate',
            'unable to verify', 'certificate verify failed', 'certificate has expired',
            'cert_has_expired', 'cert_altname_invalid', 'self_signed_cert',
            'unable_to_get_issuer_cert', 'tls handshake', 'does not support ssl',
            'certificate did not verify', 'certificate verification',
            'unable to get local issuer', 'unable_to_verify_leaf_signature')):
        return 'tls'
    if any(x in text for x in ('tenant or user not found', 'invalid tenant',
            'failed to parse connection string', 'project not found', 'invalid project ref')):
        return 'endpoint'
    if any(x in text for x in ('28p01', 'password authentication failed',
            'scram authentication failed', 'password must be a string')):
        return 'password'
    if any(x in text for x in ('unauthorized', 'access token not provided',
            'invalid access token', 'status 401', 'status 403', 'http 401', 'http 403')):
        return 'api_auth'
    if any(x in text for x in ('econnrefused', 'econnreset', 'etimedout', 'enetunreach',
            'ehostunreach', 'enotfound', 'eai_again', 'getaddrinfo', 'timed out',
            'network is unreachable', 'connection refused')):
        return 'connection'
    if any(x in text for x in ('unknown flag', 'unknown option', 'unrecognized option',
            'unexpected argument', 'erofs', 'eacces', 'enoent', 'command not found',
            'invalid merged config', 'unknown subcommand', 'unknown argument')):
        return 'cli_execution'
    if any(x in text for x in ('42501', 'permission denied', 'insufficient privilege')):
        return 'sql_permissions'
    if any(x in text for x in ('sqlstate', 'syntax error', '42p01', '42883', '42703')):
        return 'sql'
    return 'unclassified'


def fail_cli(category, stage, returncode=None):
    messages = {
        'tls': 'TLS: revisar CA/certificado y nombre del servidor; no se atribuye a contraseña.',
        'endpoint': 'ENDPOINT: servidor, proyecto o tenant no admitido; no cambiar de proyecto.',
        'password': 'CONTRASEÑA DB: el servidor rechazó la autenticación PostgreSQL.',
        'api_auth': 'SESIÓN CLI: el token existente no permite esta lectura de Management API.',
        'connection': 'CONEXIÓN: fallo DNS, red, puerto o tiempo de espera.',
        'cli_execution': 'EJECUCIÓN CLI: revisar binario, argumentos o permisos locales.',
        'sql_permissions': 'PERMISOS SQL: la sesión no puede completar la lectura.',
        'sql': 'SQL: el servidor rechazó la consulta; no es un diagnóstico de contraseña.',
        'unclassified': 'SIN CLASIFICAR: no hay evidencia suficiente para atribuir la causa.',
    }
    diagnostic = {'format': 'procont-safe-cli-diagnostic-v1',
                  'at_utc': datetime.now(timezone.utc).isoformat(),
                  'stage': stage, 'category': category, 'returncode': returncode,
                  'raw_output_saved': False, 'credentials_saved': False}
    name = 'cli-diagnostic-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f') + '.json'
    try:
        save_private(PRIVATE / 'recovery' / name, diagnostic)
    except OSError:
        pass  # Failure to save diagnostics must never expose raw CLI exceptions.
    raise ConnectionError(f'Etapa {stage}. {messages[category]} Sin reintento automático.')


def cli_run(arguments, env, *, stage='cli'):
    try:
        result = subprocess.run([str(CLI), *arguments], cwd=ROOT, env=env,
                                stdin=subprocess.DEVNULL, capture_output=True,
                                text=True, timeout=55)
    except subprocess.TimeoutExpired:
        fail_cli('connection', stage)
    except OSError as error:
        category = 'cli_execution' if error.errno in (errno.ENOENT, errno.EACCES, errno.EROFS, errno.ENOEXEC) else 'unclassified'
        fail_cli(category, stage)
    if result.returncode != 0:
        fail_cli(classify_failure(result.stderr + '\n' + result.stdout), stage, result.returncode)
    return result.stdout


def query(url, path, env):
    # Explicit URL selects the native database driver, even in a linked checkout.
    # Bare --remote would use Management API for db query in this CLI version.
    require(isinstance(url, str) and url.startswith('postgresql://'), 'Se requiere la ruta nativa fijada.')
    selector = f'--remote={url}'
    output = cli_run(['db', 'query', selector, '--file', str(path),
                      '--read-only', '--output', 'json', '--agent', 'no'], env,
                     stage=f'{path.stem}_native')
    rows = json.loads(output)
    require(isinstance(rows, list) and len(rows) == 1 and isinstance(rows[0], dict)
            and len(rows[0]) == 1, 'Salida CLI inesperada; detenerse sin guardar un baseline válido.')
    value = next(iter(rows[0].values()))
    if isinstance(value, str):
        value = json.loads(value)
    require(isinstance(value, dict), 'La salida no contiene el objeto JSON esperado.')
    return value


def verify_identity(identity, previous):
    require(identity.get('database_oid') == previous['database_oid']
            and identity.get('server_version_num') == previous['server_version_num'],
            'Instancia o versión diferente de la exportación; detenerse sin repetir inventario.')
    require(identity.get('current_user') == previous['current_user'] == 'postgres'
            and identity.get('session_user') == previous['session_user'] == 'postgres',
            'La identidad CLI no coincide con postgres/postgres del inventario.')
    expected = {'postgres_operator', 'database_postgres', 'read_only',
                'database_create_temp', 'public_usage_create', 'public_owner',
                'auth_usage_references', 'auth_source_select', 'auth_uid',
                'languages', 'platform_roles', 'realtime_owner'}
    checks = identity.get('checks', {})
    require(set(checks) == expected and all(value is True for value in checks.values()),
            'Algún privilegio de la sesión real no satisface las condiciones; detenerse.')


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def preparation():
    private_directory(PRIVATE)
    private_directory(PRIVATE / 'recovery')
    private_directory(PRIVATE / 'cli-home')
    private_directory(PRIVATE / 'recovery' / 'snapshots')
    target = read_private_json(PRIVATE / 'target.json')
    require(target.get('expected_name') == 'ticketera-procont'
            and re.fullmatch('[a-z]{20}', target.get('project_ref', '')),
            'El destino local no es ticketera-procont.')
    receipt = read_private_json(PRIVATE / 'recovery' / 'catalog-evidence-receipt.json')
    source = PRIVATE / 'recovery' / 'source-catalog.txt'
    require(not source.is_symlink() and stat.S_IMODE(source.stat().st_mode) == 0o600,
            'Fuente de inventario con permisos inválidos.')
    raw = source.read_bytes()
    require(receipt.get('format') == 'procont-existing-catalog-receipt-v1'
            and receipt.get('source_sha256') == hashlib.sha256(raw).hexdigest(),
            'El inventario no corresponde al recibo offline existente.')
    importer = load_module('catalog_import', ROOT / 'scripts/import_supabase_inventory.py')
    rows = importer.parse_export(raw)  # Reuse accepted export; do not run the importer/tests again.
    contexts = [row['details'] for row in rows if row['section'] == '00_context']
    require(len(contexts) == 1, 'Contexto único requerido en la exportación existente.')
    previous = json.loads(contexts[0]) if isinstance(contexts[0], str) else contexts[0]
    require(previous.get('format') == 'procont-catalog-preflight-v1', 'Formato de evidencia incorrecto.')
    recovery = load_module('migration_recovery', ROOT / 'scripts/build_migration_recovery.py')
    migrations = recovery.manifest()
    for path in (PRIVATE / 'recovery' / 'cli-identity.json',
                 PRIVATE / 'recovery' / 'snapshots' / '0.json',
                 PRIVATE / 'cli-connection.json'):
        require(not os.path.lexists(path), 'Hay evidencia anterior; revisarla antes de abrir otra conexión.')
    return target, previous, receipt, recovery, migrations


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare-only', action='store_true', help='Local prerequisites only; no SQL, network or password input.')
    parser.add_argument('--use-saved-link', action='store_true',
                        help='Reuse the pinned CLI session endpoint; only prompt for the DB password.')
    args = parser.parse_args()
    target, previous, receipt, recovery, migrations = preparation()
    route = saved_link_route(target) if args.use_saved_link else None
    env = cli_environment('')
    require(cli_run(['--version'], env, stage='cli_version').strip() == '3.2.0', 'CLI instalada diferente de 3.2.0.')
    if args.prepare_only:
        print('Recibo y destino válidos; CLI 3.2.0 operativa. Sin conexión remota ni SQL.')
        return
    require(sys.stdin.isatty() and sys.stderr.isatty(), 'Ejecutar únicamente en la terminal interactiva local.')
    if route is None:
        print('Pegar la cadena PostgreSQL de Connect, directa o Session pooler (5432). Entrada oculta.')
    else:
        print('Se reutiliza el enlace verificado de ticketera-procont y su endpoint de sesión.')
    print('Solo identidad y primer baseline de recuperación. No se aplicarán migraciones ni se guardará la contraseña.')
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        password = ''
        if route is None:
            route, password = parse_target(getpass.getpass('Cadena PostgreSQL: '), target['project_ref'])
        if not password:
            password = getpass.getpass('Contraseña de la base de datos: ')
    require(bool(password) and not any(c in password for c in '\r\n\x00'), 'Contraseña vacía o no válida.')
    env = cli_environment(password)
    del password
    # No password in argv, local files, output, shell history or Management API.
    url = f"postgresql://{route['user']}@{route['host']}:5432/postgres?" + urlencode(
        {'sslmode': 'verify-full', 'connect_timeout': '15'})
    identity = query(url, ROOT / 'supabase/recovery/connection_check.sql', env)
    verify_identity(identity, previous)
    save_private(PRIVATE / 'recovery' / 'cli-identity.json', identity)
    print('Identidad CLI y privilegios confirmados. Capturando el primer baseline operativo privado…')
    snapshot = query(url, ROOT / 'supabase/recovery/inventory.sql', env)
    require(snapshot.get('database_oid') == identity['database_oid']
            and snapshot.get('operator') == identity['current_user']
            and int(snapshot.get('server_version_num', 0)) == identity['server_version_num'],
            'El baseline no corresponde a la conexión comprobada.')
    recovery.validate_baseline(snapshot)
    save_private(PRIVATE / 'recovery' / 'snapshots' / '0.json', snapshot)
    save_private(PRIVATE / 'cli-connection.json', {
        'format': 'procont-native-cli-connection-v1', 'verified_at_utc': datetime.now(timezone.utc).isoformat(),
        'project_ref': target['project_ref'], 'expected_name': target['expected_name'],
        'route': route, 'sslmode': 'verify-full', 'cli_version': '3.2.0',
        'source_catalog_sha256': receipt['source_sha256'], 'baseline_sha256': hashlib.sha256(
            (PRIVATE / 'recovery' / 'snapshots' / '0.json').read_bytes()).hexdigest(),
        'migrations': migrations, 'identity_verified': True, 'baseline_validated': True,
        'password_saved': False, 'migrations_applied': False,
    })
    env.pop('PGPASSWORD', None)
    print('Conexión y baseline validados y guardados en privado. Supabase sin migraciones aplicadas por este comando.')


if __name__ == '__main__':
    sys.dont_write_bytecode = True
    try:
        main()
    except ConnectionError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, TypeError, KeyError, RuntimeError, getpass.GetPassWarning, EOFError):
        print('Preparación detenida. Conservar la evidencia privada; no se aplicaron migraciones. No pegar errores ni credenciales en el chat.', file=sys.stderr)
        sys.exit(1)
