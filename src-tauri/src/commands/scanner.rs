use serde::Serialize;
use tauri::{Emitter, State};

use crate::{commands::vault::DbState, db::queries, scanner};
use crate::scanner::{DbRule, UpdateRulesResult};

#[derive(Serialize, Clone)]
pub struct ScanProgress {
    pub done: u32,
    pub total: u32,
    pub file_id: String,
}

// ── Scan commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn scan_file(
    file_id: String,
    state: State<'_, DbState>,
) -> Result<scanner::ScanResult, String> {
    let (path, rules) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let path = queries::get_file_path(&conn, &file_id).map_err(|e| e.to_string())?;
        let rules = queries::list_enabled_rules(&conn).map_err(|e| e.to_string())?;
        (path, rules)
    };

    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let result = scanner::scan_content(&file_id, &content, &rules);

    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let findings_json = serde_json::to_string(&result.findings).unwrap_or_default();
        queries::update_file_scan(&conn, &file_id, &result.risk_level, &findings_json)
            .map_err(|e| e.to_string())?;
    }

    Ok(result)
}

#[tauri::command]
pub async fn scan_vault(
    vault_id: String,
    rescan: bool,
    state: State<'_, DbState>,
    app: tauri::AppHandle,
) -> Result<u32, String> {
    let (pending, rules) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let rules = queries::list_enabled_rules(&conn).map_err(|e| e.to_string())?;
        let files = if rescan {
            queries::list_files(&conn, &vault_id)
                .map_err(|e| e.to_string())?
                .into_iter()
                .map(|f| (f.id, f.path))
                .collect::<Vec<_>>()
        } else {
            queries::list_files_without_scan(&conn, &vault_id)
                .map_err(|e| e.to_string())?
        };
        (files, rules)
    };

    let total = pending.len() as u32;
    let mut done = 0u32;

    for (file_id, path) in pending {
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let result = scanner::scan_content(&file_id, &content, &rules);

        if let Ok(conn) = state.0.lock() {
            let findings_json = serde_json::to_string(&result.findings).unwrap_or_default();
            queries::update_file_scan(&conn, &file_id, &result.risk_level, &findings_json).ok();
        }

        done += 1;
        app.emit("scan-progress", ScanProgress { done, total, file_id })
            .ok();
    }

    Ok(done)
}

// ── Rules management ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_rules(state: State<'_, DbState>) -> Result<Vec<DbRule>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::list_all_rules(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_rule(
    rule_id: String,
    enabled: bool,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::toggle_rule(&conn, &rule_id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_rules(state: State<'_, DbState>) -> Result<UpdateRulesResult, String> {
    // Fetch from Gitleaks
    let (new_rules, mut result) = scanner::fetch_gitleaks_rules()
        .await
        .map_err(|e| e.to_string())?;

    // Upsert into DB, count added vs updated
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    for rule in &new_rules {
        match queries::upsert_rule(&conn, rule) {
            Ok(true)  => result.added += 1,
            Ok(false) => result.updated += 1,
            Err(e) => log::warn!("Failed to upsert rule {}: {e}", rule.id),
        }
    }

    result.total = queries::count_rules(&conn)
        .unwrap_or(new_rules.len() as i64) as u32;

    Ok(result)
}
