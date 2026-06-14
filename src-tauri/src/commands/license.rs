use tauri::State;

use crate::db::queries;
use crate::license::{default_free_license, verify_token};
use crate::license::types::ActiveLicense;
use crate::commands::vault::DbState;

/// Returns the current active license. Falls back to Free if no token is stored
/// or if the stored token fails verification.
#[tauri::command]
pub fn get_license(state: State<DbState>) -> ActiveLicense {
    let conn = match state.0.lock() {
        Ok(c) => c,
        Err(_) => return default_free_license(),
    };

    let token = match queries::get_setting(&conn, "license_token") {
        Ok(Some(t)) => t,
        _ => return default_free_license(),
    };

    verify_token(&token).unwrap_or_else(|_| default_free_license())
}

/// Verifies and persists a new license token. Returns the resulting ActiveLicense
/// so the frontend can update immediately without a second call.
#[tauri::command]
pub fn activate_license(token: String, state: State<DbState>) -> Result<ActiveLicense, String> {
    let license = verify_token(&token).map_err(|e| e.to_string())?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::set_setting(&conn, "license_token", &token).map_err(|e| e.to_string())?;

    Ok(license)
}

/// Clears the stored token, reverting the app to Free tier.
#[tauri::command]
pub fn deactivate_license(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::set_setting(&conn, "license_token", "").map_err(|e| e.to_string())
}
