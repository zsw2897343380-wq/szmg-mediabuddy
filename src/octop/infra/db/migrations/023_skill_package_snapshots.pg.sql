-- Schema v23: keep complete skill packages in the database; disk is a cache.
CREATE TABLE IF NOT EXISTS skill_package_snapshots (
    skill_package_id TEXT PRIMARY KEY
        REFERENCES skill_packages(skill_package_id) ON DELETE CASCADE,
    archive BYTEA NOT NULL,
    sha256 TEXT NOT NULL
);

UPDATE _schema_version SET version = 23;
