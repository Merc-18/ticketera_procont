#!/usr/bin/env python3
"""Validate an existing catalog export offline; never connect to Supabase.

Writes a private receipt, NOT a procont-recovery-v1 baseline. Does not print
source rows, interpret SQL, inspect credentials or overwrite existing evidence.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import sys

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.supabase-local' / 'recovery'
COLUMNS = {'metadata_row_number', 'total_metadata_rows', 'section',
           'schema_name', 'object_name', 'details'}
FIELDS = {
    '00_context': 'format base_commit captured_at server_version_num server_version major_version database database_oid current_user session_user transaction_read_only statement_is_catalog_select_only recovery_baseline_compatible object_scope omitted',
    '01_summary': 'result failed_checks pending_checks authorization_to_apply counts_are_catalog_metadata_not_business_rows',
    '02_checks': 'status satisfied purpose',
    '03_collisions': 'kind oid',
    '10_schemas': 'oid owner objects_detailed usage create owner_privileges_available relation_count routine_count type_count',
    '20_relations': 'oid kind owner rls force_rls replica_identity persistence partition owner_privileges_available select trigger',
    '21_columns': 'relation_oid number type type_oid not_null has_default_or_generation identity generated select references',
    '22_constraints': 'oid kind columns referenced_relation_oid referenced_columns validated deferrable initially_deferred',
    '23_indexes': 'oid table_oid unique primary valid ready keys partial has_expressions',
    '24_types': 'oid kind owner relation_oid base_type_oid element_type_oid usage',
    '25_routines': 'oid kind owner language_oid return_type returns_set security_definer volatility parallel execute',
    '26_other_schema_objects': 'oid kind owner',
    '30_policies': 'oid command permissive roles using_present with_check_present',
    '31_triggers': 'oid enabled internal type_bits function function_oid deferrable initially_deferred constraint_oid',
    '32_event_triggers': 'oid owner event enabled tags function',
    '33_rules': 'oid event_type enabled instead',
    '40_acl': 'category owner grantor grantee privilege grantable grant_available_to_current_role',
    '41_default_acl': 'oid global object_kind owner grantor grantee privilege grantable',
    '42_roles': 'oid superuser inherit create_role create_database login replication bypass_rls is_current_user privileges_available_without_set_role member',
    '43_role_memberships': 'member_oid role_oid grantor admin_option inherit_option set_option',
    '44_languages': 'oid owner trusted usage',
    '50_publications': 'oid owner all_tables insert update delete truncate via_partition_root owner_privileges_available',
    '51_publication_tables': 'publication table relation_oid membership_oid membership_mode row_and_column_filters_inspected automatic_memberships',
    '52_publication_schemas': 'publication_oid',
    '60_extensions': 'oid owner version relocatable',
    '61_extension_members': 'catalog object_oid subobject extension_oid',
}


class InventoryError(ValueError):
    """Safe messages written by this module, never excerpts of the input."""


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise InventoryError('Claves JSON duplicadas; conservar el original y revisar localmente.')
        result[key] = value
    return result


def load_json(value):
    return json.loads(value, object_pairs_hook=unique_object)


def parse_export(raw):
    content = raw.decode('utf-8-sig').strip()
    if content.startswith('['):
        rows = load_json(content)
    else:
        header = content.splitlines()[0] if content else ''
        delimiter = '\t' if '\t' in header else ','
        reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)
        if reader.fieldnames is None or len(reader.fieldnames) != len(COLUMNS) or set(reader.fieldnames) != COLUMNS:
            raise InventoryError('Formato no reconocido: se necesita el JSON, CSV o TSV original con seis columnas. No repetir SQL.')
        rows = list(reader)
    if not isinstance(rows, list) or not rows:
        raise InventoryError('La exportación no contiene una lista de filas de metadatos.')
    return rows


def validate_rows(rows):
    numbers, counts, contexts = set(), {}, []
    for row in rows:
        if not isinstance(row, dict) or set(row) != COLUMNS:
            raise InventoryError('Columnas inesperadas: no se acepta un volcado de registros.')
        # Export counters must be integer literals, not rounded/coerced numbers.
        number, total = row['metadata_row_number'], row['total_metadata_rows']
        if any(type(x) not in (int, str) or not str(x).isdigit() for x in (number, total)):
            raise InventoryError('Numeración de metadatos inválida.')
        number, total = int(number), int(total)
        if total != len(rows) or not 1 <= number <= total or number in numbers:
            raise InventoryError('Exportación incompleta, duplicada o truncada. No repetir SQL; recuperar el archivo original completo.')
        numbers.add(number)
        section = row['section']
        if not isinstance(section, str) or section not in FIELDS:
            raise InventoryError('Sección ajena al inventario de catálogos.')
        if any(value is not None and not isinstance(value, str)
               for value in (row['schema_name'], row['object_name'])):
            raise InventoryError('Identificadores de catálogo inválidos.')
        details = row['details']
        if isinstance(details, str):
            details = load_json(details)
        if not isinstance(details, dict) or not details or not set(details) <= set(FIELDS[section].split()):
            raise InventoryError('Campos de detalle inesperados; no importar contenido Auth ni credenciales.')
        counts[section] = counts.get(section, 0) + 1
        if section == '00_context':
            contexts.append(details)
    required = {'00_context', '01_summary', '02_checks', '10_schemas', '20_relations',
                '21_columns', '32_event_triggers', '40_acl', '42_roles', '50_publications'}
    if not required <= counts.keys() or len(contexts) != 1 or counts['01_summary'] != 1:
        raise InventoryError('Faltan secciones esenciales o existen contextos duplicados.')
    if contexts[0].get('format') != 'procont-catalog-preflight-v1' or contexts[0].get('base_commit') != '11b2c15':
        raise InventoryError('No corresponde al inventario histórico solicitado; no sustituirlo por una captura nueva.')
    return counts


def private_directory():
    for folder in (PRIVATE.parent, PRIVATE):
        if folder.is_symlink():
            raise InventoryError('El directorio privado no puede ser un enlace simbólico.')
        folder.mkdir(mode=0o700, exist_ok=True)
        info = folder.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise InventoryError('El directorio privado debe pertenecer al operador y tener modo 700.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    args = parser.parse_args()
    private_directory()
    source = args.source.absolute()
    if source.is_symlink() or source.resolve().parent != PRIVATE.resolve():
        raise InventoryError('Copiar primero el archivo al directorio privado .supabase-local/recovery/.')
    info = source.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise InventoryError('La fuente debe ser un archivo regular propio con modo 600.')
    raw = source.read_bytes()
    counts = validate_rows(parse_export(raw))
    receipt = {
        'format': 'procont-existing-catalog-receipt-v1',
        'prepared_from_commit': 'af3259f',
        'imported_at_utc': datetime.now(timezone.utc).isoformat(),
        'source_sha256': hashlib.sha256(raw).hexdigest(),
        'metadata_rows': sum(counts.values()), 'section_counts': counts,
        'validation_scope': 'structure, allowed detail keys and declared row-count completeness; not authenticity or a general secret scanner',
        'remote_sql_executed': False, 'remote_connection_verified': False,
        'recovery_baseline_compatible': False,
        'verdict': 'NO APTO',
        'pending': ['actual CLI connection identity', 'complete procont-recovery-v1 baseline'],
    }
    output = PRIVATE / 'catalog-evidence-receipt.json'
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        json.dump(receipt, stream, indent=2, ensure_ascii=False)
        stream.write('\n')
    print('Importación offline validada; recibo privado guardado. Baseline operativo pendiente: NO APTO.')


if __name__ == '__main__':
    try:
        main()
    except InventoryError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, csv.Error, RecursionError):
        # Never print parser errors: they can include snippets/paths from the input.
        print('No se importó evidencia: revisar formato, integridad, permisos y ausencia de recibo previo. Conservar el original; no repetir SQL.', file=sys.stderr)
        sys.exit(1)
