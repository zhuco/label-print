use std::path::Path;

use rusqlite::{Connection, Result};

pub fn open_or_create(path: impl AsRef<Path>) -> Result<Connection> {
    let conn = Connection::open(path)?;
    run_migrations(&conn)?;
    Ok(conn)
}

pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(include_str!("../migrations/0001_init.sql"))?;
    add_column_if_missing(conn, "print_jobs", "printer_id", "TEXT NOT NULL DEFAULT ''")?;
    add_column_if_missing(conn, "print_jobs", "copies", "INTEGER NOT NULL DEFAULT 1")?;
    add_column_if_missing(conn, "print_jobs", "calibration_json", "TEXT NOT NULL DEFAULT '{}'")?;
    add_column_if_missing(conn, "print_jobs", "payload_json", "TEXT NOT NULL DEFAULT '{}'")?;
    Ok(())
}

fn add_column_if_missing(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    if has_column(conn, table, column)? {
        return Ok(());
    }

    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
    conn.execute_batch(&sql)
}

fn has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;

    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }

    Ok(false)
}
