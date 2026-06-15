use tauri::State;

use crate::{
    commands::vault::DbState,
    db::queries,
    vault::types::{CategoryRecord, FileRecord},
};

#[tauri::command]
pub fn list_categories(
    vault_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<CategoryRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::list_categories_with_counts(&conn, &vault_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_category(
    vault_id: String,
    name: String,
    state: State<'_, DbState>,
) -> Result<CategoryRecord, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::create_category(&conn, &vault_id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_category(
    id: String,
    name: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::rename_category(&conn, &id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_category(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::delete_category(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn assign_file_category(
    file_id: String,
    category_id: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::assign_file_category(&conn, &file_id, category_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_files_by_category(
    vault_id: String,
    category_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<FileRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::list_files_by_category(&conn, &vault_id, &category_id).map_err(|e| e.to_string())
}
