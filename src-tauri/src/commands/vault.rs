use anyhow::Result;
use chrono::Utc;
use rusqlite::params;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

use crate::db::queries;
use crate::git;
use crate::vault::{
    indexer,
    types::{FileRecord, Snapshot, VaultRecord},
};

pub struct DbState(pub Mutex<rusqlite::Connection>);

// ── Vault management ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn add_vault(path: String, name: String, state: State<DbState>) -> Result<VaultRecord, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let vault_path = Path::new(&path);
    let git_root = git::find_git_root(vault_path);

    // Reuse existing UUID so files already indexed stay linked to this vault
    let existing_id: Option<String> = match conn.query_row(
        "SELECT id FROM vaults WHERE path = ?1",
        params![&path],
        |row| row.get::<_, String>(0),
    ) {
        Ok(id) => Some(id),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(e) => return Err(e.to_string()),
    };

    let vault = VaultRecord {
        id: existing_id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        name,
        path: path.clone(),
        created_at: Utc::now().to_rfc3339(),
        git_root,
    };
    queries::upsert_vault(&conn, &vault).map_err(|e| e.to_string())?;

    // Index all .md files in the vault
    indexer::index_vault(&conn, &vault.id, vault_path).map_err(|e| e.to_string())?;

    Ok(vault)
}

#[tauri::command]
pub fn list_vaults(state: State<DbState>) -> Result<Vec<VaultRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::list_vaults(&conn).map_err(|e| e.to_string())
}

// ── File management ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_files(vault_id: String, state: State<DbState>) -> Result<Vec<FileRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::list_files(&conn, &vault_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_files(
    vault_id: String,
    query: String,
    state: State<DbState>,
) -> Result<Vec<FileRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::search_files(&conn, &vault_id, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_files(
    vault_id: String,
    paths: Vec<String>,
    state: State<DbState>,
) -> Result<Vec<FileRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for path in &paths {
        let p = Path::new(path);
        if p.is_dir() {
            let files = indexer::index_vault(&conn, &vault_id, p).map_err(|e| e.to_string())?;
            results.extend(files);
        } else if p.extension().map(|e| e == "md").unwrap_or(false) {
            let f = indexer::index_file(&conn, &vault_id, p).map_err(|e| e.to_string())?;
            results.push(f);
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn get_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_file_in_editor(path: String) -> Result<(), String> {
    open::that_detached(&path).map_err(|e| e.to_string())
}

// ── Snapshots ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_snapshots(
    file_id: String,
    state: State<DbState>,
) -> Result<Vec<Snapshot>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let rows = queries::list_snapshots(&conn, &file_id).map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|(id, content_hash, created_at)| Snapshot {
            id,
            content_hash,
            created_at,
        })
        .collect())
}

#[tauri::command]
pub fn get_snapshot_content(
    snapshot_id: String,
    state: State<DbState>,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::get_snapshot_content(&conn, &snapshot_id).map_err(|e| e.to_string())
}

// ── Remove ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn remove_vault(vault_id: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM vaults WHERE id = ?1", rusqlite::params![vault_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_file(file_id: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM files WHERE id = ?1", rusqlite::params![file_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Refresh (re-index a vault) ───────────────────────────────────────────────

#[tauri::command]
pub fn refresh_vault(
    vault_id: String,
    vault_path: String,
    state: State<DbState>,
) -> Result<Vec<FileRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    indexer::index_vault(&conn, &vault_id, Path::new(&vault_path)).map_err(|e| e.to_string())?;
    // Return from DB so existing summaries are included in the response
    queries::list_files(&conn, &vault_id).map_err(|e| e.to_string())
}
