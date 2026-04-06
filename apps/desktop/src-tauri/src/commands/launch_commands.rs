use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::AppState;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchFilePayload {
    pub file_name: String,
    pub file_path: String,
    pub bytes: Vec<u8>,
}

pub fn build_launch_file_payloads(launch_files: Vec<String>) -> Vec<LaunchFilePayload> {
    let mut output = Vec::new();
    for raw_path in launch_files {
        let path = Path::new(&raw_path);
        if !path.is_file() {
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Ok(bytes) = fs::read(path) else {
            continue;
        };

        output.push(LaunchFilePayload {
            file_name: file_name.to_string(),
            file_path: raw_path,
            bytes,
        });
    }
    output
}

#[tauri::command]
pub fn consume_launch_files(state: tauri::State<AppState>) -> Result<Vec<LaunchFilePayload>, String> {
    let mut pending = state
        .pending_launch_files
        .lock()
        .map_err(|_| "launch file lock poisoned".to_string())?;
    Ok(build_launch_file_payloads(std::mem::take(&mut *pending)))
}
