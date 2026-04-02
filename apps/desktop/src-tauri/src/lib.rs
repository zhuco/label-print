pub mod commands;
pub mod db;
pub mod repo;

use std::sync::Mutex;

use rusqlite::Connection;

pub struct AppState {
    pub conn: Mutex<Connection>,
}

pub fn run() {
    let conn = db::open_or_create("label-print.db").expect("database should open");

    tauri::Builder::default()
        .manage(AppState {
            conn: Mutex::new(conn),
        })
        .invoke_handler(tauri::generate_handler![
            commands::template_commands::save_template,
            commands::template_commands::list_templates,
            commands::print_commands::enqueue_print_job,
            commands::print_commands::pause_print_job,
            commands::print_commands::resume_print_job,
            commands::print_commands::cancel_print_job,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}