use serde::{Deserialize, Serialize};

use crate::repo::template_repo::{TemplateRecord, TemplateRepository};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct SaveTemplatePayload {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct SaveTemplateResult {
    pub id: i64,
}

#[derive(Debug, Serialize)]
pub struct TemplateDto {
    pub id: i64,
    pub name: String,
    pub content: String,
}

#[tauri::command]
pub fn save_template(payload: SaveTemplatePayload, state: tauri::State<AppState>) -> Result<SaveTemplateResult, String> {
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let repo = TemplateRepository::new(&conn);
    let id = repo
        .save(&payload.name, &payload.content)
        .map_err(|err| err.to_string())?;

    Ok(SaveTemplateResult { id })
}

#[tauri::command]
pub fn list_templates(state: tauri::State<AppState>) -> Result<Vec<TemplateDto>, String> {
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let repo = TemplateRepository::new(&conn);
    let rows: Vec<TemplateRecord> = repo.list().map_err(|err| err.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| TemplateDto {
            id: row.id,
            name: row.name,
            content: row.content,
        })
        .collect())
}