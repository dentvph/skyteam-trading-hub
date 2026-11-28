-- Practice trades from the Smart Terminal are posted once each (idempotent retries).
CREATE TABLE journal_sync (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  ext_id TEXT NOT NULL,
  journal_id INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY (member_id, ext_id)
);
