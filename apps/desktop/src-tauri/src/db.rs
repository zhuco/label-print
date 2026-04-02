use std::path::Path;

use rusqlite::{Connection, Result};

pub fn open_or_create(path: impl AsRef<Path>) -> Result<Connection> {
    let conn = Connection::open(path)?;
    run_migrations(&conn)?;
    Ok(conn)
}

pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(include_str!("../migrations/0001_init.sql"))
}