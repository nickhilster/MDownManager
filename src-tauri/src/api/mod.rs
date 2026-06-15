use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    routing::get,
    Router,
};
use rusqlite::{Connection, OpenFlags};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Arc};
use tower_http::cors::{Any, CorsLayer};

pub struct ApiState {
    pub db_path: PathBuf,
    pub api_key: String,
}

// ── Auth ──────────────────────────────────────────────────────────────────────

fn verify(headers: &HeaderMap, expected: &str) -> bool {
    headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|k| k == expected)
        .unwrap_or(false)
}

fn db(state: &ApiState) -> Result<Connection, StatusCode> {
    Connection::open_with_flags(
        &state.db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "port": 7734,
        "docs": "GET /vaults · GET /files?vault_id=&category= · GET /search?q=&vault_id= · GET /files/:id/content"
    }))
}

async fn list_vaults(
    State(s): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    if !verify(&headers, &s.api_key) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let conn = db(&s)?;
    let mut stmt = conn
        .prepare("SELECT id, name, path, created_at, git_root FROM vaults ORDER BY name")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let items: Vec<Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "id":         row.get::<_, String>(0)?,
                "name":       row.get::<_, String>(1)?,
                "path":       row.get::<_, String>(2)?,
                "created_at": row.get::<_, String>(3)?,
                "git_root":   row.get::<_, Option<String>>(4)?,
            }))
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(Json(json!(items)))
}

#[derive(Deserialize)]
struct FilesQuery {
    vault_id: Option<String>,
    category: Option<String>,
}

async fn list_files(
    State(s): State<Arc<ApiState>>,
    headers: HeaderMap,
    Query(q): Query<FilesQuery>,
) -> Result<Json<Value>, StatusCode> {
    if !verify(&headers, &s.api_key) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let conn = db(&s)?;

    let mut where_clauses: Vec<String> = Vec::new();
    if let Some(vid) = q.vault_id.as_deref() {
        where_clauses.push(format!("vault_id = '{}'", vid.replace('\'', "''")));
    }
    if let Some(cat) = q.category.as_deref() {
        where_clauses.push(format!("category_id = '{}'", cat.replace('\'', "''")));
    }
    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", where_clauses.join(" AND "))
    };

    let sql = format!(
        "SELECT id, vault_id, path, title, summary, size_bytes, line_count, modified_at, risk_level, category_id \
         FROM files{where_sql} ORDER BY modified_at DESC LIMIT 500"
    );
    let files = query_files(&conn, &sql, [])?;
    Ok(Json(json!(files)))
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
    vault_id: Option<String>,
}

async fn search(
    State(s): State<Arc<ApiState>>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> Result<Json<Value>, StatusCode> {
    if !verify(&headers, &s.api_key) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let conn = db(&s)?;
    let vault_clause = q
        .vault_id
        .as_deref()
        .map(|v| format!(" AND f.vault_id = '{}'", v.replace('\'', "''")))
        .unwrap_or_default();
    let sql = format!(
        "SELECT f.id, f.vault_id, f.path, f.title, f.summary, \
                f.size_bytes, f.line_count, f.modified_at, f.risk_level, f.category_id \
         FROM files f JOIN files_fts fts ON f.rowid = fts.rowid \
         WHERE fts MATCH ?1{vault_clause} ORDER BY rank LIMIT 50"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let files: Vec<Value> = stmt
        .query_map(rusqlite::params![&q.q], file_row)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(Json(json!(files)))
}

async fn file_content(
    State(s): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(file_id): Path<String>,
) -> Result<String, StatusCode> {
    if !verify(&headers, &s.api_key) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let conn = db(&s)?;
    let path: String = conn
        .query_row(
            "SELECT path FROM files WHERE id = ?1",
            rusqlite::params![file_id],
            |row| row.get(0),
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    std::fs::read_to_string(&path).map_err(|_| StatusCode::NOT_FOUND)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn file_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "id":          row.get::<_, String>(0)?,
        "vault_id":    row.get::<_, String>(1)?,
        "path":        row.get::<_, String>(2)?,
        "title":       row.get::<_, Option<String>>(3)?,
        "summary":     row.get::<_, Option<String>>(4)?,
        "size_bytes":  row.get::<_, i64>(5)?,
        "line_count":  row.get::<_, i64>(6)?,
        "modified_at": row.get::<_, String>(7)?,
        "risk_level":  row.get::<_, Option<String>>(8)?,
        "category_id": row.get::<_, Option<String>>(9)?,
    }))
}

fn query_files(
    conn: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<Value>, StatusCode> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let items: Vec<Value> = stmt
        .query_map(params, file_row)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

// ── Server startup ────────────────────────────────────────────────────────────

pub async fn start(db_path: PathBuf, api_key: String) {
    let state = Arc::new(ApiState { db_path, api_key });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/vaults", get(list_vaults))
        .route("/files", get(list_files))
        .route("/search", get(search))
        .route("/files/:id/content", get(file_content))
        .layer(cors)
        .with_state(state);

    let listener = match tokio::net::TcpListener::bind("127.0.0.1:7734").await {
        Ok(l) => l,
        Err(e) => {
            log::error!("MdownManager API: failed to bind port 7734 — {e}");
            return;
        }
    };

    log::info!("MdownManager agent API → http://127.0.0.1:7734");

    if let Err(e) = axum::serve(listener, app).await {
        log::error!("MdownManager API server error: {e}");
    }
}
