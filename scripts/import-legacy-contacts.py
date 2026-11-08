#!/usr/bin/env python3
"""Import explicitly identified WordPress account contacts without subscribing them."""

import argparse
import collections
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parent.parent
PRIVATE_DIR = ROOT / '.wordpress-import' / 'legacy-db'
MAX_BYTES = 200 * 1024 * 1024
SOURCE_SYSTEM = 'latroisiemevague-wordpress'


def read_backup(path):
    with path.open('rb') as handle:
        raw = handle.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('Input exceeds the 200 MiB limit')
    if raw.startswith(b'\x1f\x8b'):
        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as handle:
            raw = handle.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('Decompressed input exceeds the 200 MiB limit')
    if raw[257:262] == b'ustar':
        with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as archive:
            candidates = [entry for entry in archive.getmembers()
                          if entry.isfile() and entry.name.lower().endswith('.sql')]
            if len(candidates) != 1:
                raise ValueError('Archive must contain exactly one regular SQL file')
            entry = candidates[0]
            if entry.size > MAX_BYTES:
                raise ValueError('SQL file exceeds the 200 MiB limit')
            # Read the member directly; no archive paths are extracted or executed.
            with archive.extractfile(entry) as handle:
                raw = handle.read(MAX_BYTES + 1)
    return raw.decode('utf-8-sig'), hashlib.sha256(raw).hexdigest()


def statements(sql):
    """Split MySQL statements, respecting strings, identifiers, and comments."""
    start = None
    index = 0
    size = len(sql)
    while index < size:
        char = sql[index]
        if char.isspace():
            index += 1
            continue
        if char == '#' or (sql.startswith('--', index)
                           and (index + 2 == size or sql[index + 2].isspace())):
            end = sql.find('\n', index)
            index = size if end < 0 else end + 1
            continue
        if sql.startswith('/*', index):
            end = sql.find('*/', index + 2)
            if end < 0:
                raise ValueError('Unterminated SQL comment')
            index = end + 2
            continue
        if start is None:
            start = index
        if char in ("'", '"', '`'):
            quote = char
            index += 1
            while index < size:
                if sql[index] == '\\':
                    index += 2
                elif sql[index] == quote:
                    index += 1
                    if index < size and sql[index] == quote:
                        index += 1
                    else:
                        break
                else:
                    index += 1
            else:
                raise ValueError('Unterminated SQL string or identifier')
            continue
        if char == ';':
            yield sql[start:index]
            start = None
        index += 1
    if start is not None:
        raise ValueError('SQL ends without a statement terminator')


def values(statement, offset):
    """Decode literal INSERT tuples only; never evaluate SQL expressions."""
    index = offset
    size = len(statement)
    escapes = {'0': '\0', 'n': '\n', 'r': '\r', 't': '\t', 'b': '\b', 'Z': '\x1a'}
    while index < size:
        while index < size and statement[index] in ' ,\r\n\t':
            index += 1
        if index == size:
            return
        if statement[index] != '(':
            raise ValueError('Expected an INSERT tuple')
        index += 1
        row = []
        while True:
            while index < size and statement[index].isspace():
                index += 1
            if index >= size:
                raise ValueError('Unterminated INSERT tuple')
            if statement[index] == "'":
                index += 1
                result = []
                while index < size:
                    char = statement[index]
                    index += 1
                    if char == '\\':
                        if index >= size:
                            raise ValueError('Unterminated INSERT escape')
                        char = statement[index]
                        index += 1
                        result.append(escapes.get(char, char))
                    elif char == "'":
                        if index < size and statement[index] == "'":
                            result.append("'")
                            index += 1
                        else:
                            break
                    else:
                        result.append(char)
                else:
                    raise ValueError('Unterminated INSERT string')
                row.append(''.join(result))
            else:
                end = index
                while end < size and statement[end] not in ',)':
                    end += 1
                token = statement[index:end].strip()
                if token != 'NULL' and not re.fullmatch(r'-?\d+(?:\.\d+)?', token):
                    raise ValueError('Nonliteral INSERT value is unsupported')
                row.append(None if token == 'NULL' else token)
                index = end
            while index < size and statement[index].isspace():
                index += 1
            if index >= size or statement[index] not in ',)':
                raise ValueError('Invalid INSERT separator')
            char = statement[index]
            index += 1
            if char == ')':
                break
        yield row


