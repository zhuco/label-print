use std::fs;
use std::path::PathBuf;

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

#[derive(Debug, Deserialize)]
pub struct SaveTemplateFilePayload {
    pub path: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTemplateFileResult {
    pub file_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenTemplateFileResult {
    pub file_name: String,
    pub file_path: String,
    pub bytes: Vec<u8>,
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

#[tauri::command]
pub fn save_template_file(payload: SaveTemplateFilePayload) -> Result<SaveTemplateFileResult, String> {
    let raw_path = payload.path.trim();
    if raw_path.is_empty() {
        return Err("template path is required".to_string());
    }

    let path = PathBuf::from(raw_path);
    if !path.is_absolute() {
        return Err("template path must be absolute".to_string());
    }

    fs::write(&path, payload.bytes).map_err(|err| format!("save template file failed: {err}"))?;

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| "label-template.lpt".to_string());

    Ok(SaveTemplateFileResult { file_name })
}

#[tauri::command]
pub fn open_template_file() -> Result<Option<OpenTemplateFileResult>, String> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("打开模板")
        .add_filter("标签模板", &["lpt", "json", "ddl"])
        .pick_file()
    else {
        return Ok(None);
    };

    let bytes = fs::read(&path).map_err(|err| format!("open template file failed: {err}"))?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| "label-template.lpt".to_string());
    let file_path = path.to_string_lossy().into_owned();

    Ok(Some(OpenTemplateFileResult {
        file_name,
        file_path,
        bytes,
    }))
}
