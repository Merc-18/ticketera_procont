#!/usr/bin/env python3
"""Run existing localhost services; the server key stays in the server process only."""
import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import warnings

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'xsxdpaiivklqeudgqoqf'
SUPABASE_URL = f'https://{PROJECT}.supabase.co'
SOURCE_ENV = Path('/home/procont/projects/ticketera-procont/.env.local')


def public_config():
    source = ROOT / '.env.local'
    if not source.is_file(): source = SOURCE_ENV
    values = {}
    for line in source.read_text().splitlines():
        key, separator, value = line.partition('=')
        if separator and key.strip() in ('VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY'):
            values[key.strip()] = value.strip().strip('\"\'')
    if values.get('VITE_SUPABASE_URL', '').rstrip('/') != SUPABASE_URL:
        raise ValueError('La configuración pública no identifica ticketera-procont.')
    key = values.get('VITE_SUPABASE_PUBLISHABLE_KEY') or values.get('VITE_SUPABASE_ANON_KEY')
    if not key: raise ValueError('Falta la clave publicable existente.')
    if not key.startswith('sb_publishable_'):
        try:
            claims = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==='))
            if claims.get('role') != 'anon' or claims.get('ref') != PROJECT: raise ValueError()
        except Exception: raise ValueError('La configuración del navegador requiere una clave publicable del proyecto.') from None
    return values


def clean_environment():
    # Neither a server key nor any inherited VITE_* secret can reach Vite.
    return {key: value for key, value in os.environ.items()
            if not key.startswith(('VITE_', 'SUPABASE_', 'QUIPU_', 'QUIPUFAC_'))}


def frontend_environment():
    return clean_environment() | public_config() | {
        'VITE_CLIENT_LOGIN_ENABLED': '1', 'VITE_CLIENT_PORTAL_MOCK': '0',
        'VITE_CLIENT_LOGIN_DEV_ORIGIN': 'http://localhost:8000',
    }


def validate_server_key(key):
    if re.fullmatch(r'sb_secret_[A-Za-z0-9_-]{12,}', key): return
    try:
        claims = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==='))
        if claims.get('role') == 'service_role' and claims.get('ref') == PROJECT: return
    except Exception: pass
    raise ValueError('Se requiere una clave de servidor de ticketera-procont; una clave publicable no la sustituye.')


def require_port(port):
    with socket.socket() as sock:
        try: sock.bind(('127.0.0.1', port))
        except OSError: raise ValueError(f'El puerto local {port} ya está ocupado; no se detuvo otro proceso.') from None


def deno_command():
    binary = shutil.which('deno')
    if not binary:
        candidates = sorted(Path('/tmp/procont-m13-npm-cache/_npx').glob('*/node_modules/deno/deno'))
        binary = str(candidates[0]) if candidates else None
    if not binary: raise ValueError('Falta el ejecutable Deno usado por el procedimiento existente.')
    return [binary, 'run', '--cached-only', '--allow-env', '--allow-net',
            'supabase/functions/client-login/index.ts']


def run(args):
    children = []
    if args.frontend_only and args.server_only: raise ValueError('Selecciona un único modo de arranque.')
    public_config()  # Always pin the server and browser to the same project.
    if not args.frontend_only: require_port(8000)
    if not args.server_only: require_port(5173)
    try:
        if not args.frontend_only:
            command = deno_command()
            if not sys.stdin.isatty(): raise ValueError('Se requiere terminal para introducir la clave oculta.')
            with warnings.catch_warnings():
                warnings.simplefilter('error', getpass.GetPassWarning)
                server_key = getpass.getpass('SUPABASE_SERVICE_ROLE_KEY de ticketera-procont (oculta): ')
            if not server_key or '\n' in server_key or '\r' in server_key:
                raise ValueError('Falta una clave de servidor válida.')
            validate_server_key(server_key)
            server_env = clean_environment() | {
                'SUPABASE_URL': SUPABASE_URL, 'SUPABASE_SERVICE_ROLE_KEY': server_key,
                'PROCONT_ALLOWED_ORIGINS': 'http://localhost:5173',
                'QUIPU_AUTH_URL': 'https://api-gestion-test.quipufac.com/api/users/auth',
                'QUIPUFAC_AUTH_URL': 'https://dev.quipufac.com/auth/login',
            }
            if Path('/tmp/procont-m13-deno').is_dir(): server_env['DENO_DIR'] = '/tmp/procont-m13-deno'
            children.append(subprocess.Popen(command, cwd=ROOT, env=server_env, start_new_session=True))
            server_env.clear(); server_key = None
        if not args.server_only:
            children.append(subprocess.Popen(['npm', 'run', 'dev', '--', '--host', 'localhost',
                '--port', '5173', '--strictPort'], cwd=ROOT, env=frontend_environment(), start_new_session=True))
        print(('Vite usa contratos reales; falta el servidor en localhost:8000. ' if args.frontend_only else
            'Clave solo en el proceso servidor; no se guardó en archivos. ') +
            'Proyecto: ticketera-procont. Ctrl+C detiene los procesos iniciados aquí.', flush=True)
        while all(child.poll() is None for child in children): time.sleep(.25)
        if any(child.returncode not in (None, 0) for child in children):
            raise ValueError('Un servicio local terminó con error; no se muestran variables privadas.')
    finally:
        for child in children:
            if child.poll() is None: os.killpg(child.pid, signal.SIGTERM)
        for child in children:
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL); child.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frontend-only', action='store_true')
    parser.add_argument('--server-only', action='store_true')
    try: run(parser.parse_args())
    except KeyboardInterrupt: return 0
    except (ValueError, OSError, EOFError, getpass.GetPassWarning) as error:
        # OS diagnostics may contain configuration; print only fixed application messages.
        print(str(error) if type(error) is ValueError else 'No se pudo iniciar el servicio local; valores privados omitidos.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__': sys.exit(main())
