use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::AppState;

const CREDENTIAL_TARGET: &str = "com.opensource.labelprint.cloud.credentials.v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudCredentials {
    pub access_token: String,
    pub refresh_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedCloudLabel {
    pub id: String,
    pub name: String,
    pub schema_version: i64,
    pub content: Value,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub last_opened_at: Option<String>,
    pub sync_status: String,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingSyncOperation {
    pub id: String,
    pub user_id: String,
    pub label_id: String,
    pub kind: String,
    pub payload: Value,
    pub expected_revision: Option<i64>,
    pub created_at: String,
    pub attempts: i64,
    pub next_attempt_at: Option<String>,
}

fn require_non_empty(value: String, field: &str) -> Result<String, String> {
    if value.trim().is_empty() {
        return Err(format!("{field} is required"));
    }
    Ok(value)
}

#[tauri::command]
pub fn cloud_load_credentials() -> Result<Option<CloudCredentials>, String> {
    let Some(serialized) = platform_credentials::load()? else {
        return Ok(None);
    };
    serde_json::from_str(&serialized).map(Some).map_err(|_| "stored cloud credentials are invalid".to_string())
}

#[tauri::command]
pub fn cloud_save_credentials(credentials: CloudCredentials) -> Result<(), String> {
    if credentials.access_token.trim().is_empty() || credentials.refresh_token.trim().is_empty() {
        return Err("cloud credentials must not be empty".to_string());
    }
    let serialized = serde_json::to_string(&credentials).map_err(|_| "could not encode cloud credentials".to_string())?;
    platform_credentials::save(&serialized)
}

#[tauri::command]
pub fn cloud_clear_credentials() -> Result<(), String> {
    platform_credentials::clear()
}

#[tauri::command]
pub fn cloud_cache_list_labels(user_id: String, state: tauri::State<AppState>) -> Result<Vec<CachedCloudLabel>, String> {
    let user_id = require_non_empty(user_id, "user id")?;
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let mut statement = conn.prepare(
        "SELECT id, name, schema_version, content, revision, created_at, updated_at, deleted_at, last_opened_at, sync_status, last_synced_at
         FROM cloud_label_cache WHERE user_id = ?1 ORDER BY updated_at DESC"
    ).map_err(|error| error.to_string())?;
    let rows = statement.query_map(params![user_id], row_to_cached_label).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn cloud_cache_get_label(user_id: String, label_id: String, state: tauri::State<AppState>) -> Result<Option<CachedCloudLabel>, String> {
    let user_id = require_non_empty(user_id, "user id")?;
    let label_id = require_non_empty(label_id, "label id")?;
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    conn.query_row(
        "SELECT id, name, schema_version, content, revision, created_at, updated_at, deleted_at, last_opened_at, sync_status, last_synced_at
         FROM cloud_label_cache WHERE user_id = ?1 AND id = ?2",
        params![user_id, label_id],
        row_to_cached_label,
    ).optional().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn cloud_cache_put_label(user_id: String, label: CachedCloudLabel, state: tauri::State<AppState>) -> Result<(), String> {
    upsert_cached_label(user_id, label, state)
}

#[tauri::command]
pub fn cloud_cache_remove_label(user_id: String, label_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let user_id = require_non_empty(user_id, "user id")?;
    let label_id = require_non_empty(label_id, "label id")?;
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    conn.execute("DELETE FROM cloud_label_cache WHERE user_id = ?1 AND id = ?2", params![user_id, label_id]).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cloud_cache_replace_label_id(user_id: String, previous_id: String, label: CachedCloudLabel, state: tauri::State<AppState>) -> Result<(), String> {
    let user_id = require_non_empty(user_id, "user id")?;
    let previous_id = require_non_empty(previous_id, "previous label id")?;
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    conn.execute("DELETE FROM cloud_label_cache WHERE user_id = ?1 AND id = ?2", params![user_id, previous_id]).map_err(|error| error.to_string())?;
    insert_cached_label(&conn, &user_id, &label)
}

#[tauri::command]
pub fn cloud_cache_clear_user(user_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let user_id = require_non_empty(user_id, "user id")?;
    let mut conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let transaction = conn.transaction().map_err(|error| error.to_string())?;
    transaction.execute("DELETE FROM cloud_label_cache WHERE user_id = ?1", params![user_id]).map_err(|error| error.to_string())?;
    transaction.execute("DELETE FROM cloud_sync_queue WHERE user_id = ?1", params![user_id]).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cloud_asset_cache_get(user_id: String, asset_id: String, state: tauri::State<AppState>) -> Result<Option<String>, String> {
    let user_id = require_non_empty(user_id, "user id")?;
    let asset_id = require_non_empty(asset_id, "asset id")?;
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    conn.query_row(
        "SELECT data_url FROM cloud_asset_cache WHERE user_id = ?1 AND asset_id = ?2",
        params![user_id, asset_id],
        |row| row.get(0),
    ).optional().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn cloud_asset_cache_put(user_id: String, asset_id: String, data_url: String, state: tauri::State<AppState>) -> Result<(), String> {
    let user_id = require_non_empty(user_id, "user id")?;
    let asset_id = require_non_empty(asset_id, "asset id")?;
    if !data_url.starts_with("data:image/") {
        return Err("asset cache only accepts image data URLs".to_string());
    }
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    conn.execute(
        "INSERT INTO cloud_asset_cache (user_id, asset_id, data_url, updated_at) VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(user_id, asset_id) DO UPDATE SET data_url = excluded.data_url, updated_at = excluded.updated_at",
        params![user_id, asset_id, data_url],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cloud_asset_cache_clear_user(user_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let user_id = require_non_empty(user_id, "user id")?;
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    conn.execute("DELETE FROM cloud_asset_cache WHERE user_id = ?1", params![user_id]).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cloud_sync_enqueue(operation: PendingSyncOperation, state: tauri::State<AppState>) -> Result<(), String> {
    write_sync_operation(operation, state)
}

#[tauri::command]
pub fn cloud_sync_list(user_id: String, state: tauri::State<AppState>) -> Result<Vec<PendingSyncOperation>, String> {
    let user_id = require_non_empty(user_id, "user id")?;
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let mut statement = conn.prepare("SELECT id, user_id, label_id, operation, payload, expected_revision, created_at, attempts, next_attempt_at FROM cloud_sync_queue WHERE user_id = ?1 ORDER BY created_at ASC")
        .map_err(|error| error.to_string())?;
    let rows = statement.query_map(params![user_id], |row| {
        let payload: String = row.get(4)?;
        Ok(PendingSyncOperation {
            id: row.get(0)?, user_id: row.get(1)?, label_id: row.get(2)?, kind: row.get(3)?,
            payload: serde_json::from_str(&payload).unwrap_or(Value::Null), expected_revision: row.get(5)?, created_at: row.get(6)?, attempts: row.get(7)?, next_attempt_at: row.get(8)?,
        })
    }).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn cloud_sync_update(operation: PendingSyncOperation, state: tauri::State<AppState>) -> Result<(), String> {
    write_sync_operation(operation, state)
}

#[tauri::command]
pub fn cloud_sync_remove(user_id: String, operation_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let user_id = require_non_empty(user_id, "user id")?;
    let operation_id = require_non_empty(operation_id, "operation id")?;
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    conn.execute("DELETE FROM cloud_sync_queue WHERE user_id = ?1 AND id = ?2", params![user_id, operation_id]).map_err(|error| error.to_string())?;
    Ok(())
}

fn row_to_cached_label(row: &rusqlite::Row<'_>) -> rusqlite::Result<CachedCloudLabel> {
    let content: String = row.get(3)?;
    Ok(CachedCloudLabel {
        id: row.get(0)?, name: row.get(1)?, schema_version: row.get(2)?,
        content: serde_json::from_str(&content).unwrap_or(Value::Null), revision: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)?,
        deleted_at: row.get(7)?, last_opened_at: row.get(8)?, sync_status: row.get(9)?, last_synced_at: row.get(10)?,
    })
}

fn upsert_cached_label(user_id: String, label: CachedCloudLabel, state: tauri::State<AppState>) -> Result<(), String> {
    let user_id = require_non_empty(user_id, "user id")?;
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    insert_cached_label(&conn, &user_id, &label)
}

fn insert_cached_label(conn: &rusqlite::Connection, user_id: &str, label: &CachedCloudLabel) -> Result<(), String> {
    let content = serde_json::to_string(&label.content).map_err(|_| "could not encode cached label".to_string())?;
    conn.execute(
        "INSERT INTO cloud_label_cache (id, user_id, name, schema_version, content, revision, created_at, updated_at, deleted_at, last_opened_at, sync_status, last_synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, schema_version = excluded.schema_version, content = excluded.content, revision = excluded.revision, created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, last_opened_at = excluded.last_opened_at, sync_status = excluded.sync_status, last_synced_at = excluded.last_synced_at",
        params![label.id, user_id, label.name, label.schema_version, content, label.revision, label.created_at, label.updated_at, label.deleted_at, label.last_opened_at, label.sync_status, label.last_synced_at],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

fn write_sync_operation(operation: PendingSyncOperation, state: tauri::State<AppState>) -> Result<(), String> {
    let user_id = require_non_empty(operation.user_id.clone(), "user id")?;
    let payload = serde_json::to_string(&operation.payload).map_err(|_| "could not encode sync payload".to_string())?;
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    conn.execute(
        "INSERT INTO cloud_sync_queue (id, user_id, label_id, operation, payload, expected_revision, attempts, created_at, next_attempt_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET label_id = excluded.label_id, operation = excluded.operation, payload = excluded.payload, expected_revision = excluded.expected_revision, attempts = excluded.attempts, created_at = excluded.created_at, next_attempt_at = excluded.next_attempt_at",
        params![operation.id, user_id, operation.label_id, operation.kind, payload, operation.expected_revision, operation.attempts, operation.created_at, operation.next_attempt_at],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
mod platform_credentials {
    use std::slice;
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Security::Credentials::{CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};
    use super::CREDENTIAL_TARGET;

    fn wide(value: &str) -> Vec<u16> { value.encode_utf16().chain(std::iter::once(0)).collect() }

    pub fn load() -> Result<Option<String>, String> {
        let target = wide(CREDENTIAL_TARGET);
        let mut credential: *mut CREDENTIALW = std::ptr::null_mut();
        if unsafe { CredReadW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, 0, &mut credential) }.is_err() {
            return Ok(None);
        }
        if credential.is_null() { return Ok(None); }
        let result = unsafe {
            let bytes = slice::from_raw_parts((*credential).CredentialBlob, (*credential).CredentialBlobSize as usize);
            String::from_utf8(bytes.to_vec()).map_err(|_| "stored cloud credentials are invalid".to_string())
        };
        unsafe { CredFree(credential as _); }
        result.map(Some)
    }

    pub fn save(value: &str) -> Result<(), String> {
        let mut target = wide(CREDENTIAL_TARGET);
        let mut blob = value.as_bytes().to_vec();
        let credential = CREDENTIALW {
            Type: CRED_TYPE_GENERIC, TargetName: PWSTR(target.as_mut_ptr()), CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(), Persist: CRED_PERSIST_LOCAL_MACHINE, ..Default::default()
        };
        unsafe { CredWriteW(&credential, 0) }.map_err(|_| "could not store cloud credentials in Windows Credential Manager".to_string())
    }

    pub fn clear() -> Result<(), String> {
        let target = wide(CREDENTIAL_TARGET);
        let _ = unsafe { CredDeleteW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, 0) };
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
mod platform_credentials {
    pub fn load() -> Result<Option<String>, String> { Ok(None) }
    pub fn save(_: &str) -> Result<(), String> { Err("system credential storage is only available on Windows".to_string()) }
    pub fn clear() -> Result<(), String> { Ok(()) }
}
