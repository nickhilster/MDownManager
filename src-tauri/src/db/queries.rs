use anyhow::Result;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::vault::types::{FileRecord, VaultRecord};

// ── Helpers ──────────────────────────────────────────────────────────────────

fn row_to_file(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileRecord> {
    Ok(FileRecord {
        id: row.get(0)?,
        vault_id: row.get(1)?,
        path: row.get(2)?,
        title: row.get(3)?,
        content_hash: row.get(4)?,
        frontmatter: row.get(5)?,
        size_bytes: row.get(6)?,
        line_count: row.get(7)?,
        created_at: row.get(8)?,
        modified_at: row.get(9)?,
        last_scanned_at: row.get(10)?,
        risk_level: row.get(11)?,
        category_id: row.get(12)?,
        category_source: row.get(13)?,
        embedding_ref: row.get(14)?,
        tags: row.get(15)?,
        summary: row.get(16)?,
        summary_model: row.get(17)?,
        scan_findings: row.get(18)?,
    })
}

const FILE_COLS: &str =
    "id, vault_id, path, title, content_hash, frontmatter, \
     size_bytes, line_count, created_at, modified_at, \
     last_scanned_at, risk_level, category_id, category_source, \
     embedding_ref, tags, summary, summary_model, scan_findings";

const FILE_COLS_F: &str =
    "f.id, f.vault_id, f.path, f.title, f.content_hash, f.frontmatter, \
     f.size_bytes, f.line_count, f.created_at, f.modified_at, \
     f.last_scanned_at, f.risk_level, f.category_id, f.category_source, \
     f.embedding_ref, f.tags, f.summary, f.summary_model, f.scan_findings";

// ── Vault queries ─────────────────────────────────────────────────────────────

pub fn upsert_vault(conn: &Connection, vault: &VaultRecord) -> Result<()> {
    conn.execute(
        "INSERT INTO vaults (id, name, path, created_at, git_root)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(path) DO UPDATE SET name=excluded.name, git_root=excluded.git_root",
        params![vault.id, vault.name, vault.path, vault.created_at, vault.git_root],
    )?;
    Ok(())
}

pub fn list_vaults(conn: &Connection) -> Result<Vec<VaultRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, path, created_at, git_root FROM vaults ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(VaultRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            created_at: row.get(3)?,
            git_root: row.get(4)?,
        })
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
}

// ── File queries ──────────────────────────────────────────────────────────────

pub fn upsert_file(conn: &Connection, f: &FileRecord) -> Result<()> {
    conn.execute(
        "INSERT INTO files (
            id, vault_id, path, title, content_hash, frontmatter,
            size_bytes, line_count, created_at, modified_at,
            last_scanned_at, risk_level, category_id, category_source,
            embedding_ref, tags
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
         ON CONFLICT(path) DO UPDATE SET
            title=excluded.title,
            content_hash=excluded.content_hash,
            frontmatter=excluded.frontmatter,
            size_bytes=excluded.size_bytes,
            line_count=excluded.line_count,
            modified_at=excluded.modified_at,
            last_scanned_at=excluded.last_scanned_at,
            risk_level=excluded.risk_level,
            embedding_ref=excluded.embedding_ref,
            tags=excluded.tags",
        // summary and summary_model intentionally excluded — never overwritten on re-index
        params![
            f.id, f.vault_id, f.path, f.title, f.content_hash,
            f.frontmatter, f.size_bytes, f.line_count, f.created_at,
            f.modified_at, f.last_scanned_at, f.risk_level,
            f.category_id, f.category_source, f.embedding_ref, f.tags
        ],
    )?;
    Ok(())
}

pub fn list_files(conn: &Connection, vault_id: &str) -> Result<Vec<FileRecord>> {
    let sql = format!(
        "SELECT {FILE_COLS} FROM files WHERE vault_id = ?1 ORDER BY modified_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![vault_id], row_to_file)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
}

pub fn list_files_without_summary(conn: &Connection, vault_id: &str) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, path FROM files
         WHERE vault_id = ?1 AND (summary IS NULL OR summary = '')
         ORDER BY modified_at DESC",
    )?;
    let rows = stmt.query_map(params![vault_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
}

pub fn get_file_path(conn: &Connection, file_id: &str) -> Result<String> {
    let path: String = conn.query_row(
        "SELECT path FROM files WHERE id = ?1",
        params![file_id],
        |row| row.get(0),
    )?;
    Ok(path)
}

pub fn update_file_summary(conn: &Connection, file_id: &str, summary: &str, model: &str) -> Result<()> {
    conn.execute(
        "UPDATE files SET summary = ?1, summary_model = ?2 WHERE id = ?3",
        params![summary, model, file_id],
    )?;
    Ok(())
}

pub fn update_file_scan(
    conn: &Connection,
    file_id: &str,
    risk_level: &str,
    findings_json: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE files SET risk_level = ?1, scan_findings = ?2, last_scanned_at = datetime('now') WHERE id = ?3",
        params![risk_level, findings_json, file_id],
    )?;
    Ok(())
}

