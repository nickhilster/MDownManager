use serde::Serialize;
use tauri::{Emitter, State};

use crate::{commands::vault::DbState, db::queries, embeddings, vault::types::FileRecord};

#[derive(Serialize, Clone)]
pub struct EmbedProgress {
    pub done: u32,
    pub total: u32,
    pub file_id: String,
}

/// Returns supported embedding model ids, including OpenAI models if a key is configured.
#[tauri::command]
pub fn list_embedding_models(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let openai_key = queries::get_setting(&conn, "cloud_key_openai")
        .ok()
        .flatten()
        .map(|k| !k.is_empty())
        .unwrap_or(false);
    Ok(embeddings::list_embedding_models(openai_key))
}

/// Generates and stores an embedding for a single file.
#[tauri::command]
pub async fn embed_file(
    file_id: String,
    model: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let (path, summary, api_key) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let (path, summary) = conn
            .query_row(
                "SELECT path, summary FROM files WHERE id = ?1",
                rusqlite::params![&file_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .map_err(|e| e.to_string())?;
        let provider = model.split('/').next().unwrap_or("ollama");
        let key = queries::get_setting(&conn, &format!("cloud_key_{provider}"))
            .ok()
            .flatten();
        (path, summary, key)
    };

    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let text = embeddings::prepare_embed_text(&raw, summary.as_deref());
    if text.is_empty() {
        return Err("File has no content to embed".to_string());
    }

    let vector = embeddings::generate_embedding(&text, &model, api_key.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::store_embedding(&conn, &file_id, &model, &vector).map_err(|e| e.to_string())
}

/// Generates embeddings for all un-embedded files in a vault, emitting `embed-progress` events.
#[tauri::command]
pub async fn embed_vault(
    vault_id: String,
    model: String,
    state: State<'_, DbState>,
    app: tauri::AppHandle,
) -> Result<u32, String> {
    let (pending, api_key) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let files = queries::list_files_without_embedding(&conn, &vault_id)
            .map_err(|e| e.to_string())?;
        let provider = model.split('/').next().unwrap_or("ollama");
        let key = queries::get_setting(&conn, &format!("cloud_key_{provider}"))
            .ok()
            .flatten();
        (files, key)
    };

    let total = pending.len() as u32;
    let mut done = 0u32;
    let mut succeeded = 0u32;

    for (file_id, path, summary) in pending {
        let raw = std::fs::read_to_string(&path).unwrap_or_default();
        let text = embeddings::prepare_embed_text(&raw, summary.as_deref());

        if !text.is_empty() {
            match embeddings::generate_embedding(&text, &model, api_key.as_deref()).await {
                Ok(vector) => {
                    if let Ok(conn) = state.0.lock() {
                        if queries::store_embedding(&conn, &file_id, &model, &vector).is_ok() {
                            succeeded += 1;
                        }
                    }
                }
                Err(e) => log::warn!("embed {path}: {e}"),
            }
        }

        done += 1;
        app.emit(
            "embed-progress",
            EmbedProgress { done, total, file_id },
        )
        .ok();
    }

    Ok(succeeded)
}

/// Embeds a query and returns the top-k most semantically similar files in the vault.
#[tauri::command]
pub async fn search_semantic(
    vault_id: String,
    query: String,
    model: String,
    limit: Option<usize>,
    state: State<'_, DbState>,
) -> Result<Vec<FileRecord>, String> {
    let limit = limit.unwrap_or(20);

    let api_key = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let provider = model.split('/').next().unwrap_or("ollama");
        queries::get_setting(&conn, &format!("cloud_key_{provider}"))
            .ok()
            .flatten()
    };

    let query_vec = embeddings::generate_embedding(&query, &model, api_key.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let all = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        queries::list_embeddings_for_vault(&conn, &vault_id, &model)
            .map_err(|e| e.to_string())?
    };

    if all.is_empty() {
        return Ok(vec![]);
    }

    let mut scored: Vec<(String, f32)> = all
        .into_iter()
        .map(|(id, vec)| {
            let score = cosine_similarity(&query_vec, &vec);
            (id, score)
        })
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);

    let top_ids: Vec<String> = scored.into_iter().map(|(id, _)| id).collect();

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut files = queries::get_files_by_ids(&conn, &top_ids).map_err(|e| e.to_string())?;

    // Restore similarity order (get_files_by_ids doesn't preserve IN-clause order)
    files.sort_by_key(|f| {
        top_ids
            .iter()
            .position(|id| id == &f.id)
            .unwrap_or(usize::MAX)
    });

    Ok(files)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}
