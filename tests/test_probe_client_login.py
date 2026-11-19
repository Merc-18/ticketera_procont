"""Offline safety checks. No external requests or real credentials."""
import importlib.util
import io
import json
from pathlib import Path
import socket
import unittest
from urllib.error import HTTPError, URLError

spec = importlib.util.spec_from_file_location('probe', Path(__file__).resolve().parents[1] / 'scripts/probe_client_login.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class Reply(io.BytesIO):
    code = 200


class Opener:
    def __init__(self, body=None, error=None):
        self.calls = []
        self.body, self.error = body, error

    def open(self, req, timeout):
        self.calls.append(req)
        if self.error:
            raise self.error
        return Reply(json.dumps(self.body).encode())


class ProbeSafety(unittest.TestCase):
    def test_only_safe_markers_and_presence_leave_memory(self):
        secret = 'synthetic-private-value'
        body = {'success': True, 'username': probe.USERNAME, 'token': secret,
                'user': {'id': secret, 'name': secret, 'ruc': probe.RUC},
                'error': {'message': secret}, secret: secret,
                'data': [{'token': secret}], 'status': secret}
        result = probe.describe(body)
        encoded = json.dumps(result)
        self.assertNotIn(secret, encoded)
        self.assertNotIn(probe.RUC, encoded)
        self.assertNotIn(probe.USERNAME, encoded)
        self.assertTrue(any(f.get('token_present') for f in result['fields']))
        self.assertTrue(any(f.get('matches_requested_ruc') for f in result['fields']))
        self.assertTrue(any(f.get('marker') is True for f in result['fields']))
        self.assertGreater(result['unknown_or_truncated_fields_omitted'], 0)

    def test_bodies_and_one_request_per_provider(self):
        for provider in probe.PROVIDERS:
            opener = Opener({'username': probe.USERNAME, 'token': 'synthetic-token'})
            result = probe.probe(provider, 'synthetic-password', opener)
            self.assertEqual(len(opener.calls), 1)
            request = opener.calls[0]
            expected = {'username': probe.USERNAME if provider == 'quipu' else probe.RUC,
                        'password': 'synthetic-password'}
            if provider == 'quipu':
                expected['ruc'] = probe.RUC
            self.assertEqual(json.loads(request.data), expected)
            self.assertEqual(request.method, 'POST')
            self.assertEqual(result['http_status'], 200)
            self.assertNotIn('synthetic-password', json.dumps(result))

    def test_dns_failure_never_retries_or_prints_diagnostic(self):
        opener = Opener(error=URLError(socket.gaierror(-2, 'private diagnostic')))
        result = probe.probe('quipufac', 'synthetic-password', opener)
        self.assertEqual(result['error'], 'dns_unavailable')
        self.assertEqual(len(opener.calls), 1)
        self.assertNotIn('private diagnostic', json.dumps(result))

    def test_redirect_is_not_followed_and_body_is_not_printed(self):
        error = HTTPError(probe.PROVIDERS['quipu'], 302, 'private diagnostic', {}, io.BytesIO(b'private response'))
        opener = Opener(error=error)
        result = probe.probe('quipu', 'synthetic-password', opener)
        self.assertEqual(result['error'], 'redirect_blocked')
        self.assertEqual(len(opener.calls), 1)
        self.assertNotIn('private', json.dumps(result))
        self.assertIsNone(probe.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://example.invalid'))

    def test_http_rejection_does_not_print_error_values(self):
        error = HTTPError(probe.PROVIDERS['quipu'], 401, 'private diagnostic', {},
                          io.BytesIO(b'{"error":"private value"}'))
        result = probe.probe('quipu', 'synthetic-password', Opener(error=error))
        self.assertEqual(result['authentication'], 'rejected')
        self.assertEqual(result['http_status'], 401)
        self.assertNotIn('private', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
