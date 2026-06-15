use anyhow::Result;
use rusqlite::Connection;

pub fn run(conn: &Connection) -> Result<()> {
    // WAL mode enables concurrent reads from the API server while Tauri writes
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vaults (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            path        TEXT NOT NULL UNIQUE,
            created_at  TEXT NOT NULL,
            git_root    TEXT
        );

        CREATE TABLE IF NOT EXISTS files (
            id              TEXT PRIMARY KEY,
            vault_id        TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
            path            TEXT NOT NULL UNIQUE,
            title           TEXT,
            content_hash    TEXT NOT NULL,
            frontmatter     TEXT,
            size_bytes      INTEGER NOT NULL DEFAULT 0,
            line_count      INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL,
            modified_at     TEXT NOT NULL,
            last_scanned_at TEXT,
            risk_level      TEXT,
            category_id     TEXT,
            category_source TEXT CHECK(category_source IN ('ai', 'manual')),
            embedding_ref   TEXT,
            tags            TEXT
        );

        CREATE TABLE IF NOT EXISTS snapshots (
            id           TEXT PRIMARY KEY,
            file_id      TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            content_hash TEXT NOT NULL,
            content      TEXT NOT NULL,
            created_at   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
            id       TEXT PRIMARY KEY,
            name     TEXT NOT NULL,
            source   TEXT NOT NULL CHECK(source IN ('ai', 'manual')),
            vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
            title,
            content,
            content='files',
            content_rowid='rowid'
        );
        ",
    )?;

    // Versioned migrations — run each block exactly once
    let version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if version < 2 {
        conn.execute_batch(
            "ALTER TABLE files ADD COLUMN summary       TEXT;
             ALTER TABLE files ADD COLUMN summary_model TEXT;
             INSERT INTO schema_version (version) VALUES (2);",
        )?;
    }

    if version < 3 {
        conn.execute_batch(
            "ALTER TABLE files ADD COLUMN scan_findings TEXT;
             INSERT INTO schema_version (version) VALUES (3);",
        )?;
    }

    if version < 4 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS scanner_rules (
                id          TEXT PRIMARY KEY,
                description TEXT NOT NULL,
                severity    TEXT NOT NULL DEFAULT 'high',
                pattern     TEXT NOT NULL,
                tags        TEXT,
                source      TEXT NOT NULL DEFAULT 'builtin',
                enabled     INTEGER NOT NULL DEFAULT 1,
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
             );
             INSERT INTO schema_version (version) VALUES (4);",
        )?;
    }

    if version < 5 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS embeddings (
                file_id    TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
                model      TEXT NOT NULL,
                vector     BLOB NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
             );
             INSERT INTO schema_version (version) VALUES (5);",
        )?;
    }

    Ok(())
}
