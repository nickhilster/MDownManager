use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultRecord {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub git_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub id: String,
    pub vault_id: String,
    pub path: String,
    pub title: Option<String>,
    pub content_hash: String,
    pub frontmatter: Option<String>,
    pub size_bytes: i64,
    pub line_count: i64,
    pub created_at: String,
    pub modified_at: String,
    pub last_scanned_at: Option<String>,
    pub risk_level: Option<String>,
    pub category_id: Option<String>,
    pub category_source: Option<String>,
    pub embedding_ref: Option<String>,
    pub tags: Option<String>,
    pub summary: Option<String>,
    pub summary_model: Option<String>,
    pub scan_findings: Option<String>, // JSON: Vec<Finding>
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub content_hash: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: String,
}
