use std::collections::HashSet;
use std::fs;
#[cfg(target_os = "windows")]
use std::mem::{size_of, MaybeUninit};
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(target_os = "windows")]
use std::ptr;
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
    pub preview_png_base64s: Vec<String>,
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
pub fn reveal_pdf_output(path: String) -> Result<(), String> {
    let file_path = PathBuf::from(path.trim());
    if !file_path.is_file() {
        return Err(format!("PDF file does not exist: {}", file_path.display()));
    }

    #[cfg(target_os = "windows")]
    {
        // Explorer's select mode makes the generated file visible immediately,
        // without opening another application or modifying the PDF.
        Command::new("explorer.exe")
            .arg(format!("/select,{}", file_path.display()))
            .spawn()
            .map_err(|err| format!("open PDF output folder failed: {err}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = file_path;
        Err("opening the PDF output folder is only supported on Windows".to_string())
    }
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
    #[cfg(target_os = "windows")]
    {
        // Use the native spooler API first. It is present on Windows 7 and does
        // not require PowerShell, WMI, or a separately installed module.
        let printers = list_printers_from_winspool()?;
        if !printers.is_empty() {
            return Ok(printers);
        }
    }

    list_printers_with_powershell()
}

fn list_printers_with_powershell() -> Result<Vec<String>, String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$names = New-Object System.Collections.Generic.HashSet[string]

try {
  Get-CimInstance Win32_Printer | ForEach-Object {
    if ($_.Name) { $null = $names.Add([string]$_.Name) }
  }
}
catch {}

# Windows 7 ships with PowerShell 2.0: it has Get-WmiObject, but not
# Get-CimInstance or the PrintManagement module used by Get-Printer.
try {
  Get-WmiObject -Class Win32_Printer | ForEach-Object {
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

# Keep a second legacy-compatible source for systems where WMI is unavailable.
try {
  Add-Type -AssemblyName System.Drawing
  [System.Drawing.Printing.PrinterSettings]::InstalledPrinters | ForEach-Object {
    if ($_ ) { $null = $names.Add([string]$_) }
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

#[cfg(target_os = "windows")]
#[repr(C)]
struct PrinterInfo4W {
    printer_name: *const u16,
    server_name: *const u16,
    attributes: u32,
}

#[cfg(target_os = "windows")]
#[link(name = "Winspool")]
extern "system" {
    fn EnumPrintersW(
        flags: u32,
        name: *const u16,
        level: u32,
        printer_enum: *mut u8,
        cb_buf: u32,
        pcb_needed: *mut u32,
        pc_returned: *mut u32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
fn list_printers_from_winspool() -> Result<Vec<String>, String> {
    const PRINTER_ENUM_LOCAL: u32 = 0x0000_0002;
    const PRINTER_ENUM_CONNECTIONS: u32 = 0x0000_0004;
    const PRINTER_INFO_LEVEL: u32 = 4;

    let mut needed_bytes = 0_u32;
    let mut returned = 0_u32;
    unsafe {
        EnumPrintersW(
            PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS,
            ptr::null(),
            PRINTER_INFO_LEVEL,
            ptr::null_mut(),
            0,
            &mut needed_bytes,
            &mut returned,
        );
    }
    if needed_bytes == 0 {
        return Ok(Vec::new());
    }

    let entry_size = size_of::<PrinterInfo4W>();
    let entry_capacity = (needed_bytes as usize).div_ceil(entry_size);
    let mut buffer = Vec::<MaybeUninit<PrinterInfo4W>>::with_capacity(entry_capacity);
    unsafe {
        buffer.set_len(entry_capacity);
    }

    let success = unsafe {
        EnumPrintersW(
            PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS,
            ptr::null(),
            PRINTER_INFO_LEVEL,
            buffer.as_mut_ptr().cast::<u8>(),
            needed_bytes,
            &mut needed_bytes,
            &mut returned,
        )
    };
    if success == 0 {
        return Err("Windows printer spooler enumeration failed".to_string());
    }
    if returned as usize > entry_capacity {
        return Err("Windows printer spooler returned invalid data".to_string());
    }

    let entries = unsafe {
        std::slice::from_raw_parts(buffer.as_ptr().cast::<PrinterInfo4W>(), returned as usize)
    };
    let mut printers = entries
        .iter()
        .filter_map(|entry| unsafe { wide_string_from_ptr(entry.printer_name) })
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect::<Vec<_>>();
    printers.sort_unstable();
    printers.dedup();
    Ok(printers)
}

#[cfg(target_os = "windows")]
unsafe fn wide_string_from_ptr(value: *const u16) -> Option<String> {
    const MAX_PRINTER_NAME_UNITS: usize = 32_768;
    if value.is_null() {
        return None;
    }
    let len = (0..MAX_PRINTER_NAME_UNITS).find(|&index| unsafe { *value.add(index) == 0 })?;
    Some(String::from_utf16_lossy(unsafe {
        std::slice::from_raw_parts(value, len)
    }))
}

#[tauri::command]
pub fn submit_direct_print(
    payload: DirectPrintPayload,
    state: tauri::State<AppState>,
) -> Result<DirectPrintResult, String> {
    let preview_pngs = payload
        .preview_png_base64s
        .iter()
        .enumerate()
        .map(|(index, encoded)| {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(encoded.as_bytes())
                .map_err(|err| format!("invalid preview image base64 for record {}: {err}", index + 1))?;
            if decoded.is_empty() {
                return Err(format!("empty preview image bytes for record {}", index + 1));
            }
            Ok(decoded)
        })
        .collect::<Result<Vec<_>, _>>()?;
    if preview_pngs.is_empty() {
        return Err("at least one preview image is required".to_string());
    }

    let is_pdf_target = payload.printer_id.to_ascii_lowercase().contains("pdf");
    let output_pdf_path = if is_pdf_target {
        Some(build_default_pdf_output_path(&payload.title)?)
    } else {
        None
    };

    if let Some(output_path) = output_pdf_path.as_ref() {
        export_preview_images_to_pdf(
            &preview_pngs,
            output_path,
            payload.width_mm,
            payload.height_mm,
            &payload.title,
            payload.copies,
        )?;
    } else {
        print_preview_images(
            &preview_pngs,
            &payload.printer_id,
            payload.copies,
            payload.width_mm,
            payload.height_mm,
        )?;
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

fn print_preview_images(
    preview_pngs: &[Vec<u8>],
    printer_name: &str,
    copies: i64,
    width_mm: f64,
    height_mm: f64,
) -> Result<(), String> {
    let mut preview_image_paths = Vec::with_capacity(preview_pngs.len());
    for (index, preview_png) in preview_pngs.iter().enumerate() {
        let preview_image_path = build_temp_path(&format!("label-preview-{}", index + 1), "png");
        if let Err(err) = fs::write(&preview_image_path, preview_png) {
            for path in preview_image_paths {
                let _ = fs::remove_file(path);
            }
            return Err(format!("write preview image for record {} failed: {err}", index + 1));
        }
        preview_image_paths.push(preview_image_path);
    }

    // Submit the whole batch through one PrintDocument. Starting PowerShell and
    // loading System.Drawing once per record made larger print jobs feel stuck.
    let print_result = print_preview_image_files(
        &preview_image_paths,
        printer_name,
        copies,
        width_mm,
        height_mm,
    );
    for path in preview_image_paths {
        let _ = fs::remove_file(path);
    }
    print_result
}

fn print_preview_image_files(
    image_paths: &[PathBuf],
    printer_name: &str,
    copies: i64,
    width_mm: f64,
    height_mm: f64,
) -> Result<(), String> {
    let script = r#"
param(
  [string]$ImagePathsBase64,
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

$pathsText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ImagePathsBase64))
$imagePaths = @($pathsText.Split([char]10) | Where-Object { $_ -ne '' })
if ($imagePaths.Count -eq 0) {
  throw 'No preview images were provided.'
}

$doc = $null
$script:pageIndex = 0
$script:currentImage = $null

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
    if ($script:currentImage -ne $null) {
      $script:currentImage.Dispose()
      $script:currentImage = $null
    }
    $script:currentImage = [System.Drawing.Image]::FromFile([string]$imagePaths[$script:pageIndex])
    try {
      $graphics = $eventArgs.Graphics
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($script:currentImage, $eventArgs.PageBounds)
      $script:pageIndex += 1
      $eventArgs.HasMorePages = $script:pageIndex -lt $imagePaths.Count
    }
    finally {
      if (-not $eventArgs.HasMorePages -and $script:currentImage -ne $null) {
        $script:currentImage.Dispose()
        $script:currentImage = $null
      }
    }
  })

  $doc.Print()
}
finally {
  if ($doc -ne $null) {
    $doc.Dispose()
  }
  if ($script:currentImage -ne $null) {
    $script:currentImage.Dispose()
    $script:currentImage = $null
  }
}
"#;

    let encoded_paths = base64::engine::general_purpose::STANDARD.encode(
        image_paths
            .iter()
            .map(|path| path.to_string_lossy())
            .collect::<Vec<_>>()
            .join("\n")
            .as_bytes(),
    );
    let mut args = Vec::with_capacity(6);
    args.push(encoded_paths);
    args.push(printer_name.to_string());
    args.push(copies.max(1).to_string());
    args.push(width_mm.max(1.0).to_string());
    args.push(height_mm.max(1.0).to_string());
    run_powershell_script(script, &args).map(|_| ())
}

const PDF_IMAGE_DPI: f32 = 300.0;

fn build_label_pdf_bytes_from_pngs(
    preview_pngs: &[Vec<u8>],
    width_mm: f64,
    height_mm: f64,
    title: &str,
    copies: i64,
) -> Result<Vec<u8>, String> {
    if preview_pngs.is_empty() {
        return Err("at least one preview image is required".to_string());
    }

    let page_width = Mm(width_mm.max(1.0) as f32);
    let page_height = Mm(height_mm.max(1.0) as f32);
    let page_width_pt = Pt::from(page_width).0;
    let page_height_pt = Pt::from(page_height).0;
    if page_width_pt <= 0.0 || page_height_pt <= 0.0 {
        return Err("invalid label size for pdf export".to_string());
    }

    let mut doc = PdfDocument::new(title);
    let mut pages = Vec::with_capacity(preview_pngs.len() * copies.max(1) as usize);
    for (index, preview_png) in preview_pngs.iter().enumerate() {
        let mut decode_warnings = Vec::new();
        let image = RawImage::decode_from_bytes(preview_png, &mut decode_warnings)
            .map_err(|err| format!("decode preview png for record {} failed: {err}", index + 1))?;
        if image.width == 0 || image.height == 0 {
            return Err(format!("invalid preview image size for record {}", index + 1));
        }
        let image_width_pt = Px(image.width).into_pt(PDF_IMAGE_DPI).0;
        let image_height_pt = Px(image.height).into_pt(PDF_IMAGE_DPI).0;
        if image_width_pt <= 0.0 || image_height_pt <= 0.0 {
            return Err(format!("invalid preview image dimensions for record {}", index + 1));
        }
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
        for _ in 0..copies.max(1) {
            pages.push(PdfPage::new(page_width, page_height, ops.clone()));
        }
    }
    let mut save_warnings = Vec::new();
    Ok(doc
        .with_pages(pages)
        .save(&PdfSaveOptions::default(), &mut save_warnings))
}

fn export_preview_images_to_pdf(
    preview_pngs: &[Vec<u8>],
    output_pdf_path: &Path,
    width_mm: f64,
    height_mm: f64,
    title: &str,
    copies: i64,
) -> Result<(), String> {
    let pdf_bytes = build_label_pdf_bytes_from_pngs(preview_pngs, width_mm, height_mm, title, copies)?;
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
    use super::{build_label_pdf_bytes_from_pngs, parse_printers_from_powershell_stdout};
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
        let pdf = build_label_pdf_bytes_from_pngs(&[one_pixel_png], 40.0, 30.0, "test-label", 1)
            .expect("should build pdf bytes");
        assert!(pdf.starts_with(b"%PDF-"), "output is not pdf");
        assert!(pdf.len() > 100, "pdf bytes too small");
    }

    #[test]
    fn builds_one_pdf_page_per_record_and_copy() {
        let one_pixel_png = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00,
            0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63,
            0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00,
            0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        let pdf = build_label_pdf_bytes_from_pngs(
            &[one_pixel_png.clone(), one_pixel_png],
            40.0,
            30.0,
            "batch-label",
            2,
        ).expect("should build a multi-page pdf");
        let page_markers = pdf.windows(b"/Type /Page".len()).count();
        assert!(page_markers >= 4, "expected four rendered pages, found {page_markers}");
    }
}
