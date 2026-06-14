use anyhow::Result;
use chrono::{DateTime, Utc};
use git2::Repository;
use std::path::Path;

use crate::vault::types::GitCommit;

/// Find the git root for a given path, if any.
pub fn find_git_root(path: &Path) -> Option<String> {
    Repository::discover(path)
        .ok()
        .and_then(|r| r.workdir().map(|p| p.to_string_lossy().to_string()))
}

/// List recent commits touching a specific file (relative to git root).
pub fn file_history(git_root: &str, file_path: &str, limit: usize) -> Result<Vec<GitCommit>> {
    let repo = Repository::open(git_root)?;
    let mut revwalk = repo.revwalk()?;
    revwalk.push_head()?;
    revwalk.set_sorting(git2::Sort::TIME)?;

    let file_rel = Path::new(file_path)
        .strip_prefix(git_root)
        .unwrap_or(Path::new(file_path));

    let mut commits = Vec::new();
    for oid in revwalk.flatten().take(500) {
        let commit = repo.find_commit(oid)?;
        if commits_touches_file(&repo, &commit, file_rel)? {
            let ts = DateTime::<Utc>::from_timestamp(commit.time().seconds(), 0)
                .map(|d| d.to_rfc3339())
                .unwrap_or_default();
            commits.push(GitCommit {
                hash: commit.id().to_string(),
                message: commit.summary().unwrap_or("").to_string(),
                author: commit.author().name().unwrap_or("").to_string(),
                timestamp: ts,
            });
            if commits.len() >= limit {
                break;
            }
        }
    }
    Ok(commits)
}

/// Get the content of a file at a specific git commit.
pub fn file_at_commit(git_root: &str, file_path: &str, commit_hash: &str) -> Result<String> {
    let repo = Repository::open(git_root)?;
    let oid = git2::Oid::from_str(commit_hash)?;
    let commit = repo.find_commit(oid)?;
    let tree = commit.tree()?;

    let file_rel = Path::new(file_path)
        .strip_prefix(git_root)
        .unwrap_or(Path::new(file_path));

    let entry = tree.get_path(file_rel)?;
    let blob = repo.find_blob(entry.id())?;
    let content = std::str::from_utf8(blob.content())?.to_string();
    Ok(content)
}

fn commits_touches_file(
    repo: &Repository,
    commit: &git2::Commit,
    file: &Path,
) -> Result<bool> {
    let tree = commit.tree()?;
    if commit.parent_count() == 0 {
        return Ok(tree.get_path(file).is_ok());
    }
    let parent_tree = commit.parent(0)?.tree()?;
    let diff = repo.diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)?;
    for delta in diff.deltas() {
        let new_path = delta.new_file().path().unwrap_or(Path::new(""));
        let old_path = delta.old_file().path().unwrap_or(Path::new(""));
        if new_path == file || old_path == file {
            return Ok(true);
        }
    }
    Ok(false)
}
