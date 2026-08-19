use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::AppState;

const CUSTOM_PRESET_LIMIT: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomPresetDto {
    pub id: String,
    #[serde(default = "default_schema_version")]
    pub schema_version: i64,
    pub name: String,
    pub category: String,
    pub elements: Vec<Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn default_schema_version() -> i64 {
    1
}

#[tauri::command]
pub fn custom_presets_list(state: tauri::State<AppState>) -> Result<Vec<CustomPresetDto>, String> {
    let conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let mut statement = conn
        .prepare(
            "SELECT id, schema_version, name, category, content_json, created_at, updated_at
             FROM custom_presets ORDER BY updated_at DESC LIMIT ?1",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![CUSTOM_PRESET_LIMIT], |row| {
            let content: String = row.get(4)?;
            Ok(CustomPresetDto {
                id: row.get(0)?,
                schema_version: row.get(1)?,
                name: row.get(2)?,
                category: row.get(3)?,
                elements: serde_json::from_str(&content).unwrap_or_default(),
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn custom_presets_replace_all(
    presets: Vec<CustomPresetDto>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
    let transaction = conn.transaction().map_err(|error| error.to_string())?;
    transaction.execute("DELETE FROM custom_presets", []).map_err(|error| error.to_string())?;
    for preset in presets.into_iter().take(CUSTOM_PRESET_LIMIT) {
        if preset.id.trim().is_empty()
            || preset.name.trim().is_empty()
            || preset.category.trim().is_empty()
            || preset.elements.is_empty()
            || preset.schema_version != 1
            || preset.created_at < 0
            || preset.updated_at < 0
        {
            continue;
        }
        let elements = serde_json::to_string(&preset.elements).map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO custom_presets
                (id, schema_version, name, category, content_json, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    preset.id,
                    preset.schema_version,
                    preset.name,
                    preset.category,
                    elements,
                    preset.created_at,
                    preset.updated_at,
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}
