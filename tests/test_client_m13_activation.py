"""Only new activation guards; no network or database changes."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('client_m13_activation', ROOT/'scripts/activate_client_m13.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def valid_permissions():
    shared = {'client_session_info','client_logout','client_products','client_submit_request',
              'client_list_tickets','client_ticket_detail','client_reserve_attachments'}
    service = {'client_open_session','client_issue_entry_code','client_exchange_entry_code'}
    result = {'rpc': {}, 'private_helpers_closed':True,'tables_private':True,'global_product_bindings':2,
              'read_only':'on','new_identity_rows':0,'new_company_rows':0,'new_session_rows':0,'new_code_rows':0,'new_ticket_links':0}
    for name in shared|service|{'set_client_company_studio'}:
        result['rpc'][name]={'anon':name in shared,'authenticated':name in shared or name=='set_client_company_studio',
          'service_role':name in shared or name in service,'public':False,'security_definer':True,'locked_path':True}
    return result


class ActivationGuards(unittest.TestCase):
    def test_mint_or_internal_helpers_cannot_be_opened_to_public(self):
        original=valid_permissions()
        m.check_permissions(original)
        for mutation in ['mint_anon','mapping_service','public','helper']:
            value=copy.deepcopy(original)
            if mutation=='mint_anon': value['rpc']['client_open_session']['anon']=True
            elif mutation=='mapping_service': value['rpc']['set_client_company_studio']['service_role']=True
            elif mutation=='public': value['rpc']['client_products']['public']=True
            else: value['private_helpers_closed']=False
            with self.subTest(mutation=mutation),self.assertRaises(m.C.ConnectionError): m.check_permissions(value)

    def test_unexpected_remote_rows_or_readwrite_verification_stops(self):
        for field,value in [('new_ticket_links',1),('new_identity_rows',1),('read_only','off'),('global_product_bindings',1)]:
            state=valid_permissions();state[field]=value
            with self.subTest(field=field),self.assertRaises(m.C.ConnectionError): m.check_permissions(state)

    def test_rpc_read_has_server_enforced_readonly_wrapper_and_cli_confirmation(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(m.C,'cli_run',return_value='[{"checks":{"ok":true}}]') as cli:
            run=Path(folder)
            m.read_api(run,'probe',"SELECT jsonb_build_object('ok',true) AS checks;",{})
            sql=(run/'probe.sql').read_text()
            self.assertTrue(sql.startswith('BEGIN READ ONLY;\n'))
            self.assertTrue(sql.endswith('ROLLBACK;\n'))
            self.assertIn('--yes',cli.call_args.args[0])
            self.assertIn('--remote=xsxdpaiivklqeudgqoqf',cli.call_args.args[0])


if __name__=='__main__': unittest.main()
