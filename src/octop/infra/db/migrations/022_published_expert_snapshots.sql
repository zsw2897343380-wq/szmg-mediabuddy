-- Schema v22: keep published expert files in the database; disk is a cache.
CREATE TABLE IF NOT EXISTS published_expert_snapshots (
    published_expert_id TEXT PRIMARY KEY
        REFERENCES published_experts(published_expert_id) ON DELETE CASCADE,
    archive BLOB NOT NULL,
    sha256 TEXT NOT NULL
);

UPDATE _schema_version SET version = 22;
