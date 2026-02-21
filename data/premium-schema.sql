-- Premium schema: version tracking for Dutch Law MCP
-- Applied on top of the standard database to enable premium tools.

CREATE TABLE IF NOT EXISTS provision_versions (
  id INTEGER PRIMARY KEY,
  provision_id INTEGER NOT NULL,
  body_text TEXT NOT NULL,
  effective_date TEXT,            -- when this version took effect legally
  superseded_date TEXT,           -- when next version replaced it (NULL = current)
  scraped_at TEXT NOT NULL,       -- when we captured this snapshot
  change_summary TEXT,            -- AI-generated plain-language summary of what changed
  diff_from_previous TEXT,        -- unified diff against prior version
  source_url TEXT,                -- link to wetten.overheid.nl amendment
  FOREIGN KEY (provision_id) REFERENCES legal_provisions(id)
);

CREATE INDEX IF NOT EXISTS idx_pv_provision ON provision_versions(provision_id);
CREATE INDEX IF NOT EXISTS idx_pv_effective ON provision_versions(effective_date);
