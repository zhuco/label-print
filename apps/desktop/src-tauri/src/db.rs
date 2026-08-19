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
    conn.execute_batch(include_str!("../migrations/0003_add_cloud_cache.sql"))?;
    conn.execute_batch(include_str!("../migrations/0004_add_cloud_asset_cache.sql"))?;
    add_column_if_missing(conn, "cloud_sync_queue", "next_attempt_at", "TEXT")?;
    conn.execute_batch(include_str!("../migrations/0005_add_cloud_sync_retry.sql"))?;
    conn.execute_batch(include_str!("../migrations/0006_add_recent_template_snapshots.sql"))?;
    conn.execute_batch(include_str!("../migrations/0007_add_custom_presets.sql"))?;
    add_column_if_missing(
        conn,
        "recent_template_snapshots",
        "source",
        "TEXT NOT NULL DEFAULT 'local'",
    )?;
    add_column_if_missing(conn, "recent_template_snapshots", "cloud_label_id", "TEXT")?;
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

#[cfg(test)]
mod tests {
    use super::run_migrations;
    use rusqlite::Connection;

    #[test]
    fn creates_cloud_cache_and_sync_queue_tables() {
        let conn = Connection::open_in_memory().expect("in-memory database should open");
        run_migrations(&conn).expect("migrations should apply");

        for table in ["cloud_label_cache", "cloud_sync_queue", "cloud_asset_cache", "recent_template_snapshots", "custom_presets"] {
            let found: Option<String> = conn
                .query_row(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .ok();
            assert_eq!(found.as_deref(), Some(table));
        }
        let retry_column: Option<String> = conn
            .query_row(
                "SELECT name FROM pragma_table_info('cloud_sync_queue') WHERE name = 'next_attempt_at'",
                [],
                |row| row.get(0),
            )
            .ok();
        assert_eq!(retry_column.as_deref(), Some("next_attempt_at"));

        for column in ["source", "cloud_label_id"] {
            let found: Option<String> = conn
                .query_row(
                    "SELECT name FROM pragma_table_info('recent_template_snapshots') WHERE name = ?1",
                    [column],
                    |row| row.get(0),
                )
                .ok();
            assert_eq!(found.as_deref(), Some(column));
        }
    }
}