def collect(sql, prefix):
    schemas = {}
    users = []
    roles = {}
    counts = collections.Counter()
    post_types = collections.Counter()
    comment_statuses = collections.Counter()
    selected = {prefix + suffix for suffix in (
        'users', 'usermeta', 'comments', 'posts', 'mailerlite_forms', 'wpmailsmtp_debug_events')}
    for statement in statements(sql):
        create = re.match(r'CREATE TABLE `([^`]+)`\s*\(', statement)
        if create:
            schemas[create[1]] = re.findall(r'^\s*`([^`]+)`\s', statement, re.M)
            continue
        insert = re.match(r'INSERT INTO `([^`]+)`(?:\s*\(([^)]+)\))?\s+VALUES\s*', statement)
        if not insert or insert[1] not in selected:
            continue
        table = insert[1]
        columns = re.findall(r'`([^`]+)`', insert[2]) if insert[2] else schemas.get(table)
        if not columns:
            raise ValueError('INSERT has no known column schema')
        for row in values(statement, insert.end()):
            if len(row) != len(columns):
                raise ValueError('INSERT column count differs from schema')
            record = dict(zip(columns, row))
            counts[table] += 1
            if table == prefix + 'users':
                # Deliberate allowlist: never retain password hashes, keys, or logins.
                users.append({field: record[field] for field in (
                    'ID', 'user_email', 'display_name', 'user_registered')})
            elif table == prefix + 'usermeta' and record['meta_key'] == prefix + 'capabilities':
                # Roles are scalar PHP strings followed by true; no unserialization.
                roles[record['user_id']] = sorted(set(re.findall(
                    r's:\d+:"([a-zA-Z0-9_-]+)";b:1;', record['meta_value'] or '')))
            elif table == prefix + 'posts':
                post_types[record['post_type']] += 1
            elif table == prefix + 'comments':
                comment_statuses[record['comment_approved']] += 1
    contacts = []
    invalid = 0
    for user in users:
        email = (user['user_email'] or '').strip().lower()
        if len(email) > 254 or not re.fullmatch(r'[^\s@\x00-\x1f]+@[^\s@\x00-\x1f]+\.[^\s@\x00-\x1f]+', email):
            invalid += 1
            continue
        contacts.append({
            'source_record_id': user['ID'], 'email': email,
            'display_name': user['display_name'] or '',
            'source_created_at': user['user_registered'],
            'roles': roles.get(user['ID'], []),
        })
    report = {
        'source_tables': dict(counts), 'post_types': dict(post_types),
        'comment_statuses': dict(comment_statuses),
        'eligible_account_sources': len(contacts),
        'unique_emails': len({contact['email'] for contact in contacts}),
        'invalid_account_emails_skipped': invalid,
        'account_roles': dict(collections.Counter(role for contact in contacts for role in contact['roles'])),
        'newsletter_opt_ins_imported': 0,
    }
    return contacts, report


def literal(value):
    if value is None:
        return 'NULL'
    if '\0' in value:
        raise ValueError('NUL characters are unsupported in imported contact fields')
    return "'" + value.replace("'", "''") + "'"


def import_sql(contacts, prefix, digest):
    output = ['-- Generated private import; do not commit or publish.']
    for contact in contacts:
        email = literal(contact['email'])
        identity = ' AND '.join(f'{column} = {literal(value)}' for column, value in (
            ('source_system', SOURCE_SYSTEM), ('source_table', prefix + 'users'),
            ('source_record_id', contact['source_record_id'])))
        output.append(f'INSERT INTO legacy_contacts (email) SELECT {email} '
                      f'WHERE NOT EXISTS (SELECT 1 FROM legacy_contact_sources WHERE {identity}) '
                      'ON CONFLICT(email) DO NOTHING;')
        fields = [SOURCE_SYSTEM, prefix + 'users', contact['source_record_id'], contact['email'],
                  'wordpress_account', contact['display_name'], contact['source_created_at'],
                  json.dumps(contact['roles']), 'unknown', digest]
        output.append('INSERT INTO legacy_contact_sources '
                      '(source_system, source_table, source_record_id, email, source_kind, display_name, '
                      'source_created_at, roles_json, consent_status, backup_sha256) VALUES ('
                      + ', '.join(map(literal, fields))
                      + ') ON CONFLICT(source_system, source_table, source_record_id) DO NOTHING;')
    return '\n'.join(output) + '\n'


def verify_locally(payload, expected):
    with sqlite3.connect(':memory:') as database:
        database.execute('PRAGMA foreign_keys = ON')
        database.executescript((ROOT / 'migrations/0002_legacy_contacts.sql').read_text())
        for _ in range(2):
            database.executescript(payload)
            totals = database.execute('SELECT (SELECT COUNT(*) FROM legacy_contacts), '
                                      '(SELECT COUNT(*) FROM legacy_contact_sources)').fetchone()
            assert totals == expected, 'Local import count or repeat-run mismatch'
        assert database.execute('PRAGMA foreign_key_check').fetchall() == []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True, help='MySQL .sql, .sql.gz or single-SQL .tar.gz backup')
    parser.add_argument('--table-prefix', default='wp_')
    parser.add_argument('--apply', action='store_true', help='Apply migrations and import into the configured remote D1 DB')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_]+', args.table_prefix):
        raise ValueError('Invalid table prefix')
    sql, digest = read_backup(args.input)
    contacts, report = collect(sql, args.table_prefix)
    if not contacts:
        raise ValueError('No valid WordPress account contacts found; nothing imported')
    payload = import_sql(contacts, args.table_prefix, digest)
    verify_locally(payload, (report['unique_emails'], report['eligible_account_sources']))
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    output = PRIVATE_DIR / 'legacy-contacts.sql'
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        handle.write(payload)
    output.chmod(0o600)
    report['backup_sql_sha256'] = digest
    report['local_repeat_import_verified'] = True
    print(json.dumps(report, indent=2), flush=True)
    if args.apply:
        wrangler = ROOT / 'node_modules/.bin/wrangler'
        subprocess.run([str(wrangler), 'd1', 'migrations', 'apply', 'DB', '--remote'], cwd=ROOT, check=True)
        subprocess.run([str(wrangler), 'd1', 'execute', 'DB', '--remote', '--file', str(output)], cwd=ROOT, check=True)
        verification = (
            "SELECT source_kind, consent_status, COUNT(*) AS sources, COUNT(DISTINCT email) AS unique_emails "
            "FROM legacy_contact_sources GROUP BY source_kind, consent_status; "
            "SELECT COUNT(*) AS total_legacy_contacts FROM legacy_contacts; "
            "SELECT 'submissions' AS table_name, COUNT(*) AS total FROM submissions "
            "UNION ALL SELECT 'notifications', COUNT(*) FROM notifications;"
        )
        subprocess.run([str(wrangler), 'd1', 'execute', 'DB', '--remote', '--command', verification], cwd=ROOT, check=True)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, UnicodeError, tarfile.TarError, subprocess.CalledProcessError) as error:
        # Avoid printing data rows, SQL values, credentials, or raw backup content.
        print(f'Import failed: {type(error).__name__}', file=sys.stderr)
        sys.exit(1)
