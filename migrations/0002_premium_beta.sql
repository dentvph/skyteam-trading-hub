-- Premium Beta: up to 10 approved members get the SKY TEAM Smart Terminal (view-only).
ALTER TABLE members ADD COLUMN beta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN beta_at TEXT;
ALTER TABLE members ADD COLUMN beta_by TEXT;
