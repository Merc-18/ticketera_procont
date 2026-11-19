#!/usr/bin/env python3
"""Collect visible local configuration; optional GET-only Data API check.

No Management token, CLI login/link, SQL, users, migrations or remote mutations.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_PROJECT = 'ticketera-procont'
# Immutable four-file preparation baseline, not the current migration inventory.
MIGRATION_FILES = (
    '20261117000100_schema.sql',
    '20261117000200_security.sql',
    '20261117000300_operations.sql',
    '20261117000400_reference_checklists.sql',
)


class PreparationError(Exception):
    """Errors never include credentials or raw HTTP response bodies."""


def normalize_input(value):
    # Reject before trimming/unquoting: never turn a multiline key into a valid one.
    if any(unicodedata.category(char) in ('Cc', 'Cf', 'Zl', 'Zp') for char in value):
        raise PreparationError('La entrada contiene caracteres de control o separadores de línea no admitidos.')
    value = value.strip()
    quotes = {'"': '"', "'": "'", '“': '”', '‘': '’'}
    while len(value) >= 2 and value[0] in quotes and value[-1] == quotes[value[0]]:
        value = value[1:-1].strip()
    return value


def normalize_project_url(value):
    url = normalize_input(value)
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError:
        raise PreparationError('Dominio incorrecto: usa el dominio canónico del proyecto en supabase.co.') from None
    if parsed.scheme != 'https':
        raise PreparationError('Protocolo incorrecto: la Project URL debe comenzar con https://.')
    try:
        if parsed.username is not None or parsed.password is not None or parsed.port is not None:
            raise PreparationError('Dominio incorrecto: no añadas credenciales ni puertos a la Project URL.')
        host = parsed.hostname or ''
    except ValueError:
        raise PreparationError('Dominio incorrecto: la Project URL no admite puertos.') from None
    suffix = '.supabase.co'
    if host != 'supabase.co' and not host.endswith(suffix):
        raise PreparationError('Dominio incorrecto: debe ser <identificador>.supabase.co.')
    if parsed.path not in ('', '/') or '?' in url or '#' in url:
        raise PreparationError('Ruta o parámetros adicionales: usa solo la URL base, sin rutas, query ni fragmentos.')
    ref = host[:-len(suffix)] if host.endswith(suffix) else ''
    if not re.fullmatch(r'[a-z]{20}', ref):
        raise PreparationError('Identificador de proyecto incorrecto: debe contener exactamente 20 letras de a-z, sin espacios ni subdominios adicionales.')
    return f'https://{ref}.supabase.co', ref


def validate_values(url, key, confirmed_name):
    if normalize_input(confirmed_name) != EXPECTED_PROJECT:
        raise PreparationError('El nombre confirmado no coincide con ticketera-procont. No se guardó configuración.')
    _normalized_url, ref = normalize_project_url(url)
    if not re.fullmatch(r'sb_publishable_[A-Za-z0-9_-]{12,}', normalize_input(key)):
        raise PreparationError('Se requiere una Publishable key; no se aceptan claves secretas, JWT ni placeholders.')
    return ref


def configure_visible_input():
    # GNU readline keeps a bracketed multiline paste in a single input buffer.
    # Disable automatic history: the visible key is never added to readline history.
    try:
        import readline
    except ImportError:
        return
    readline.set_auto_history(False)
    readline.parse_and_bind('set enable-bracketed-paste on')


def migration_manifest(root=ROOT):
    """Inventory current SQLs while verifying the original approved prefix hashes."""
    folder = root / 'supabase/migrations'
    files = sorted(folder.glob('*.sql'))
    if [p.name for p in files[:len(MIGRATION_FILES)]] != list(MIGRATION_FILES):
        raise PreparationError('Falta o cambió el orden del lote histórico de cuatro migraciones. Detenerse y revisar.')
    manifest = json.loads((root / 'docs/validation/fase-2b3d-migrations.json').read_text())
    actual = [{'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
              for path in files]
    if actual[:len(MIGRATION_FILES)] != manifest['migrations']:
        raise PreparationError('El contenido de las migraciones cambió respecto del manifiesto de preparación.')
    return actual


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def probe_data_api(url, key, open_request=None):
    # Only schema discovery. No table endpoint, RPC or Auth operation is called.
    request = urllib.request.Request(url.rstrip('/') + '/rest/v1/',
                                    headers={'apikey': key, 'Accept': 'application/openapi+json'}, method='GET')
    opener = open_request or urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open
    try:
        with opener(request, timeout=20) as response:
            body = response.read(2_000_001)
            if len(body) > 2_000_000:
                return {'accepted': False, 'http_status': response.status, 'reason': 'schema_response_too_large'}
            schema = json.loads(body)
            valid = response.status == 200 and isinstance(schema, dict) and isinstance(schema.get('paths'), dict)
            return {'accepted': valid, 'http_status': response.status,
                    'reason': 'openapi_received' if valid else 'openapi_unavailable'}
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        return {'accepted': False, 'http_status': status, 'reason': 'http_error'}
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return {'accepted': False, 'http_status': None, 'reason': 'connection_or_schema_error'}


def write_private(path, content):
    # O_EXCL prevents overwriting existing configuration and following symlinks.
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        raise PreparationError('Ya existe un archivo local de preparación; no se sobrescribió.') from None
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def save_configuration(root, url, key, ref, probe, manifest):
    env_file = root / '.env.local'
    state = root / '.supabase-local'
    if env_file.exists() or env_file.is_symlink() or state.exists() or state.is_symlink():
        raise PreparationError('La preparación local ya existe. No se modificaron sus archivos.')
    for name in ['.env.local', '.supabase-local/status.json', '.supabase-local/target.json']:
        result = subprocess.run(['git', '-C', str(root), 'check-ignore', '--no-index', '-q', name], capture_output=True)
        if result.returncode != 0:
            raise PreparationError('Las exclusiones Git no protegen todos los archivos locales. No se guardaron valores.')
    if subprocess.run(['git', '-C', str(root), 'ls-files', '--error-unmatch', '.env.local'],
                      capture_output=True).returncode == 0:
        raise PreparationError('.env.local está versionado; detenerse antes de guardar valores.')
    state.mkdir(mode=0o700)
    status = {
        'prepared_at_utc': datetime.now(timezone.utc).isoformat(),
        'environment_written': True,
        'expected_project_name': EXPECTED_PROJECT,
        'target_confirmation': 'manual_dashboard_attestation',
        'project_name_verified_by_management_api': False,
        'data_api': probe,
        'exposed_schemas_verified': False,
        'rls_verified_remotely': False,
        'cli_linked': False,
        'remote_migrations_applied': False,
        'remote_mutations_authorized': False,
        'migration_hashes': manifest,
    }
    # Private target pin is kept out of reports/logs. No API key duplication.
    target = {'expected_name': EXPECTED_PROJECT, 'project_ref': ref,
              'target_fingerprint': hashlib.sha256(ref.encode()).hexdigest()}
    try:
        write_private(state / 'target.json', json.dumps(target, indent=2) + '\n')
        write_private(state / 'status.json', json.dumps(status, indent=2) + '\n')
        write_private(env_file, f'VITE_SUPABASE_URL={url.rstrip("/")}\nVITE_SUPABASE_PUBLISHABLE_KEY={key}\n')
    except BaseException:
        # Only files exclusively created by this attempt; never existing inputs.
        for name in ['target.json', 'status.json']:
            (state / name).unlink(missing_ok=True)
        state.rmdir()
        raise
    return status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true', help='Guardar valores sin realizar siquiera el GET de Data API')
    args = parser.parse_args()
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise PreparationError('Ejecuta el asistente en una terminal interactiva; nunca mediante pipes o chat.')
    configure_visible_input()
    manifest = migration_manifest()
    if (ROOT / '.env.local').exists() or (ROOT / '.env.local').is_symlink() or (ROOT / '.supabase-local').exists():
        raise PreparationError('Ya existe configuración local. No se pedirán ni sobrescribirán sus valores.')
    print('Preparación exclusiva de ticketera-procont. Las entradas son visibles; la clave no se volverá a imprimir.')
    print('Comprueba en Dashboard el nombre y la Project URL del proyecto nuevo. No uses el proyecto anterior.')
    print('No se solicita token personal ni contraseña de base de datos. No se ejecuta SQL ni se inicia Vite.')
    url, _ref = normalize_project_url(input('Project URL del proyecto independiente: '))
    print(f'URL normalizada: {url}')
    key = normalize_input(input('Publishable key del mismo proyecto (sb_publishable_...): '))
    confirmed_name = normalize_input(input('Confirma el nombre visto en Dashboard: '))
    ref = validate_values(url, key, confirmed_name)
    probe = {'accepted': False, 'http_status': None, 'reason': 'not_requested_offline'}
    if not args.offline:
        print('Comprobando únicamente GET del esquema de Data API; no se consultan registros.')
        probe = probe_data_api(url, key)
    save_configuration(ROOT, url, key, ref, probe, manifest)
    print('Configuración guardada en .env.local con permisos 600; valores omitidos.')
    print('Estado resumido en .supabase-local/status.json; destino privado en target.json; todos ignorados por Git.')
    print('Destino confirmado manualmente; nombre no verificado por Management API.')
    print('Data API: ' + ('GET aceptado.' if probe['accepted'] else 'pendiente de confirmar en Dashboard.'))
    print('DETENIDO: no hay enlace CLI, migraciones remotas, usuarios ni privilegios asignados.')


if __name__ == '__main__':
    try:
        main()
    except PreparationError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (KeyboardInterrupt, EOFError):
        print('\nPreparación cancelada.', file=sys.stderr)
        sys.exit(1)
    except OSError:
        print('No se pudo completar la escritura local. Revisa permisos sin mostrar el contenido de los archivos.', file=sys.stderr)
        sys.exit(1)
