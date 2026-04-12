use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use printpdf::{Mm, Op, PdfDocument, PdfPage, PdfSaveOptions, Pt, Px, RawImage, XObjectTransform};
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Deserialize)]
pub struct DirectPrintPayload {
    pub template_id: i64,
    pub total_items: i64,
    pub printer_id: String,
    pub copies: i64,
    pub calibration_json: String,
    pub payload_json: String,
    pub preview_png_base64: String,
    pub width_mm: f64,
    pub height_mm: f64,
    pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectPrintResult {
    pub job_id: i64,
    pub output_path: Option<String>,
}

#[tauri::command]
pub fn enqueue_print_job(
    payload: EnqueuePayload,
    state: tauri::State<AppState>,
) -> Result<i64, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db lock poisoned".to_string())?;
    let repo = JobRepository::new(&conn);
    repo.create(payload.template_id, payload.total_items)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn submit_print_task(
    payload: SubmitPrintTaskPayload,
    state: tauri::State<AppState>,
) -> Result<i64, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db lock poisoned".to_string())?;
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
pub fn list_system_printers() -> Result<Vec<String>, String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$names = New-Object System.Collections.Generic.HashSet[string]

try {
  Get-CimInstance Win32_Printer | ForEach-Object {
    if ($_.Name) { $null = $names.Add([string]$_.Name) }
  }
}
catch {}

try {
  Get-Printer | ForEach-Object {
    if ($_.Name) { $null = $names.Add([string]$_.Name) }
  }
}
catch {}

$sorted = @($names | Sort-Object)
$json = $sorted | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
[Console]::Out.Write([Convert]::ToBase64String($bytes))
"#;
    let output = run_powershell_script(script, &[])?;
    parse_printers_from_powershell_stdout(&output.stdout)
}

