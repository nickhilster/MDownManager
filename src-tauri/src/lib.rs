mod api;
mod commands;
mod db;
mod embeddings;
mod git;
mod license;
mod scanner;
mod vault;

use commands::{
    ai::{get_api_key, get_cloud_api_key, list_all_models, list_ollama_models, set_cloud_api_key, summarize_file, summarize_vault},
    scanner::{list_rules, scan_file, scan_vault, toggle_rule, update_rules},
    embeddings::{embed_text, ollama_health},
    git::{git_file_at_commit, git_file_history, git_find_root},
    help::{get_tour_state, set_tour_seen, set_tour_step},
    license::{activate_license, deactivate_license, get_license},
    categories::{
        assign_file_category, create_category, delete_category, list_categories,
        list_files_by_category, rename_category,
    },
    semantic::{embed_file, embed_vault, list_embedding_models, search_semantic},
    vault::{
        add_vault, get_file_content, get_snapshot_content, import_files, import_github_repo,
        list_files, list_snapshots, list_vaults, open_file_in_editor, refresh_vault,
        remove_file, remove_vault, search_files, DbState,
    },
};
use db::queries;
use dirs::data_dir;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("mdownmanager")
        .join("vault.db");

    std::fs::create_dir_all(db_path.parent().unwrap()).expect("create data dir");

    let conn = db::open(&db_path).expect("open database");

    // Ensure all default scanner rules exist (inserts only missing ones; preserves user enable/disable state)
    queries::insert_missing_rules(&conn, scanner::default_rules())
        .unwrap_or_else(|e| { log::warn!("Could not seed scanner rules: {e}"); 0 });

    // Generate API key before conn is moved into managed state
    let api_key = queries::get_or_create_api_key(&conn)
        .unwrap_or_else(|_| "mdown_error".to_string());
    let api_db_path = db_path.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(DbState(Mutex::new(conn)))
        .setup(move |_app| {
            let key = api_key.clone();
            let path = api_db_path.clone();
            tauri::async_runtime::spawn(async move {
                api::start(path, key).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // vault
            add_vault,
            import_github_repo,
            list_vaults,
            list_files,
            search_files,
            import_files,
            get_file_content,
            open_file_in_editor,
            refresh_vault,
            remove_vault,
            remove_file,
            // snapshots
            list_snapshots,
            get_snapshot_content,
            // git
            git_file_history,
            git_file_at_commit,
            git_find_root,
            // embeddings
            ollama_health,
            embed_text,
            // semantic search
            list_embedding_models,
            embed_file,
            embed_vault,
            search_semantic,
            // ai / summaries
            list_ollama_models,
            list_all_models,
            summarize_file,
            summarize_vault,
            get_api_key,
            get_cloud_api_key,
            set_cloud_api_key,
            // scanner
            scan_file,
            scan_vault,
            list_rules,
            toggle_rule,
            update_rules,
            // help / tour
            get_tour_state,
            set_tour_seen,
            set_tour_step,
            // categories
            list_categories,
            create_category,
            rename_category,
            delete_category,
            assign_file_category,
            list_files_by_category,
            // license
            get_license,
            activate_license,
            deactivate_license,
        ])
        .run(tauri::generate_context!())
        .expect("error running mdownmanager");
}
