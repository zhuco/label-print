#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--ocr-sidecar") {
        std::process::exit(label_desktop::run_ocr_sidecar());
    }
    label_desktop::run();
}
