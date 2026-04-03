use serde::Deserialize;

use crate::repo::job_repo::JobRepository;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct EnqueuePayload {
    pub template_id: i64,
    pub total_items: i64,
}

#[derive(Debug, Deserialize)]
pub struct SubmitPrintTaskPayload {
    pub template_id: i64,
    pub total_items: i64,
    pub printer_id: String,
    pub copies: i64,
    pub calibration_json: String,
    pub payload_json: String,
}

#[tauri::command]
pub fn enqueue_print_job(payload: EnqueuePayload, state: tauri::State<AppState>) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let repo = JobRepository::new(&conn);
    repo.create(payload.template_id, payload.total_items)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn submit_print_task(payload: SubmitPrintTaskPayload, state: tauri::State<AppState>) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let repo = JobRepository::new(&conn);
    repo.create_with_metadata(
        payload.template_id,
        payload.total_items,
        &payload.printer_id,
        payload.copies,
        &payload.calibration_json,
        &payload.payload_json,
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn pause_print_job(id: i64, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let repo = JobRepository::new(&conn);
    repo.set_status(id, "paused").map_err(|err| err.to_string())
}

#[tauri::command]
pub fn resume_print_job(id: i64, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let repo = JobRepository::new(&conn);
    repo.set_status(id, "running").map_err(|err| err.to_string())
}

#[tauri::command]
pub fn cancel_print_job(id: i64, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let repo = JobRepository::new(&conn);
    repo.set_status(id, "cancelled").map_err(|err| err.to_string())
}
