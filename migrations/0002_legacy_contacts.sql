CREATE TABLE legacy_contacts (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  imported_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE legacy_contact_sources (
  source_system TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  email TEXT NOT NULL REFERENCES legacy_contacts(email),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('wordpress_account', 'contact', 'newsletter', 'comment')),
  display_name TEXT NOT NULL DEFAULT '',
  source_created_at TEXT,
  roles_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(roles_json)),
  consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown', 'subscribed', 'unsubscribed')),
  backup_sha256 TEXT NOT NULL,
  imported_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (source_system, source_table, source_record_id)
);

CREATE INDEX legacy_contact_sources_email ON legacy_contact_sources(email);
