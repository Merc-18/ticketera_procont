#!/usr/bin/env python3
"""One POST per development provider; hidden passwords, allowlisted output only."""
import argparse
import getpass
import json
import socket
import ssl
import sys
import warnings
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

RUC = '20602111602'
USERNAME = 'Marco'
PROVIDERS = {
    'quipu': 'https://api-gestion-test.quipufac.com/api/users/auth',
    'quipufac': 'https://dev.quipufac.com/auth/login',
}
# Unknown keys may themselves contain personal data: never print them.
SAFE_KEYS = set(('data result response payload auth authentication user usuario users '
                 'company empresa business account profile identity attributes '
                 'success successful authenticated isAuthenticated status statusCode code ok '
                 'error errors message messages detail details errorCode error_code '
                 'token access_token accessToken refresh_token refreshToken id_token jwt '
                 'ruc RUC document document_number documentNumber numero_documento '
                 'id _id uuid user_id userId id_user idUser id_usuario usuario_id '
                 'username userName name nombre full_name fullName nombres apellidos '
                 'company_name companyName business_name businessName businessRuc razon_social razonSocial '
                 'token_type tokenType expires_in expiresIn').split())
TOKENS = {'token', 'access_token', 'accessToken', 'refresh_token', 'refreshToken', 'id_token', 'jwt'}
MARKERS = {'success', 'successful', 'authenticated', 'isAuthenticated', 'status', 'statusCode', 'code', 'ok'}
SAFE_MARKERS = {'success', 'ok', 'OK', 'SUCCESS', 'authenticated', 'error', 'ERROR', 'failed', 'true', 'false'}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def describe(body):
    """Describe types/paths, never credentials, token values, names or identifiers."""
    fields, omitted = [], 0

    def visit(value, path, depth=0):
        nonlocal omitted
        if len(fields) >= 160 or depth > 8:
            omitted += 1
            return
        kind = ('null' if value is None else 'boolean' if isinstance(value, bool) else
                'object' if isinstance(value, dict) else 'array' if isinstance(value, list) else
                'string' if isinstance(value, str) else 'number')
        field = {'path': path, 'type': kind}
        key = path[-1] if path else None
        if kind == 'string':
            field['nonempty'] = bool(value.strip())
        if key in TOKENS:
            field['token_present'] = isinstance(value, str) and bool(value.strip())
        elif key in MARKERS and (isinstance(value, bool) or
                                type(value) is int and value in (0, 1, 200, 201, 400, 401, 403, 422, 500) or
                                isinstance(value, str) and value in SAFE_MARKERS):
            field['marker'] = value
        elif isinstance(value, str) and value == RUC:
            field['matches_requested_ruc'] = True
        elif isinstance(value, str) and value == USERNAME:
            field['matches_requested_username'] = True
        fields.append(field)
        if key in TOKENS:
            return
        if isinstance(value, dict):
            for name, child in value.items():
                if name in SAFE_KEYS:
                    visit(child, path + [name], depth + 1)
                else:
                    omitted += 1
        # Arrays can contain personal records or dynamic keys. Do not sample them.

    visit(body, [])
    return {'fields': fields, 'unknown_or_truncated_fields_omitted': omitted}


def probe(provider, password, opener=None):
    body = {'username': USERNAME if provider == 'quipu' else RUC, 'password': password}
    if provider == 'quipu':
        body['ruc'] = RUC
    req = Request(PROVIDERS[provider], data=json.dumps(body).encode(), method='POST',
                  headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
    opener = opener or build_opener(NoRedirect())
    result = {'provider': provider, 'authentication': 'unconfirmed_review_required'}
    try:
        try:
            response = opener.open(req, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            result['http_status'] = response.code
            if 300 <= response.code < 400:
                return result | {'error': 'redirect_blocked'}
            if response.code in (401, 403):
                result['authentication'] = 'rejected'
            raw = response.read(65537)
            if len(raw) > 65536:
                return result | {'error': 'response_too_large'}
            try:
                parsed = json.loads(raw)
            except (ValueError, UnicodeError, RecursionError):
                return result | {'error': 'response_not_json'}
            return result | describe(parsed)
    except (URLError, OSError, TimeoutError) as error:
        reason = error.reason if isinstance(error, URLError) else error
        code = ('dns_unavailable' if isinstance(reason, socket.gaierror) else
                'tls_verification_failed' if isinstance(reason, ssl.SSLCertVerificationError) else
                'transport_unavailable_no_retry')
        return result | {'error': code}
    finally:
        body.clear()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=tuple(PROVIDERS), help='Probar solo un proveedor; por defecto ambos.')
    args = parser.parse_args()
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        print('Se requiere terminal interactiva para ocultar las contraseñas.', file=sys.stderr)
        return 2
    print('Desarrollo: un POST por proveedor, sin reintentos ni redirecciones. '
          'La salida omite valores privados.', file=sys.stderr)
    for provider in ([args.provider] if args.provider else PROVIDERS):
        # Fail instead of getpass's fallback to visible input.
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            password = getpass.getpass(f'Contraseña {provider} (oculta): ')
        if not password:
            print('Contraseña vacía; prueba detenida sin solicitarla otra vez.', file=sys.stderr)
            return 2
        result = probe(provider, password)
        password = None
        print(json.dumps(result, ensure_ascii=True, indent=2), flush=True)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (EOFError, KeyboardInterrupt, getpass.GetPassWarning):
        print('\nPrueba cancelada; no se reintenta.', file=sys.stderr)
        sys.exit(2)
