use rusqlite::{params, Connection, Result};

#[derive(Debug, Clone)]
pub struct JobRecord {
    pub id: i64,
    pub template_id: i64,
    pub total_items: i64,
    pub status: String,
}

pub struct JobRepository<'a> {
    conn: &'a Connection,
}

impl<'a> JobRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn create(&self, template_id: i64, total_items: i64) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO print_jobs(template_id, total_items, status) VALUES (?1, ?2, 'queued')",
            params![template_id, total_items],
        )?;

        Ok(self.conn.last_insert_rowid())
    }

    pub fn set_status(&self, job_id: i64, status: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE print_jobs SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![status, job_id],
        )?;

        Ok(())
    }

    pub fn get(&self, job_id: i64) -> Result<JobRecord> {
        self.conn.query_row(
            "SELECT id, template_id, total_items, status FROM print_jobs WHERE id = ?1",
            params![job_id],
            |row| {
                Ok(JobRecord {
                    id: row.get(0)?,
                    template_id: row.get(1)?,
                    total_items: row.get(2)?,
                    status: row.get(3)?,
                })
            },
        )
    }
}