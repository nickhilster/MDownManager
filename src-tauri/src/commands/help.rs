use tauri::State;
use crate::commands::vault::DbState;
use crate::db::queries;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct TourState {
    pub seen: bool,
    pub step: u8,
}

/// Returns the current tour state from settings.
#[tauri::command]
pub fn get_tour_state(state: State<DbState>) -> TourState {
    let conn = match state.0.lock() {
        Ok(c) => c,
        Err(_) => return TourState { seen: false, step: 0 },
    };
    let seen = queries::get_setting(&conn, "help_tour_seen")
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);
    let step = queries::get_setting(&conn, "help_tour_step")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<u8>().ok())
        .unwrap_or(0);
    TourState { seen, step }
}

/// Marks the tour as fully seen. Called when the user reaches the last step or clicks Skip.
#[tauri::command]
pub fn set_tour_seen(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::set_setting(&conn, "help_tour_seen", "true").map_err(|e| e.to_string())?;
    queries::set_setting(&conn, "help_tour_step", "0").map_err(|e| e.to_string())
}

/// Persists the current step so a mid-tour close can resume where it left off.
#[tauri::command]
pub fn set_tour_step(step: u8, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::set_setting(&conn, "help_tour_step", &step.to_string()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use crate::db;

    fn open_test_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        db::migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn test_tour_state_defaults_to_unseen() {
        let conn = open_test_db();
        let seen = crate::db::queries::get_setting(&conn, "help_tour_seen")
            .unwrap()
            .is_none();
        assert!(seen, "no tour state in fresh DB");
    }

    #[test]
    fn test_set_and_get_tour_step() {
        let conn = open_test_db();
        crate::db::queries::set_setting(&conn, "help_tour_step", "3").unwrap();
        let step: u8 = crate::db::queries::get_setting(&conn, "help_tour_step")
            .unwrap()
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!(step, 3);
    }
}
