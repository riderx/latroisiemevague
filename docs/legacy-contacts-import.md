# Historical WordPress contact import

The WordPress backup supplied on 2026-11-08 contains **five account email addresses**, all unique. They are archived in the Cloudflare D1 database `latroisiemevague`, in separate `legacy_contacts` and `legacy_contact_sources` tables.

No newsletter subscribers or saved contact messages were found. The five accounts comprise three administrators, one editor, and one WordPress subscriber. A WordPress **subscriber role is not newsletter consent**: all five imported source records have `consent_status = 'unknown'`.

## Backup audit

| Source | Finding | Imported |
| --- | --- | --- |
| `wp_users` | Five accounts with valid, unique email addresses | Five historical account contacts |
| `wp_usermeta` | Account roles | Roles attached to the corresponding source records |
| `wp_comments` | One spam trackback without an email address | None |
| `wp_mailerlite_forms` | Empty form-definition table | None |
| `wp_posts` | One Contact Form 7 form definition; six `customer` posts contain Elementor template content | None |
| `wp_postmeta` | Contact Form 7 form/mail configuration; no saved submissions | None |
| `wp_wpmailsmtp_debug_events` | 29 diagnostic entries without stored recipient addresses or message bodies | None |
| Options, security logs, page HTML, and other configuration | Not evidence of subscription or a submitted contact | None |

There are no dedicated newsletter subscriber or form-submission tables in this backup. Any subscriber list held by an external provider is outside this export.

SQL payload SHA-256: `2bffba7d894f91c97ef1c7a08b5d4fa7af026614ecf79e609ed172c796afc0f0`.

## Preserved data and boundaries

- Emails are trimmed and lowercased for deduplication.
- Each source retains the WordPress table and record ID, display name, registration timestamp as stored, account roles, backup checksum, and import timestamp.
- Password hashes, activation keys, sessions, usernames, IP addresses, and unrelated user metadata are excluded.
- The imported account records do not create live `submissions` or `notifications`, and no email is sent.
- The importer accepts only the reviewed WordPress account source. It does not collect arbitrary email-like strings from content or configuration.
- Historical source identities are immutable: repeating an import preserves the original record and does not duplicate it. Refreshing a previously imported account from a different backup requires a separate reviewed update.

## Run again

Python 3 and the repository's installed Wrangler CLI are required. The importer accepts a MySQL `.sql`, `.sql.gz`, or a `.tar.gz` containing exactly one regular SQL file. It reads archive members directly without extracting archive paths, executing PHP, or executing the original SQL.

Preview and generate the private import file:

```sh
python3 scripts/import-legacy-contacts.py --input /absolute/path/database.tar.gz
```

This prints aggregate counts, validates the generated import twice against an in-memory SQLite database, and writes `.wordpress-import/legacy-db/legacy-contacts.sql` with file mode `0600`. The directory is gitignored. Keep backups and generated SQL private; neither belongs in source control.

Apply the additive migration and import through the current Wrangler login:

```sh
python3 scripts/import-legacy-contacts.py --input /absolute/path/database.tar.gz --apply
```

The target is the `DB` binding in `wrangler.jsonc`. Use `--table-prefix PREFIX_` only for a reviewed backup with a different WordPress prefix. With `--apply`, Wrangler applies pending migrations, imports the generated SQL, and prints aggregate remote verification queries. Repeating the same command is safe: unique emails and `(source_system, source_table, source_record_id)` constraints prevent duplicates.

## Verification

The importer was checked with a synthetic fixture covering quoted names, escaped and multiline values, SQL-looking text inside a string, mixed-case duplicate emails, role extraction, password exclusion, foreign keys, and repeat imports.

The production import and a second application of the same backup were verified on 2026-11-08:

| Check | Result |
| --- | --- |
| Historical contacts | 5 |
| Historical source records | 5 |
| Sources with unknown consent | 5 |
| Newsletter opt-ins imported | 0 |
| Live submissions before / after | 1 / 1 |
| Live notifications before / after | 2 / 2 |
| Second import | No additional contacts or source records |
