#!/usr/bin/env python3
"""Trusted local bootstrap. Default is a network-free plan; --execute is explicit.

Requires the fifth migration, approved identity, service credential and database
owner password. No endpoint or browser can bootstrap a superadministrator.
"""
import argparse
import getpass
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlencode
import warnings

ROOT = Path(__file__).resolve().parents[1]


class BootstrapError(RuntimeError):
    """Safe operator messages without credentials or raw remote errors."""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    if not args.execute:
        print('PLAN: requiere migración 20261118000100 autorizada y aplicada; ninguna cuenta creada.')
        print('Tras autorización e identidad aprobada: entrada local de secretos, comprobar instalación vacía, crear Auth confirmado y bootstrap privado único.')
        print('No se ejecutará nada remoto sin --execute. No guardar claves en VITE_*, argumentos ni archivos.')
        return
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise BootstrapError('Usar terminal administrativa interactiva.')
    spec = importlib.util.spec_from_file_location('connection', ROOT / 'scripts/connect_supabase_cli.py')
    c = importlib.util.module_from_spec(spec); spec.loader.exec_module(c)
    target = c.read_private_json(ROOT / '.supabase-local/target.json')
    if target.get('expected_name') != 'ticketera-procont' or target.get('project_ref') != 'xsxdpaiivklqeudgqoqf':
        raise BootstrapError('Destino incorrecto.')
    route = c.saved_link_route(target)
    email = input('Correo del primer superadministrador aprobado: ').strip().lower()
    name = input('Nombre completo aprobado: ').strip()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email)>320 or not 1<=len(name)<=200:
        raise BootstrapError('Identidad inválida.')
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        database_password = getpass.getpass('Contraseña PostgreSQL del propietario: ')
        key = getpass.getpass('Clave privilegiada Supabase (solo en esta terminal): ')
        password = getpass.getpass('Contraseña nueva (12–128 caracteres): ')
        repeated = getpass.getpass('Repetir contraseña nueva: ')
    if not database_password or not key or key.startswith('sb_publishable_') or not 12<=len(password)<=128 or repeated!=password:
        raise BootstrapError('Credenciales inválidas; no se ejecutó el alta.')
    env = c.cli_environment(database_password)
    url = f"postgresql://{route['user']}@{route['host']}:5432/postgres?"+urlencode({'sslmode':'verify-full','connect_timeout':'15'})
    work = Path(tempfile.mkdtemp(prefix='bootstrap-', dir=ROOT/'.supabase-local'))
    def sql_file(name, value):
        path=work/name
        fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as stream: stream.write(value)
        return path
    # No Auth/profile records are exported, only counts and prerequisite flags.
    preflight=sql_file('guard.sql', """SELECT jsonb_build_object('ready',
      current_user='postgres' AND
      to_regprocedure('public.admin_account_finish(uuid,uuid)') IS NOT NULL AND
      has_column_privilege('auth.users','email_confirmed_at','SELECT') AND
      has_function_privilege('app_private.bootstrap_superadmin(uuid)','EXECUTE') AND
      NOT EXISTS(SELECT 1 FROM app_private.account_bootstrap) AND
      NOT EXISTS(SELECT 1 FROM app_private.security_events WHERE action='superadmin_bootstrap') AND
      NOT EXISTS(SELECT 1 FROM public.users) AND NOT EXISTS(SELECT 1 FROM auth.users)) AS guard;""")
    if c.query(url,preflight,env).get('ready') is not True:
        raise BootstrapError('Bootstrap no disponible. Revisión del propietario necesaria; no se creó Auth.')
    result=subprocess.run(['node',str(ROOT/'scripts/bootstrap_auth_identity.mjs')],
        input=json.dumps({'url':f"https://{target['project_ref']}.supabase.co",'key':key,
                          'email':email,'full_name':name,'password':password}),
        text=True,capture_output=True,cwd=ROOT,timeout=45)
    del key,password,repeated
    if result.returncode:
        raise BootstrapError('Resultado Auth no confirmado; revisar antes de reintentar. No se ejecutó bootstrap.')
    user_id=json.loads(result.stdout)['id']
    if not re.fullmatch(r'[0-9a-fA-F-]{36}',user_id):
        raise BootstrapError('Identidad Auth no confirmada; detenerse.')
    statement=sql_file('bootstrap.sql', f"SELECT app_private.bootstrap_superadmin('{user_id}'::uuid);\n")
    try:
        c.cli_run(['db','query',f'--remote={url}','--file',str(statement),'--yes','--agent','no'],
                  env,stage='owner_only_bootstrap')
    except Exception:
        raise BootstrapError(f'Auth creado, bootstrap no confirmado. Conservar UUID {user_id}; revisar estado antes de repetir. La cuenta no se elimina automáticamente.') from None
    check=sql_file('verify.sql',f"SELECT jsonb_build_object('ok',EXISTS(SELECT 1 FROM public.users u JOIN app_private.account_bootstrap b ON b.subject_id=u.id WHERE u.id='{user_id}'::uuid AND u.role='superadmin' AND u.is_active)) AS result;")
    if c.query(url,check,env).get('ok') is not True:
        raise BootstrapError('Resultado de bootstrap pendiente de revisión; no repetir.')
    print('Primer superadministrador confirmado. Sin claves ni contraseñas persistidas.')


if __name__=='__main__':
    sys.dont_write_bytecode=True
    try: main()
    except BootstrapError as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
    except (ValueError,OSError,KeyError,RuntimeError,subprocess.TimeoutExpired,EOFError,KeyboardInterrupt,getpass.GetPassWarning):
        print('Inicialización detenida. Revisar la última etapa en el entorno administrativo; no pegar secretos ni reintentar automáticamente.',file=sys.stderr)
        sys.exit(1)
