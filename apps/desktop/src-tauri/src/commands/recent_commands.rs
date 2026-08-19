use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::AppState;

const RECENT_TEMPLATE_LIMIT: usize = 24;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentTemplateItem {
    pub id: String,
    pub file_name: String,
    #[serde(default = "default_recent_source")]
    pub source: String,
    pub file_path: Option<String>,
    #[serde(default)]
    pub cloud_label_id: Option<String>,
    pub saved: bool,
    pub opened_at: i64,
    pub snapshot: Value,
}

fn default_recent_source() -> String {
    "local".to_string()
}

#[tauri::command]
pub fn recent_templates_list(
    state: tauri::State<AppState>,
) -> Result<Vec<RecentTemplateItem>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db lock poisoned".to_string())?;
    let mut statement = conn
        .prepare(
            "SELECT id, file_name, source, file_path, cloud_label_id, opened_at, snapshot_json
         FROM recent_template_snapshots ORDER BY opened_at DESC LIMIT ?1",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![RECENT_TEMPLATE_LIMIT], |row| {
            let snapshot: String = row.get(6)?;
            Ok(RecentTemplateItem {
                id: row.get(0)?,
                file_name: row.get(1)?,
                source: row.get(2)?,
                file_path: row.get(3)?,
                cloud_label_id: row.get(4)?,
                saved: true,
                opened_at: row.get(5)?,
                snapshot: serde_json::from_str(&snapshot).unwrap_or(Value::Null),
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn recent_templates_replace_all(
    items: Vec<RecentTemplateItem>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "db lock poisoned".to_string())?;
    let transaction = conn.transaction().map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM recent_template_snapshots", [])
        .map_err(|error| error.to_string())?;
    for item in items.into_iter().take(RECENT_TEMPLATE_LIMIT) {
        let source = if item.source == "cloud" {
            "cloud"
        } else {
            "local"
        };
        let cloud_label_id = item.cloud_label_id.filter(|value| !value.trim().is_empty());
        if item.id.trim().is_empty()
            || item.file_name.trim().is_empty()
            || !item.saved
            || item.opened_at < 0
            || (source == "cloud" && cloud_label_id.is_none())
        {
            continue;
        }
        let snapshot = serde_json::to_string(&item.snapshot).map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO recent_template_snapshots
             (id, file_name, source, file_path, cloud_label_id, opened_at, snapshot_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    item.id,
                    item.file_name,
                    source,
                    item.file_path,
                    cloud_label_id,
                    item.opened_at,
                    snapshot
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}
