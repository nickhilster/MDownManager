use serde::Serialize;
use tauri::{Emitter, State};

use crate::{commands::vault::DbState, db::queries, embeddings};

#[derive(Serialize, Clone)]
pub struct SummarizeProgress {
    pub done: u32,
    pub total: u32,
    pub file_id: String,
}

// ── Model listing ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<String>, String> {
    // Kept for backward compat — returns bare names (no prefix)
    // Frontend now uses list_all_models instead
    Ok(vec![])
}

#[tauri::command]
pub async fn list_all_models(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let (anthropic, openai, deepseek, google) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        (
            queries::get_setting(&conn, "cloud_key_anthropic").ok().flatten().is_some(),
            queries::get_setting(&conn, "cloud_key_openai").ok().flatten().is_some(),
            queries::get_setting(&conn, "cloud_key_deepseek").ok().flatten().is_some(),
            queries::get_setting(&conn, "cloud_key_google").ok().flatten().is_some(),
        )
    };

    Ok(embeddings::list_all_models(anthropic, openai, deepseek, google).await)
}

// ── Cloud API key management ──────────────────────────────────────────────────

#[tauri::command]
pub fn get_cloud_api_key(
    provider: String,
    state: State<'_, DbState>,
) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::get_setting(&conn, &format!("cloud_key_{provider}"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_cloud_api_key(
    provider: String,
    key: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let setting_key = format!("cloud_key_{provider}");
    if key.is_empty() {
        // Clear key by setting empty string (get_all_models checks is_some, empty is falsy below)
        // Actually let's store nothing — delete row if key is blank
        conn.execute(
            "DELETE FROM settings WHERE key = ?1",
            rusqlite::params![&setting_key],
        )
        .map_err(|e| e.to_string())?;
    } else {
        queries::set_setting(&conn, &setting_key, &key)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Helper: fetch API key for a provider ─────────────────────────────────────

fn provider_key(provider: &str, conn: &rusqlite::Connection) -> Option<String> {
    queries::get_setting(conn, &format!("cloud_key_{provider}"))
        .ok()
        .flatten()
}

// ── Summarize single file ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn summarize_file(
    file_id: String,
    model: String,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let (path, api_key) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let path = queries::get_file_path(&conn, &file_id).map_err(|e| e.to_string())?;
        let provider = model.split('/').next().unwrap_or("ollama");
        let key = provider_key(provider, &conn);
        (path, key)
    };

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let summary = embeddings::generate_summary(&content, &model, api_key.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        queries::update_file_summary(&conn, &file_id, &summary, &model)
            .map_err(|e| e.to_string())?;
    }

    Ok(summary)
}

// ── Summarize entire vault ────────────────────────────────────────────────────

#[tauri::command]
pub async fn summarize_vault(
    vault_id: String,
    model: String,
    state: State<'_, DbState>,
    app: tauri::AppHandle,
) -> Result<u32, String> {
    let (pending, api_key) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let files = queries::list_files_without_summary(&conn, &vault_id)
            .map_err(|e| e.to_string())?;
        let provider = model.split('/').next().unwrap_or("ollama");
        let key = provider_key(provider, &conn);
        (files, key)
    };

    let total = pending.len() as u32;
    let mut done = 0u32;
    let mut succeeded = 0u32;

    for (file_id, path) in pending {
        let content = match std::fs::read_to_string(&path) {
            Ok(c) if !c.trim().is_empty() => c,
            _ => {
                done += 1;
                app.emit(
                    "summarize-progress",
                    SummarizeProgress { done, total, file_id: file_id.clone() },
                )
                .ok();
                continue;
            }
        };

        match embeddings::generate_summary(&content, &model, api_key.as_deref()).await {
            Ok(summary) => {
                if let Ok(conn) = state.0.lock() {
                    if queries::update_file_summary(&conn, &file_id, &summary, &model).is_ok() {
                        succeeded += 1;
                    }
                }
            }
            Err(e) => log::warn!("summarize {path}: {e}"),
        }

        done += 1;
        app.emit(
            "summarize-progress",
            SummarizeProgress { done, total, file_id: file_id.clone() },
        )
        .ok();
    }

    Ok(succeeded)
}

// ── Local API key ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_api_key(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::get_or_create_api_key(&conn).map_err(|e| e.to_string())
}
