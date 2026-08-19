use std::collections::{BTreeSet, HashMap};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontDto {
    pub family: String,
    pub aliases: Vec<String>,
    pub postscript_name: Option<String>,
}

#[derive(Debug, Default)]
struct FontAggregate {
    family: String,
    aliases: BTreeSet<String>,
    postscript_name: Option<String>,
}

#[tauri::command]
pub fn list_system_fonts() -> Vec<SystemFontDto> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();

    let mut fonts: HashMap<String, FontAggregate> = HashMap::new();

    for face in db.faces() {
        let mut names: Vec<String> = face
            .families
            .iter()
            .map(|(name, _)| name.trim())
            .filter(|name| !name.is_empty())
            .map(ToOwned::to_owned)
            .collect();

        if names.is_empty() {
            continue;
        }

        names.sort();
        names.dedup();

        let family = names[0].clone();
        let key = family.to_lowercase();

        let aggregate = fonts.entry(key).or_insert_with(|| FontAggregate {
            family: family.clone(),
            aliases: BTreeSet::new(),
            postscript_name: None,
        });

        for name in names {
            aggregate.aliases.insert(name);
        }

        if aggregate.postscript_name.is_none() {
            let postscript = face.post_script_name.trim();
            if !postscript.is_empty() {
                aggregate.postscript_name = Some(postscript.to_owned());
            }
        }
    }

    let mut rows: Vec<SystemFontDto> = fonts
        .into_values()
        .map(|item| SystemFontDto {
            family: item.family,
            aliases: item.aliases.into_iter().collect(),
            postscript_name: item.postscript_name,
        })
        .collect();

    rows.sort_by(|left, right| left.family.to_lowercase().cmp(&right.family.to_lowercase()));
    rows
}
