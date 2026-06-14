pub mod migrations;
pub mod queries;

use anyhow::Result;
use rusqlite::Connection;
use std::path::Path;

pub fn open(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    migrations::run(&conn)?;
    Ok(conn)
}
