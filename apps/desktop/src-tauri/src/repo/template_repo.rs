use rusqlite::{params, Connection, Result};

#[derive(Debug, Clone)]
pub struct TemplateRecord {
    pub id: i64,
    pub name: String,
    pub content: String,
}

pub struct TemplateRepository<'a> {
    conn: &'a Connection,
}

impl<'a> TemplateRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn save(&self, name: &str, content: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO templates(name, content) VALUES (?1, ?2)",
            params![name, content],
        )?;

        Ok(self.conn.last_insert_rowid())
    }

    pub fn list(&self) -> Result<Vec<TemplateRecord>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, content FROM templates ORDER BY id DESC")?;

        let rows = stmt.query_map([], |row| {
            Ok(TemplateRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                content: row.get(2)?,
            })
        })?;

        rows.collect()
    }
}
