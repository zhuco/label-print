pub mod commands;
pub mod db;
pub mod repo;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{Emitter, Manager};
use url::Url;

pub struct AppState {
    pub conn: Mutex<Connection>,
    pub pending_launch_files: Mutex<Vec<String>>,
}

const LAUNCH_FILES_EVENT: &str = "launch-files";

fn is_supported_launch_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("lpt") | Some("json") | Some("ddl")
    )
}

fn trim_wrapped_quotes(value: &str) -> &str {
    let trimmed = value.trim();
    if trimmed.len() >= 2
        && ((trimmed.starts_with('"') && trimmed.ends_with('"'))
            || (trimmed.starts_with('\'') && trimmed.ends_with('\'')))
    {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    }
}

fn decode_launch_arg_path(raw: &str) -> Option<PathBuf> {
    let trimmed = trim_wrapped_quotes(raw);
    if trimmed.is_empty() || trimmed == "--" {
        return None;
    }
    if let Ok(url) = Url::parse(trimmed) {
        if url.scheme().eq_ignore_ascii_case("file") {
            return url.to_file_path().ok();
        }
    }
    Some(PathBuf::from(trimmed))
}

fn collect_launch_files_from_args_with_base<I, S>(args: I, base_dir: Option<&Path>) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut seen = HashSet::new();
    let mut files = Vec::new();

    for arg in args {
        let Some(mut path) = decode_launch_arg_path(arg.as_ref()) else {
            continue;
        };
        if !path.is_absolute() {
            if let Some(base) = base_dir {
                path = base.join(path);
            }
        }
        if !path.is_file() || !is_supported_launch_file(&path) {
            continue;
        }

        let normalized = path
            .canonicalize()
            .unwrap_or(path)
            .to_string_lossy()
            .into_owned();
        if seen.insert(normalized.clone()) {
            files.push(normalized);
        }
    }

    files
}

fn collect_launch_files_from_args<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let base_dir = std::env::current_dir().ok();
    collect_launch_files_from_args_with_base(args, base_dir.as_deref())
}

fn collect_launch_files() -> Vec<String> {
    collect_launch_files_from_args(std::env::args().skip(1))
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // `show` does not always restore a minimized window on Windows.
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        #[cfg(target_os = "windows")]
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
    }
}

fn append_pending_launch_files(app: &tauri::AppHandle, launch_files: &[String]) {
    if launch_files.is_empty() {
        return;
    }

    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let Ok(mut pending) = state.pending_launch_files.lock() else {
        return;
    };

    let mut seen: HashSet<String> = pending.iter().cloned().collect();
    for path in launch_files {
        if seen.insert(path.clone()) {
            pending.push(path.clone());
        }
    }
}

pub fn run() {
    let conn = db::open_or_create("label-print.db").expect("database should open");
    let launch_files = collect_launch_files();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let launch_files =
                collect_launch_files_from_args_with_base(args, Some(Path::new(cwd.as_str())));
            append_pending_launch_files(app, &launch_files);
            let payloads = commands::launch_commands::build_launch_file_payloads(launch_files);
            if !payloads.is_empty() {
                let _ = app.emit(LAUNCH_FILES_EVENT, payloads);
            }
            focus_main_window(app);
        }))
        .manage(AppState {
            conn: Mutex::new(conn),
            pending_launch_files: Mutex::new(launch_files),
        })
        .invoke_handler(tauri::generate_handler![
            commands::font_commands::list_system_fonts,
            commands::launch_commands::consume_launch_files,
            commands::template_commands::open_template_file,
            commands::template_commands::save_template,
            commands::template_commands::save_template_file,
            commands::template_commands::list_templates,
            commands::print_commands::enqueue_print_job,
            commands::print_commands::submit_print_task,
            commands::print_commands::list_system_printers,
            commands::print_commands::submit_direct_print,
            commands::print_commands::pause_print_job,
            commands::print_commands::resume_print_job,
            commands::print_commands::cancel_print_job,
            commands::window_commands::window_minimize,
            commands::window_commands::window_toggle_maximize,
            commands::window_commands::window_close,
            commands::window_commands::window_start_drag,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{collect_launch_files_from_args, collect_launch_files_from_args_with_base};
    use std::path::Path;
    use url::Url;

    #[test]
    fn collects_existing_files_from_launch_args() {
        let temp_dir = tempfile::tempdir().expect("temp dir should create");
        let first = temp_dir.path().join("first.lpt");
        let second = temp_dir.path().join("second.json");
        let unsupported = temp_dir.path().join("third.txt");
        std::fs::write(&first, b"first").expect("first file should write");
        std::fs::write(&second, b"second").expect("second file should write");
        std::fs::write(&unsupported, b"third").expect("third file should write");

        let args = vec![
            "--flag".to_string(),
            first.to_string_lossy().to_string(),
            "not-exist.lpt".to_string(),
            unsupported.to_string_lossy().to_string(),
            second.to_string_lossy().to_string(),
            first.to_string_lossy().to_string(),
        ];

        let files = collect_launch_files_from_args(args);
        assert_eq!(files.len(), 2);
        assert!(files.iter().any(|item| item.ends_with("first.lpt")));
        assert!(files.iter().any(|item| item.ends_with("second.json")));
        assert!(!files.iter().any(|item| item.ends_with("third.txt")));
    }

    #[test]
    fn collects_files_from_quoted_uri_and_relative_args() {
        let temp_dir = tempfile::tempdir().expect("temp dir should create");
        let file_path = temp_dir.path().join("quoted.lpt");
        std::fs::write(&file_path, b"quoted").expect("file should write");

        let quoted_arg = format!("\"{}\"", file_path.to_string_lossy());
        let file_uri = Url::from_file_path(&file_path)
            .expect("file uri should build")
            .to_string();
        let relative = file_path
            .file_name()
            .and_then(|value| value.to_str())
            .expect("file name should be utf-8")
            .to_string();

        let from_quoted = collect_launch_files_from_args(vec![quoted_arg]);
        assert_eq!(from_quoted.len(), 1);
        assert!(from_quoted[0].ends_with("quoted.lpt"));

        let from_uri = collect_launch_files_from_args(vec![file_uri]);
        assert_eq!(from_uri.len(), 1);
        assert!(from_uri[0].ends_with("quoted.lpt"));

        let from_relative = collect_launch_files_from_args_with_base(vec![relative], Some(Path::new(temp_dir.path())));
        assert_eq!(from_relative.len(), 1);
        assert!(from_relative[0].ends_with("quoted.lpt"));
    }
}
