use rusqlite::{params, Connection, Result};

#[derive(Debug, Clone)]
pub struct JobRecord {
    pub id: i64,
    pub template_id: i64,
    pub total_items: i64,
    pub status: String,
    pub printer_id: String,
    pub copies: i64,
    pub calibration_json: String,
    pub payload_json: String,
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

    pub fn create_with_metadata(
        &self,
        template_id: i64,
        total_items: i64,
        printer_id: &str,
        copies: i64,
        calibration_json: &str,
        payload_json: &str,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO print_jobs(template_id, total_items, status, printer_id, copies, calibration_json, payload_json) VALUES (?1, ?2, 'queued', ?3, ?4, ?5, ?6)",
            params![
                template_id,
                total_items,
                printer_id,
                copies,
                calibration_json,
                payload_json,
            ],
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
            "SELECT id, template_id, total_items, status, printer_id, copies, calibration_json, payload_json FROM print_jobs WHERE id = ?1",
            params![job_id],
            |row| {
                Ok(JobRecord {
                    id: row.get(0)?,
                    template_id: row.get(1)?,
                    total_items: row.get(2)?,
                    status: row.get(3)?,
                    printer_id: row.get(4)?,
                    copies: row.get(5)?,
                    calibration_json: row.get(6)?,
                    payload_json: row.get(7)?,
                })
            },
        )
    }
}
