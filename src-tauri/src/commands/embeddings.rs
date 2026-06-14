use crate::embeddings;

#[tauri::command]
pub async fn ollama_health() -> bool {
    embeddings::health_check().await
}

#[tauri::command]
pub async fn embed_text(text: String) -> Result<Vec<f32>, String> {
    embeddings::embed(&text).await.map_err(|e| e.to_string())
}
