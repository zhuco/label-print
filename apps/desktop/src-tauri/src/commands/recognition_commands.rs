use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct RecognizeImagePayload {
    pub image_data_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecognizedBbox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRecognizedItem {
    pub kind: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    pub confidence: f64,
    pub bbox: RecognizedBbox,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecognizeImageResult {
    pub image_width: u32,
    pub image_height: u32,
    pub items: Vec<NativeRecognizedItem>,
    pub warnings: Vec<String>,
    pub backend: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OcrSidecarRequest {
    id: u64,
    image_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OcrSidecarResponse {
    id: u64,
    #[serde(default)]
    items: Vec<crate::ocr_sidecar::SidecarTextItem>,
    #[serde(default)]
    error: Option<String>,
}

struct OcrSidecarClient {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_request_id: u64,
}

static OCR_SIDECAR_CLIENT: OnceLock<Mutex<Option<OcrSidecarClient>>> = OnceLock::new();

#[tauri::command]
pub async fn recognize_image_native(
    payload: RecognizeImagePayload,
) -> Result<RecognizeImageResult, String> {
    let image_bytes = decode_image_data_url(&payload.image_data_url)?;
    let image = image::load_from_memory(&image_bytes)
        .map_err(|err| format!("decode image bytes failed: {err}"))?;
    let (image_width, image_height) = image.dimensions();
    if image_width == 0 || image_height == 0 {
        return Err("invalid image size".to_string());
    }

    let mut warnings = Vec::new();
    let mut items = Vec::new();

    let barcode_items = detect_barcode_items(&image, &image_bytes, image_width, image_height);
    if barcode_items.is_empty() {
        warnings.push("本地条码引擎未识别到条码。".to_string());
    }
    items.extend(barcode_items);

    match detect_text_items(&image_bytes, image_width, image_height) {
        Ok(found) => {
            if found.is_empty() {
                warnings.push("本地 OCR 未识别到明显文字。".to_string());
            }
            items.extend(found);
        }
        Err(err) => {
            warnings.push(format!("本地 OCR 调用失败，已回退前端 OCR：{err}"));
        }
    }

    Ok(RecognizeImageResult {
        image_width,
        image_height,
        items,
        warnings,
        backend: "native(ocr-sidecar + bardecoder/rqrr)".to_string(),
    })
}

fn decode_image_data_url(value: &str) -> Result<Vec<u8>, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("image payload is empty".to_string());
    }

    let encoded = if trimmed.starts_with("data:") {
        let (header, body) = trimmed
            .split_once(',')
            .ok_or_else(|| "invalid data url payload".to_string())?;
        if !header.contains(";base64") {
            return Err("image data url must be base64 encoded".to_string());
        }
        body
    } else {
        trimmed
    };

    STANDARD
        .decode(encoded.as_bytes())
        .map_err(|err| format!("decode image base64 failed: {err}"))
}

fn detect_barcode_items(
    image: &DynamicImage,
    image_bytes: &[u8],
    image_width: u32,
    image_height: u32,
) -> Vec<NativeRecognizedItem> {
    let mut items = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(legacy_image) = image24::load_from_memory(image_bytes) {
        let decoder = bardecoder::default_decoder();
        for result in decoder.decode(&legacy_image) {
            let Ok(raw_text) = result else {
                continue;
            };
            let text = raw_text.trim();
            if text.is_empty() {
                continue;
            }
            let dedupe_key = format!("barcode:{text}");
            if !seen.insert(dedupe_key) {
                continue;
            }
            items.push(NativeRecognizedItem {
                kind: "barcode".to_string(),
                text: text.to_string(),
                format: Some("CODE128".to_string()),
                confidence: 0.86,
                bbox: centered_bbox(image_width, image_height, 0.74, 0.24),
            });
        }
    }

    let mut prepared = rqrr::PreparedImage::prepare(image.to_luma8());
    let grids = prepared.detect_grids();
    for grid in grids {
        let Ok((_meta, raw_text)) = grid.decode() else {
            continue;
        };
        let text = raw_text.trim();
        if text.is_empty() {
            continue;
        }
        let dedupe_key = format!("qrcode:{text}");
        if !seen.insert(dedupe_key) {
            continue;
        }
        items.push(NativeRecognizedItem {
            kind: "qrcode".to_string(),
            text: text.to_string(),
            format: Some("QR_CODE".to_string()),
            confidence: 0.92,
            bbox: centered_bbox(image_width, image_height, 0.5, 0.5),
        });
    }

    items
}

fn detect_text_items(
    image_bytes: &[u8],
    image_width: u32,
    image_height: u32,
) -> Result<Vec<NativeRecognizedItem>, String> {
    if let Ok(items) = detect_text_items_via_sidecar(image_bytes, image_width, image_height) {
        return Ok(items);
    }
    run_tesseract_text_items(image_bytes, image_width, image_height)
}

fn detect_text_items_via_sidecar(
    image_bytes: &[u8],
    image_width: u32,
    image_height: u32,
) -> Result<Vec<NativeRecognizedItem>, String> {
    let client_lock = OCR_SIDECAR_CLIENT.get_or_init(|| Mutex::new(None));
    let mut guard = client_lock
        .lock()
        .map_err(|_| "ocr sidecar lock poisoned".to_string())?;

    if guard.is_none() {
        *guard = Some(OcrSidecarClient::spawn()?);
    }

    let items = match guard.as_mut() {
        Some(client) => match client.recognize(image_bytes) {
            Ok(items) => items,
            Err(error) => {
                *guard = None;
                return Err(error);
            }
        },
        None => return Err("ocr sidecar is unavailable".to_string()),
    };

    let mapped = items
        .into_iter()
        .filter_map(|item| {
            let text = item.text.trim();
            if text.is_empty() {
                return None;
            }
            Some(NativeRecognizedItem {
                kind: "text".to_string(),
                text: text.to_string(),
                format: None,
                confidence: item.confidence.clamp(0.0, 1.0),
                bbox: clamp_bbox(
                    item.bbox.x,
                    item.bbox.y,
                    item.bbox.width,
                    item.bbox.height,
                    image_width,
                    image_height,
                ),
            })
        })
        .collect();

    Ok(mapped)
}

fn run_tesseract_text_items(
    image_bytes: &[u8],
    image_width: u32,
    image_height: u32,
) -> Result<Vec<NativeRecognizedItem>, String> {
    let image_path = build_temp_path("label-ocr", "img");
    fs::write(&image_path, image_bytes)
        .map_err(|err| format!("write ocr temp image failed: {err}"))?;

    let tesseract_bin = std::env::var("LABEL_TESSERACT_BIN")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "tesseract".to_string());
    let image_path_arg = image_path.to_string_lossy().into_owned();

    let output = run_hidden_command(
        &tesseract_bin,
        &[&image_path_arg, "stdout", "-l", "chi_sim+eng", "tsv"],
    );

    let _ = fs::remove_file(&image_path);

    let output = output.map_err(|err| format!("execute tesseract failed: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let reason = stderr.trim();
        if reason.is_empty() {
            return Err(format!("tesseract exited with status {}", output.status));
        }
        return Err(reason.to_string());
    }

    let tsv = String::from_utf8(output.stdout)
        .map_err(|err| format!("parse tesseract stdout failed: {err}"))?;
    Ok(parse_tesseract_tsv(&tsv, image_width, image_height))
}

impl OcrSidecarClient {
    fn spawn() -> Result<Self, String> {
        let executable = std::env::current_exe()
            .map_err(|error| format!("resolve current executable failed: {error}"))?;
        let mut command = Command::new(executable);
        command
            .arg("--ocr-sidecar")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command
            .spawn()
            .map_err(|error| format!("spawn ocr sidecar failed: {error}"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "ocr sidecar stdin unavailable".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "ocr sidecar stdout unavailable".to_string())?;

        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_request_id: 1,
        })
    }

    fn recognize(
        &mut self,
        image_bytes: &[u8],
    ) -> Result<Vec<crate::ocr_sidecar::SidecarTextItem>, String> {
        if self
            .child
            .try_wait()
            .map_err(|error| format!("check ocr sidecar status failed: {error}"))?
            .is_some()
        {
            return Err("ocr sidecar already exited".to_string());
        }

        let request_id = self.next_request_id;
        self.next_request_id = self.next_request_id.saturating_add(1);
        let payload = OcrSidecarRequest {
            id: request_id,
            image_base64: STANDARD.encode(image_bytes),
        };

        let request_json = serde_json::to_string(&payload)
            .map_err(|error| format!("serialize ocr sidecar request failed: {error}"))?;
        self.stdin
            .write_all(request_json.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
            .map_err(|error| format!("write ocr sidecar request failed: {error}"))?;

        let mut response_line = String::new();
        self.stdout
            .read_line(&mut response_line)
            .map_err(|error| format!("read ocr sidecar response failed: {error}"))?;
        if response_line.trim().is_empty() {
            return Err("ocr sidecar returned empty response".to_string());
        }

        let response: OcrSidecarResponse = serde_json::from_str(response_line.trim())
            .map_err(|error| format!("parse ocr sidecar response failed: {error}"))?;
        if response.id != request_id {
            return Err("ocr sidecar response id mismatched".to_string());
        }
        if let Some(error) = response.error {
            return Err(error);
        }
        Ok(response.items)
    }
}

impl Drop for OcrSidecarClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn parse_tesseract_tsv(
    tsv: &str,
    image_width: u32,
    image_height: u32,
) -> Vec<NativeRecognizedItem> {
    let mut output = Vec::new();

    for (index, line) in tsv.lines().enumerate() {
        if index == 0 {
            continue;
        }
        let columns: Vec<&str> = line.split('\t').collect();
        if columns.len() < 12 {
            continue;
        }

        let text = columns[11..].join("\t");
        let text = text.trim();
        if text.is_empty() {
            continue;
        }

        let left = columns[6].parse::<f64>().unwrap_or(0.0);
        let top = columns[7].parse::<f64>().unwrap_or(0.0);
        let width = columns[8].parse::<f64>().unwrap_or(1.0);
        let height = columns[9].parse::<f64>().unwrap_or(1.0);
        let raw_conf = columns[10].parse::<f64>().unwrap_or(0.0);
        if raw_conf < 0.0 {
            continue;
        }

        output.push(NativeRecognizedItem {
            kind: "text".to_string(),
            text: text.to_string(),
            format: None,
            confidence: (raw_conf / 100.0).clamp(0.0, 1.0),
            bbox: clamp_bbox(left, top, width, height, image_width, image_height),
        });
    }

    output
}

fn run_hidden_command(
    command: &str,
    args: &[&str],
) -> Result<std::process::Output, std::io::Error> {
    let mut cmd = Command::new(command);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    for arg in args {
        cmd.arg(arg);
    }
    cmd.output()
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

fn centered_bbox(
    image_width: u32,
    image_height: u32,
    width_ratio: f64,
    height_ratio: f64,
) -> RecognizedBbox {
    let safe_width = image_width.max(1) as f64;
    let safe_height = image_height.max(1) as f64;
    let width = (safe_width * width_ratio).clamp(1.0, safe_width);
    let height = (safe_height * height_ratio).clamp(1.0, safe_height);
    let x = ((safe_width - width) / 2.0).max(0.0);
    let y = ((safe_height - height) / 2.0).max(0.0);
    RecognizedBbox {
        x,
        y,
        width,
        height,
    }
}

fn clamp_bbox(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    image_width: u32,
    image_height: u32,
) -> RecognizedBbox {
    let max_x = image_width.max(1) as f64;
    let max_y = image_height.max(1) as f64;

    let clamped_width = width.max(1.0).min(max_x);
    let clamped_height = height.max(1.0).min(max_y);
    let clamped_x = x.max(0.0).min((max_x - clamped_width).max(0.0));
    let clamped_y = y.max(0.0).min((max_y - clamped_height).max(0.0));

    RecognizedBbox {
        x: clamped_x,
        y: clamped_y,
        width: clamped_width,
        height: clamped_height,
    }
}

#[cfg(test)]
mod tests {
    use super::{centered_bbox, decode_image_data_url, parse_tesseract_tsv};

    #[test]
    fn decodes_base64_data_url() {
        let payload = "data:image/png;base64,aGVsbG8=";
        let decoded = decode_image_data_url(payload).expect("data url should decode");
        assert_eq!(decoded, b"hello");
    }

    #[test]
    fn rejects_non_base64_data_url() {
        let payload = "data:image/png,abcdef";
        let error = decode_image_data_url(payload).expect_err("non-base64 data url should fail");
        assert!(error.contains("base64"));
    }

    #[test]
    fn centered_bbox_stays_inside_image() {
        let bbox = centered_bbox(400, 300, 0.8, 0.4);
        assert!(bbox.x >= 0.0 && bbox.y >= 0.0);
        assert!(bbox.width > 0.0 && bbox.height > 0.0);
        assert!(bbox.x + bbox.width <= 400.0 + f64::EPSILON);
        assert!(bbox.y + bbox.height <= 300.0 + f64::EPSILON);
    }

    #[test]
    fn parses_tesseract_tsv_rows() {
        let tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t10\t20\t30\t40\t85\tSKU-001\n5\t1\t1\t1\t1\t2\t100\t120\t60\t20\t-1\t\n";
        let rows = parse_tesseract_tsv(tsv, 300, 200);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].kind, "text");
        assert_eq!(rows[0].text, "SKU-001");
        assert!((rows[0].confidence - 0.85).abs() < 0.001);
        assert_eq!(rows[0].bbox.x, 10.0);
        assert_eq!(rows[0].bbox.y, 20.0);
    }
}
