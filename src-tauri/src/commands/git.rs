use crate::git as git_ops;
use crate::vault::types::GitCommit;

#[tauri::command]
pub fn git_file_history(
    git_root: String,
    file_path: String,
    limit: usize,
) -> Result<Vec<GitCommit>, String> {
    git_ops::file_history(&git_root, &file_path, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_file_at_commit(
    git_root: String,
    file_path: String,
    commit_hash: String,
) -> Result<String, String> {
    git_ops::file_at_commit(&git_root, &file_path, &commit_hash).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_find_root(path: String) -> Option<String> {
    git_ops::find_git_root(std::path::Path::new(&path))
}
