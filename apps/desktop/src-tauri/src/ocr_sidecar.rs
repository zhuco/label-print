use std::fs;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use image::GenericImageView;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarRequest {
    id: u64,
    image_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarResponse {
    id: u64,
    items: Vec<SidecarTextItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarTextItem {
    pub text: String,
    pub confidence: f64,
    pub bbox: SidecarBbox,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarBbox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn run_stdio_loop() -> i32 {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut reader = BufReader::new(stdin.lock());
    let mut writer = BufWriter::new(stdout.lock());

    let mut engine = OcrEngine::new();
    let mut line = String::new();

    loop {
        line.clear();
        let bytes = match reader.read_line(&mut line) {
            Ok(value) => value,
            Err(_) => return 1,
        };
        if bytes == 0 {
            break;
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let request: SidecarRequest = match serde_json::from_str(trimmed) {
            Ok(value) => value,
            Err(error) => {
                let response = SidecarResponse {
                    id: 0,
                    items: Vec::new(),
                    error: Some(format!("invalid request: {error}")),
                };
                if write_response(&mut writer, &response).is_err() {
                    return 1;
                }
                continue;
            }
        };

        let response =
            match decode_base64(&request.image_base64).and_then(|bytes| engine.recognize(&bytes)) {
                Ok(items) => SidecarResponse {
                    id: request.id,
                    items,
                    error: None,
                },
                Err(error) => SidecarResponse {
                    id: request.id,
                    items: Vec::new(),
                    error: Some(error),
                },
            };

        if write_response(&mut writer, &response).is_err() {
            return 1;
        }
    }

    0
}

fn write_response(
    writer: &mut BufWriter<std::io::StdoutLock<'_>>,
    response: &SidecarResponse,
) -> std::io::Result<()> {
    let json = serde_json::to_string(response).unwrap_or_else(|_| {
        "{\"id\":0,\"items\":[],\"error\":\"serialize response failed\"}".to_string()
    });
    writer.write_all(json.as_bytes())?;
    writer.write_all(b"\n")?;
    writer.flush()
}

fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("empty image payload".to_string());
    }
    STANDARD
        .decode(trimmed.as_bytes())
        .map_err(|error| format!("decode image payload failed: {error}"))
}

struct OcrEngine {
    #[cfg(target_os = "windows")]
    winrt: Option<WinRtOcrEngine>,
}

impl OcrEngine {
    fn new() -> Self {
        Self {
            #[cfg(target_os = "windows")]
            winrt: WinRtOcrEngine::try_new().ok(),
        }
    }

    fn recognize(&mut self, image_bytes: &[u8]) -> Result<Vec<SidecarTextItem>, String> {
        #[cfg(target_os = "windows")]
        {
            if let Some(engine) = self.winrt.as_ref() {
                match engine.recognize(image_bytes) {
                    Ok(items) => return Ok(items),
                    Err(_) => {
                        self.winrt = None;
                    }
                }
            }
        }

        run_tesseract_ocr(image_bytes)
    }
}

#[cfg(target_os = "windows")]
struct WinRtOcrEngine {
    engine: windows::Media::Ocr::OcrEngine,
}

#[cfg(target_os = "windows")]
impl WinRtOcrEngine {
    fn try_new() -> Result<Self, String> {
        let engine = windows::Media::Ocr::OcrEngine::TryCreateFromUserProfileLanguages()
            .map_err(windows_error_message)?;
        Ok(Self { engine })
    }

    fn recognize(&self, image_bytes: &[u8]) -> Result<Vec<SidecarTextItem>, String> {
        use windows::Graphics::Imaging::BitmapDecoder;
        use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};

        let stream = InMemoryRandomAccessStream::new().map_err(windows_error_message)?;
        let writer = DataWriter::CreateDataWriter(&stream).map_err(windows_error_message)?;
        writer
            .WriteBytes(image_bytes)
            .map_err(windows_error_message)?;
        writer
            .StoreAsync()
            .map_err(windows_error_message)?
            .get()
            .map_err(windows_error_message)?;
        writer
            .FlushAsync()
            .map_err(windows_error_message)?
            .get()
            .map_err(windows_error_message)?;

        stream.Seek(0).map_err(windows_error_message)?;
        let decoder = BitmapDecoder::CreateAsync(&stream)
            .map_err(windows_error_message)?
            .get()
            .map_err(windows_error_message)?;
        let bitmap = decoder
            .GetSoftwareBitmapAsync()
            .map_err(windows_error_message)?
            .get()
            .map_err(windows_error_message)?;

        let result = self
            .engine
            .RecognizeAsync(&bitmap)
            .map_err(windows_error_message)?
            .get()
            .map_err(windows_error_message)?;

        let lines = result.Lines().map_err(windows_error_message)?;
        let line_count = lines.Size().map_err(windows_error_message)?;
        let mut output = Vec::new();

        for line_index in 0..line_count {
            let line = lines.GetAt(line_index).map_err(windows_error_message)?;
            let words = line.Words().map_err(windows_error_message)?;
            let word_count = words.Size().map_err(windows_error_message)?;
            for word_index in 0..word_count {
                let word = words.GetAt(word_index).map_err(windows_error_message)?;
                let text = word.Text().map_err(windows_error_message)?.to_string();
                let text = text.trim();
                if text.is_empty() {
                    continue;
                }

                let rect = word.BoundingRect().map_err(windows_error_message)?;
                output.push(SidecarTextItem {
                    text: text.to_string(),
                    confidence: 0.9,
                    bbox: SidecarBbox {
                        x: f64::from(rect.X.max(0.0)),
                        y: f64::from(rect.Y.max(0.0)),
                        width: f64::from(rect.Width.max(1.0)),
                        height: f64::from(rect.Height.max(1.0)),
                    },
                });
            }
        }

        Ok(output)
    }
}

#[cfg(target_os = "windows")]
fn windows_error_message(error: windows::core::Error) -> String {
    let code = error.code().0;
    let message = error.message().to_string();
    if message.trim().is_empty() {
        format!("windows error {code:#x}")
    } else {
        format!("windows error {code:#x}: {message}")
    }
}

fn run_tesseract_ocr(image_bytes: &[u8]) -> Result<Vec<SidecarTextItem>, String> {
    let image = image::load_from_memory(image_bytes)
        .map_err(|error| format!("decode image bytes failed: {error}"))?;
    let (image_width, image_height) = image.dimensions();

    let image_path = build_temp_path("label-ocr-sidecar", "img");
    fs::write(&image_path, image_bytes)
        .map_err(|error| format!("write ocr temp image failed: {error}"))?;

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

    let output = output.map_err(|error| format!("execute tesseract failed: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let reason = stderr.trim();
        if reason.is_empty() {
            return Err(format!("tesseract exited with status {}", output.status));
        }
        return Err(reason.to_string());
    }

    let tsv = String::from_utf8(output.stdout)
        .map_err(|error| format!("parse tesseract stdout failed: {error}"))?;
    Ok(parse_tesseract_tsv(&tsv, image_width, image_height))
}

fn parse_tesseract_tsv(tsv: &str, image_width: u32, image_height: u32) -> Vec<SidecarTextItem> {
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

        output.push(SidecarTextItem {
            text: text.to_string(),
            confidence: (raw_conf / 100.0).clamp(0.0, 1.0),
            bbox: clamp_bbox(left, top, width, height, image_width, image_height),
        });
    }

    output
}

fn clamp_bbox(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    image_width: u32,
    image_height: u32,
) -> SidecarBbox {
    let max_x = image_width.max(1) as f64;
    let max_y = image_height.max(1) as f64;
    let clamped_width = width.max(1.0).min(max_x);
    let clamped_height = height.max(1.0).min(max_y);
    let clamped_x = x.max(0.0).min((max_x - clamped_width).max(0.0));
    let clamped_y = y.max(0.0).min((max_y - clamped_height).max(0.0));

    SidecarBbox {
        x: clamped_x,
        y: clamped_y,
        width: clamped_width,
        height: clamped_height,
    }
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

#[cfg(test)]
mod tests {
    use super::{decode_base64, parse_tesseract_tsv};

    #[test]
    fn decode_base64_payload() {
        let decoded = decode_base64("aGVsbG8=").expect("base64 should decode");
        assert_eq!(decoded, b"hello");
    }

    #[test]
    fn parse_tsv_rows() {
        let tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t10\t20\t30\t40\t85\tSKU-001\n";
        let rows = parse_tesseract_tsv(tsv, 400, 300);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].text, "SKU-001");
        assert!((rows[0].confidence - 0.85).abs() < 0.001);
    }
}