pub fn list_files_without_scan(conn: &Connection, vault_id: &str) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, path FROM files WHERE vault_id = ?1 AND last_scanned_at IS NULL ORDER BY path",
    )?;
    let rows = stmt.query_map(params![vault_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn delete_file_by_path(conn: &Connection, path: &str) -> Result<()> {
    conn.execute("DELETE FROM files WHERE path = ?1", params![path])?;
    Ok(())
}

pub fn search_files(conn: &Connection, vault_id: &str, query: &str) -> Result<Vec<FileRecord>> {
    let sql = format!(
        "SELECT {FILE_COLS_F} FROM files f
         JOIN files_fts fts ON f.rowid = fts.rowid
         WHERE fts MATCH ?1 AND f.vault_id = ?2
         ORDER BY rank"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![query, vault_id], row_to_file)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

pub fn save_snapshot(
    conn: &Connection,
    id: &str,
    file_id: &str,
    content_hash: &str,
    content: &str,
    created_at: &str,
) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO snapshots (id, file_id, content_hash, content, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, file_id, content_hash, content, created_at],
    )?;
    Ok(())
}

pub fn list_snapshots(conn: &Connection, file_id: &str) -> Result<Vec<(String, String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, content_hash, created_at FROM snapshots
         WHERE file_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![file_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
}

pub fn get_snapshot_content(conn: &Connection, snapshot_id: &str) -> Result<String> {
    let content: String = conn.query_row(
        "SELECT content FROM snapshots WHERE id = ?1",
        params![snapshot_id],
        |row| row.get(0),
    )?;
    Ok(content)
}

// ── Settings ──────────────────────────────────────────────────────────────────

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    match conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    ) {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_or_create_api_key(conn: &Connection) -> Result<String> {
    if let Some(key) = get_setting(conn, "api_key")? {
        return Ok(key);
    }
    let key = format!("mdown_{}", Uuid::new_v4().to_string().replace('-', ""));
    set_setting(conn, "api_key", &key)?;
    Ok(key)
}

// ── Scanner rules ─────────────────────────────────────────────────────────────

use crate::scanner::DbRule;

pub fn count_rules(conn: &Connection) -> Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM scanner_rules", [], |r| r.get(0))
        .map_err(Into::into)
}

pub fn list_all_rules(conn: &Connection) -> Result<Vec<DbRule>> {
    let mut stmt = conn.prepare(
        "SELECT id, description, severity, pattern, tags, source, enabled, updated_at
         FROM scanner_rules ORDER BY severity DESC, id ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DbRule {
            id: row.get(0)?,
            description: row.get(1)?,
            severity: row.get(2)?,
            pattern: row.get(3)?,
            tags: row.get(4)?,
            source: row.get(5)?,
            enabled: row.get::<_, i64>(6)? != 0,
            updated_at: row.get(7)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn list_enabled_rules(conn: &Connection) -> Result<Vec<DbRule>> {
    let mut stmt = conn.prepare(
        "SELECT id, description, severity, pattern, tags, source, enabled, updated_at
         FROM scanner_rules WHERE enabled = 1 ORDER BY severity DESC, id ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DbRule {
            id: row.get(0)?,
            description: row.get(1)?,
            severity: row.get(2)?,
            pattern: row.get(3)?,
            tags: row.get(4)?,
            source: row.get(5)?,
            enabled: row.get::<_, i64>(6)? != 0,
            updated_at: row.get(7)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn upsert_rule(conn: &Connection, rule: &DbRule) -> Result<bool> {
    let existing: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM scanner_rules WHERE id = ?1",
            params![rule.id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO scanner_rules (id, description, severity, pattern, tags, source, enabled, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
             description = excluded.description,
             severity    = excluded.severity,
             pattern     = excluded.pattern,
             tags        = excluded.tags,
             source      = excluded.source,
             updated_at  = excluded.updated_at",
        params![
            rule.id, rule.description, rule.severity, rule.pattern,
            rule.tags, rule.source, rule.enabled as i64, rule.updated_at
        ],
    )?;
    Ok(existing == 0) // true = new rule
}

pub fn toggle_rule(conn: &Connection, rule_id: &str, enabled: bool) -> Result<()> {
    conn.execute(
        "UPDATE scanner_rules SET enabled = ?1 WHERE id = ?2",
        params![enabled as i64, rule_id],
    )?;
    Ok(())
}

pub fn seed_rules_if_empty(conn: &Connection, rules: Vec<DbRule>) -> Result<()> {
    if count_rules(conn)? > 0 {
        return Ok(());
    }
    for rule in rules {
        upsert_rule(conn, &rule)?;
    }
    Ok(())
}
