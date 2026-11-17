#!/usr/bin/env python3
"""Build a reviewable compensation bundle OFFLINE. Never connects to a database.

Snapshots must be captured by the same operator/database before and after each
unchanged migration. Output is destructive SQL and requires separate approval.
"""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
RECOVERY = ROOT / 'supabase/recovery'
TABLES = ['users', 'requests', 'projects', 'project_flows', 'checklist_templates',
          'checklist_items', 'comments', 'activity_logs', 'notifications']
PRIVATE = ['number_counters', 'request_access', 'rpc_calls', 'security_events']


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def manifest():
    approved = json.loads((ROOT / 'docs/validation/fase-2b2-migrations.json').read_text())['migrations']
    for item in approved:
        if hashlib.sha256((ROOT / 'supabase/migrations' / item['file']).read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Original migration hash changed')
    return approved


def history(snapshot):
    value = snapshot['history']
    if value is None:
        raise ValueError('Initialize/inspect CLI ledger BEFORE the baseline; missing ledger')
    rows = ET.fromstring('<history>' + value + '</history>')
    return {row.findtext('version'): {e.tag: e.text for e in row} for row in rows}


def validate_baseline(snapshot):
    scope = json.loads((RECOVERY / 'scope.json').read_text())
    if snapshot.get('format') != 'procont-recovery-v1' or history(snapshot):
        raise ValueError('Expected a complete baseline with empty CLI history')
    ledger = 'supabase_migrations.schema_migrations'
    expected_columns = {'version': 'text', 'name': 'text', 'statements': 'text[]'}
    if snapshot['relations'].get(ledger, {}).get('kind') != 'r' or any(
            snapshot['columns'].get(ledger + '.' + key, {}).get('type') != value
            for key, value in expected_columns.items()):
        raise ValueError('Unexpected CLI ledger table/column shape')
    if not snapshot['columns'][ledger + '.version']['notnull'] or not any(
            key.startswith(ledger + '.') and value['definition'] == 'PRIMARY KEY (version)'
            for key, value in snapshot['constraints'].items()):
        raise ValueError('CLI ledger requires a non-null primary key on version')
    if snapshot['row_counts'].get('auth.users') != 0:
        raise ValueError('Initial installation requires no Auth accounts')
    for step in scope.values():
        for category, keys in step['added'].items():
            if set(keys) & set(snapshot[category]):
                raise ValueError(f'Initial object collision in {category}')
    # Migration 3 revokes by proname, including overloads. Reject ALL matching names.
    public_names = {key.split('(')[0] for key in scope['3']['added']['functions'] if key.startswith('public.')}
    if any(key.split('(')[0] in public_names for key in snapshot['functions']):
        raise ValueError('Preexisting public RPC name/overload would be affected')
    pub = snapshot['publications'].get('supabase_realtime')
    if pub is None or any(item['all'] for item in snapshot['publications'].values()):
        raise ValueError('Require an existing non-ALL-TABLES supabase_realtime publication')
    if snapshot['publication_schemas']:
        raise ValueError('Schema-wide publications require a separate review')
    if int(snapshot['server_version_num']) < 150000:
        raise ValueError('Inventory requires PostgreSQL 15 or later')


def validate_transition(before, after, stage, scope):
    """Only names/fields attributable to this exact migration may differ."""
    allowed = scope[str(stage)]
    if before.keys() != after.keys():
        raise ValueError('Inventory format changed')
    for category in before:
        left, right = before[category], after[category]
        if category in ('row_counts', 'templates_checksum', 'history'):
            continue
        if isinstance(left, dict):
            additions = sorted(set(right) - set(left))
            if additions != allowed.get('added', {}).get(category, []):
                raise ValueError(f'Stage {stage}: unexpected/missing {category} objects')
            if set(left) - set(right):
                raise ValueError(f'Stage {stage}: preexisting {category} object removed')
            for key in set(left) & set(right):
                if left[key] == right[key]:
                    continue
                if left[key].keys() != right[key].keys():
                    raise ValueError('Inventory object format changed')
                fields = {field for field in left[key] if left[key][field] != right[key].get(field)}
                permitted = set(allowed.get('changed', {}).get(category, {}).get(key, []))
                if not fields or not fields <= permitted:
                    raise ValueError(f'Stage {stage}: unrelated change to {category}:{key}')
        elif left != right:
            raise ValueError(f'Stage {stage}: identity/server/operator changed: {category}')
    # Business data never belongs in a pristine installation rollback.
    for snap in (before, after):
        for table, count in snap['row_counts'].items():
            if table == 'public.checklist_templates':
                if count not in (0, 35):
                    raise ValueError('Unexpected template count')
            elif count != 0:
                raise ValueError('Recovery refused: Auth/business data exists')
    if stage not in (1, 4) and before['templates_checksum'] != after['templates_checksum']:
        raise ValueError('Templates changed outside migration 4')
    if stage == 4 and (before['row_counts'].get('public.checklist_templates') != 0 or
                       after['row_counts'].get('public.checklist_templates') != 35):
        raise ValueError('Migration 4 must insert exactly 35 reference templates')
    old, new = history(before), history(after)
    version = manifest()[stage - 1]['file'].split('_')[0]
    # Account for a connection/history failure AFTER the SQL COMMIT.
    if any(new.get(key) != value for key, value in old.items()) or set(new) - set(old) not in (set(), {version}):
        raise ValueError('Unexpected ledger change')


def restore_acl(category, key, before, after):
    if before['acl'] == after['acl']:
        return ''
    if category == 'schemas':
        target = 'SCHEMA ' + ident(key)
    elif category == 'functions':
        target = 'FUNCTION ' + key  # catalog-formatted qualified signature
    elif category == 'relations':
        target = 'TABLE ' + key
    else:
        relation, column = key.rsplit('.', 1)  # only fixed application names allowed by scope
        target = 'TABLE ' + relation
    owner = before.get('owner')
    if owner is None:
        owner = before['_owner']
    if any(g['grantor'] != owner for g in before['acl'] + after['acl']):
        raise ValueError('Multiple/non-owner grantors require a separate reviewed ACL restoration')
    statements = []
    for grantee in sorted({g['grantee'] for g in after['acl']}):
        who = 'PUBLIC' if grantee == 'PUBLIC' else ident(grantee)
        privilege = 'ALL PRIVILEGES' + (' (' + column + ')' if category == 'columns' else '')
        statements.append(f'REVOKE {privilege} ON {target} FROM {who} RESTRICT;')
    for grant in before['acl']:
        who = 'PUBLIC' if grant['grantee'] == 'PUBLIC' else ident(grant['grantee'])
        privilege = grant['privilege'] + (' (' + column + ')' if category == 'columns' else '')
        suffix = ' WITH GRANT OPTION' if grant['grantable'] else ''
        statements.append(f'GRANT {privilege} ON {target} TO {who}{suffix};')
    return '\n'.join(statements) + '\n'


def assertion(snapshot, label):
    query = (RECOVERY / 'inventory.sql').read_text().rstrip().rstrip(';')
    expected = literal(json.dumps(snapshot, ensure_ascii=False)) + '::jsonb'
    return f"""DO $procont_guard$
DECLARE actual jsonb;
BEGIN
  SELECT inventory INTO actual FROM ({query}) AS q(inventory);
  IF actual IS DISTINCT FROM {expected} THEN
    RAISE EXCEPTION '{label}: inventory mismatch; transaction must be rolled back';
  END IF;
END $procont_guard$;
"""


def build(snapshots):
    approved = manifest()
    scope = json.loads((RECOVERY / 'scope.json').read_text())
    if not 2 <= len(snapshots) <= 5:
        raise ValueError('Require baseline plus 1..4 consecutive snapshots')
    if history(snapshots[0]):
        raise ValueError('Baseline ledger must be empty')
    for stage in range(1, len(snapshots)):
        validate_transition(snapshots[stage - 1], snapshots[stage], stage, scope)
    validate_baseline(snapshots[0])
    output = ["-- DESTRUCTIVE: review and obtain specific approval before remote use.\n"
              "-- psql -X --set ON_ERROR_STOP=1; dedicated session, never transaction pooler.\n"
              "BEGIN;\nSET LOCAL standard_conforming_strings = on;\nSET LOCAL search_path = pg_catalog, public;\n"
              "SET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n"
              "SELECT pg_advisory_xact_lock(743921003);\n"
              "CREATE TEMP TABLE procont_recovery_guard(stage integer) ON COMMIT DROP;\n"
              "LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;\n"
              "LOCK TABLE supabase_migrations.schema_migrations IN ACCESS EXCLUSIVE MODE;\n"]
    all_tables = ['public.' + t for t in TABLES] + ['app_private.' + t for t in PRIVATE]
    output.append('LOCK TABLE ' + ', '.join(all_tables) + ' IN ACCESS EXCLUSIVE MODE;\n')
    output.append(assertion(snapshots[-1], 'Before compensation'))
    for stage in range(len(snapshots) - 1, 0, -1):
        before, after = snapshots[stage - 1], snapshots[stage]
        output.append(f'INSERT INTO pg_temp.procont_recovery_guard VALUES ({stage});\n')
        output.append((RECOVERY / f'compensate_{stage:02}.sql').read_text())
        for category in ('schemas', 'relations', 'columns', 'functions'):
            for key in sorted(set(before[category]) & set(after[category])):
                a, b = before[category][key], after[category][key]
                if category == 'columns':
                    owner = before['relations'][key.rsplit('.', 1)[0]]['owner']
                    a, b = dict(a, _owner=owner), dict(b, _owner=owner)
                output.append(restore_acl(category, key, a, b))
        version = approved[stage - 1]['file'].split('_')[0]
        # This row is part of the exact snapshot already checked. Preserve ledger table/schema.
        if version in history(after) and version not in history(before):
            output.append(f'DELETE FROM supabase_migrations.schema_migrations WHERE version={literal(version)};\n')
        output.append(assertion(before, f'After compensation {stage}'))
    output.append("NOTIFY pgrst, 'reload schema';\nCOMMIT;\n")
    return '\n'.join(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-baseline', type=Path, help='Only validate an inventory offline')
    parser.add_argument('--snapshots', type=Path, help='Directory with 0.json .. K.json')
    parser.add_argument('--through', type=int, choices=range(1, 5))
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.check_baseline:
        manifest()
        validate_baseline(json.loads(args.check_baseline.read_text()))
        print('Baseline accepted offline; this does not authorize application')
        return
    if not (args.snapshots and args.through and args.output):
        parser.error('Supply --check-baseline OR --snapshots, --through and --output')
    snapshots = [json.loads((args.snapshots / f'{n}.json').read_text()) for n in range(args.through + 1)]
    result = build(snapshots)
    # Remote inventories contain sensitive metadata. Never overwrite an approved bundle.
    with open(args.output, 'x', opener=lambda path, flags: __import__('os').open(path, flags, 0o600)) as handle:
        handle.write(result)
    print('Offline compensation bundle created; no database connection made')


if __name__ == '__main__':
    main()
