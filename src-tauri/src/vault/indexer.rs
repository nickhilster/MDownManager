use anyhow::Result;
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::path::Path;
use uuid::Uuid;

use crate::db::queries;
use crate::vault::types::FileRecord;
use rusqlite::Connection;

pub fn index_file(conn: &Connection, vault_id: &str, path: &Path) -> Result<FileRecord> {
    let content = std::fs::read_to_string(path)?;
    let meta = std::fs::metadata(path)?;

    let content_hash = {
        let mut h = Sha256::new();
        h.update(content.as_bytes());
        hex::encode(h.finalize())
    };

    let line_count = content.lines().count() as i64;
    let size_bytes = meta.len() as i64;

    let title = extract_title(&content)
        .or_else(|| path.file_stem().map(|s| s.to_string_lossy().to_string()));

    let frontmatter = extract_frontmatter(&content);

    let now = Utc::now().to_rfc3339();

    let existing_id = conn
        .query_row(
            "SELECT id, created_at FROM files WHERE path = ?1",
            rusqlite::params![path.to_string_lossy().as_ref()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .ok();

    let (id, created_at) = existing_id.unwrap_or_else(|| (Uuid::new_v4().to_string(), now.clone()));

    let record = FileRecord {
        id: id.clone(),
        vault_id: vault_id.to_string(),
        path: path.to_string_lossy().to_string(),
        title,
        content_hash: content_hash.clone(),
        frontmatter,
        size_bytes,
        line_count,
        created_at,
        modified_at: now.clone(),
        last_scanned_at: None,
        risk_level: None,
        category_id: None,
        category_source: None,
        embedding_ref: None,
        tags: None,
        summary: None,
        summary_model: None,
        scan_findings: None,
    };

    queries::upsert_file(conn, &record)?;

    // Save snapshot (content-hash deduplication — only stores new content)
    let snap_id = Uuid::new_v4().to_string();
    queries::save_snapshot(conn, &snap_id, &id, &content_hash, &content, &now)?;

    Ok(record)
}

pub fn index_vault(conn: &Connection, vault_id: &str, vault_path: &Path) -> Result<Vec<FileRecord>> {
    let mut results = Vec::new();
    for entry in walkdir(vault_path)? {
        match index_file(conn, vault_id, &entry) {
            Ok(r) => results.push(r),
            Err(e) => log::warn!("Failed to index {:?}: {e}", entry),
        }
    }
    Ok(results)
}

pub fn walkdir(root: &Path) -> Result<Vec<std::path::PathBuf>> {
    let mut paths = Vec::new();
    walk_recursive(root, &mut paths);
    Ok(paths)
}

fn walk_recursive(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // Skip hidden dirs
            if path.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(false) {
                continue;
            }
            walk_recursive(&path, out);
        } else if path.extension().map(|e| e == "md").unwrap_or(false) {
            out.push(path);
        }
    }
}

fn extract_title(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(title) = trimmed.strip_prefix("# ") {
            return Some(title.to_string());
        }
        // Stop looking after first non-empty, non-frontmatter line
        if !trimmed.is_empty() && !trimmed.starts_with("---") {
            break;
        }
    }
    None
}

fn extract_frontmatter(content: &str) -> Option<String> {
    let mut lines = content.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    let mut fm = String::new();
    for line in lines {
        if line.trim() == "---" {
            return Some(fm);
        }
        fm.push_str(line);
        fm.push('\n');
    }
    None
}