#[tauri::command]
pub fn submit_direct_print(
    payload: DirectPrintPayload,
    state: tauri::State<AppState>,
) -> Result<DirectPrintResult, String> {
    let preview_png = base64::engine::general_purpose::STANDARD
        .decode(payload.preview_png_base64.as_bytes())
        .map_err(|err| format!("invalid preview image base64: {err}"))?;
    if preview_png.is_empty() {
        return Err("empty preview image bytes".to_string());
    }

    let is_pdf_target = payload.printer_id.to_ascii_lowercase().contains("pdf");
    let output_pdf_path = if is_pdf_target {
        Some(build_default_pdf_output_path(&payload.title)?)
    } else {
        None
    };

    if let Some(output_path) = output_pdf_path.as_ref() {
        export_preview_image_to_pdf(
            &preview_png,
            output_path,
            payload.width_mm,
            payload.height_mm,
            &payload.title,
        )?;
    } else {
        let preview_image_path = build_temp_path("label-preview", "png");
        fs::write(&preview_image_path, &preview_png)
            .map_err(|err| format!("write preview image failed: {err}"))?;
        let print_result = print_preview_image(
            &preview_image_path,
            &payload.printer_id,
            payload.copies,
            payload.width_mm,
            payload.height_mm,
        );
        let _ = fs::remove_file(&preview_image_path);
        print_result?;
    }

    let conn = state
        .conn
        .lock()
        .map_err(|_| "db lock poisoned".to_string())?;
    let repo = JobRepository::new(&conn);
    let job_id = repo
        .create_with_metadata(
            payload.template_id,
            payload.total_items,
            &payload.printer_id,
            payload.copies,
            &payload.calibration_json,
            &payload.payload_json,
        )
        .map_err(|err| err.to_string())?;
    let _ = repo.set_status(job_id, "completed");

    Ok(DirectPrintResult {
        job_id,
        output_path: output_pdf_path.map(|path| path.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
pub fn pause_print_job(id: i64, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db lock poisoned".to_string())?;
    let repo = JobRepository::new(&conn);
    repo.set_status(id, "paused").map_err(|err| err.to_string())
}

#[tauri::command]
pub fn resume_print_job(id: i64, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db lock poisoned".to_string())?;
    let repo = JobRepository::new(&conn);
    repo.set_status(id, "running")
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn cancel_print_job(id: i64, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db lock poisoned".to_string())?;
    let repo = JobRepository::new(&conn);
    repo.set_status(id, "cancelled")
        .map_err(|err| err.to_string())
}

fn build_temp_path(prefix: &str, extension: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    path.push(format!(
        "{prefix}-{}-{millis}.{extension}",
        std::process::id()
    ));
    path
}

fn sanitize_file_stem(input: &str) -> String {
    let fallback = "label-output";
    let trimmed = input.trim();
    let source = if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    };

    let mut output = String::with_capacity(source.len());
    for ch in source.chars() {
        if matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
            output.push('_');
        } else {
            output.push(ch);
        }
    }
    let normalized = output.trim_matches(|ch: char| ch.is_whitespace() || ch == '.');
    if normalized.is_empty() {
        fallback.to_string()
    } else {
        normalized.to_string()
    }
}

fn build_default_pdf_output_path(title: &str) -> Result<PathBuf, String> {
    let mut candidate_dirs = Vec::new();
    if let Some(user_profile) = std::env::var_os("USERPROFILE") {
        let mut docs = PathBuf::from(user_profile);
        docs.push("Documents");
        docs.push("LabelPrint-PDF");
        candidate_dirs.push(docs);
    }
    let mut temp = std::env::temp_dir();
    temp.push("LabelPrint-PDF");
    candidate_dirs.push(temp);

    let mut selected_base: Option<PathBuf> = None;
    let mut last_error: Option<String> = None;
    for dir in candidate_dirs {
        match fs::create_dir_all(&dir) {
            Ok(_) => {
                selected_base = Some(dir);
                break;
            }
            Err(err) => {
                last_error = Some(format!(
                    "create pdf output directory failed at {}: {err}",
                    dir.display()
                ));
            }
        }
    }

    let mut base = selected_base.ok_or_else(|| {
        last_error.unwrap_or_else(|| "create pdf output directory failed".to_string())
    })?;
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let stem = sanitize_file_stem(title);
    base.push(format!("{stem}-{millis}.pdf"));
    Ok(base)
}

fn print_preview_image(
    image_path: &Path,
    printer_name: &str,
    copies: i64,
    width_mm: f64,
    height_mm: f64,
) -> Result<(), String> {
    let script = r#"
param(
  [string]$ImagePath,
  [string]$PrinterName,
  [int]$Copies,
  [double]$WidthMm,
  [double]$HeightMm
)

$ErrorActionPreference = 'Stop'

try {
  Add-Type -AssemblyName System.Drawing
}
catch {
  Add-Type -AssemblyName System.Drawing.Common
}

$image = [System.Drawing.Image]::FromFile($ImagePath)
$doc = $null

try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $PrinterName
  if (-not $doc.PrinterSettings.IsValid) {
    throw "Printer unavailable: $PrinterName"
  }

  $doc.PrinterSettings.Copies = [int16]([Math]::Max(1, $Copies))

  $paperWidth = [int]([Math]::Round($WidthMm / 25.4 * 100.0))
  $paperHeight = [int]([Math]::Round($HeightMm / 25.4 * 100.0))
  if ($paperWidth -lt 1) { $paperWidth = 1 }
  if ($paperHeight -lt 1) { $paperHeight = 1 }

  $paperSize = New-Object System.Drawing.Printing.PaperSize('LabelPrint', $paperWidth, $paperHeight)
  $doc.DefaultPageSettings.PaperSize = $paperSize
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $doc.OriginAtMargins = $false
  $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController

  $doc.add_PrintPage({
    param($sender, $eventArgs)
    $graphics = $eventArgs.Graphics
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($image, $eventArgs.PageBounds)
    $eventArgs.HasMorePages = $false
  })

  $doc.Print()
}
finally {
  if ($doc -ne $null) {
    $doc.Dispose()
  }
  if ($image -ne $null) {
    $image.Dispose()
  }
}
"#;

    let mut args = Vec::with_capacity(6);
    args.push(image_path.to_string_lossy().to_string());
    args.push(printer_name.to_string());
    args.push(copies.max(1).to_string());
    args.push(width_mm.max(1.0).to_string());
    args.push(height_mm.max(1.0).to_string());
    run_powershell_script(script, &args).map(|_| ())
}

const PDF_IMAGE_DPI: f32 = 300.0;

fn build_label_pdf_bytes_from_png(
    preview_png: &[u8],
    width_mm: f64,
    height_mm: f64,
    title: &str,
) -> Result<Vec<u8>, String> {
    let mut decode_warnings = Vec::new();
    let image = RawImage::decode_from_bytes(preview_png, &mut decode_warnings)
        .map_err(|err| format!("decode preview png failed: {err}"))?;
    if image.width == 0 || image.height == 0 {
        return Err("invalid preview image size".to_string());
    }

    let page_width = Mm(width_mm.max(1.0) as f32);
    let page_height = Mm(height_mm.max(1.0) as f32);
    let page_width_pt = Pt::from(page_width).0;
    let page_height_pt = Pt::from(page_height).0;
    if page_width_pt <= 0.0 || page_height_pt <= 0.0 {
        return Err("invalid label size for pdf export".to_string());
    }

    let image_width_pt = Px(image.width).into_pt(PDF_IMAGE_DPI).0;
    let image_height_pt = Px(image.height).into_pt(PDF_IMAGE_DPI).0;
    if image_width_pt <= 0.0 || image_height_pt <= 0.0 {
        return Err("invalid preview image dimensions".to_string());
    }

    let mut doc = PdfDocument::new(title);
    let image_id = doc.add_image(&image);
    let ops = vec![Op::UseXobject {
        id: image_id,
        transform: XObjectTransform {
            scale_x: Some(page_width_pt / image_width_pt),
            scale_y: Some(page_height_pt / image_height_pt),
            dpi: Some(PDF_IMAGE_DPI),
            ..Default::default()
        },
    }];

    let page = PdfPage::new(page_width, page_height, ops);
    let mut save_warnings = Vec::new();
    Ok(doc
        .with_pages(vec![page])
        .save(&PdfSaveOptions::default(), &mut save_warnings))
}

fn export_preview_image_to_pdf(
    preview_png: &[u8],
    output_pdf_path: &Path,
    width_mm: f64,
    height_mm: f64,
    title: &str,
) -> Result<(), String> {
    let pdf_bytes = build_label_pdf_bytes_from_png(preview_png, width_mm, height_mm, title)?;
    fs::write(output_pdf_path, pdf_bytes).map_err(|err| format!("write exported pdf failed: {err}"))
}

fn run_powershell_script(script: &str, args: &[String]) -> Result<std::process::Output, String> {
    let script_path = build_temp_path("label-print-script", "ps1");
    fs::write(&script_path, script)
        .map_err(|err| format!("write powershell script failed: {err}"))?;

    let mut command = Command::new("powershell");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&script_path);
    for arg in args {
        command.arg(arg);
    }

    let output = command
        .output()
        .map_err(|err| format!("execute powershell failed: {err}"));
    let _ = fs::remove_file(&script_path);

    let output = output?;
    if output.status.success() {
        return Ok(output);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let message = if !stderr.trim().is_empty() {
        stderr.trim().to_string()
    } else if !stdout.trim().is_empty() {
        stdout.trim().to_string()
    } else {
        format!("powershell exited with status {}", output.status)
    };
    Err(message)
}

fn parse_printers_from_powershell_stdout(stdout: &[u8]) -> Result<Vec<String>, String> {
    let stdout_text = String::from_utf8_lossy(stdout);
    let encoded = stdout_text.trim();
    if encoded.is_empty() {
        return Ok(Vec::new());
    }

    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded.as_bytes())
        .map_err(|err| format!("decode printer list failed: {err}"))?;
    let parsed: Vec<String> = serde_json::from_slice(&decoded)
        .map_err(|err| format!("parse printer list json failed: {err}"))?;

    let mut seen = HashSet::new();
    let mut printers = Vec::new();
    for item in parsed {
        let name = item.trim();
        if name.is_empty() {
            continue;
        }
        if seen.insert(name.to_string()) {
            printers.push(name.to_string());
        }
    }
    Ok(printers)
}

#[cfg(test)]
mod tests {
    use super::{build_label_pdf_bytes_from_png, parse_printers_from_powershell_stdout};
    use base64::Engine;

    #[test]
    fn parses_chinese_printer_name_without_mojibake() {
        let json =
            r#"["Brother MFC-7360 Printer","\u5bfc\u51fa\u4e3aWPS PDF","Microsoft Print to PDF"]"#;
        let output = base64::engine::general_purpose::STANDARD.encode(json.as_bytes());
        let parsed = parse_printers_from_powershell_stdout(output.as_bytes())
            .expect("should parse printer output");
        assert_eq!(
            parsed,
            vec![
                "Brother MFC-7360 Printer".to_string(),
                "\u{5bfc}\u{51fa}\u{4e3a}WPS PDF".to_string(),
                "Microsoft Print to PDF".to_string()
            ]
        );
    }

    #[test]
    fn keeps_unique_non_empty_printer_names() {
        let json = r#"["\u5bfc\u51fa\u4e3aWPS PDF"," ","\u5bfc\u51fa\u4e3aWPS PDF","Microsoft Print to PDF"]"#;
        let output = base64::engine::general_purpose::STANDARD.encode(json.as_bytes());
        let parsed = parse_printers_from_powershell_stdout(output.as_bytes())
            .expect("should parse printer output");
        assert_eq!(
            parsed,
            vec![
                "\u{5bfc}\u{51fa}\u{4e3a}WPS PDF".to_string(),
                "Microsoft Print to PDF".to_string()
            ]
        );
    }

    #[test]
    fn builds_pdf_bytes_from_png_for_label_size() {
        let one_pixel_png = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49,
            0x44, 0x41, 0x54, // IDAT
            0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND
            0xAE, 0x42, 0x60, 0x82,
        ];
        let pdf = build_label_pdf_bytes_from_png(&one_pixel_png, 40.0, 30.0, "test-label")
            .expect("should build pdf bytes");
        assert!(pdf.starts_with(b"%PDF-"), "output is not pdf");
        assert!(pdf.len() > 100, "pdf bytes too small");
    }
}
