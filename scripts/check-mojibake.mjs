import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const TEXT_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".scss",
  ".json",
  ".md",
  ".html",
  ".yml",
  ".yaml",
  ".toml",
  ".rs",
  ".txt",
  ".xml",
  ".ini",
  ".conf",
  ".svg",
]);

const EXACT_TEXT_FILES = new Set([".editorconfig", ".gitattributes", ".gitignore", "README.md"]);

const SUSPICIOUS_MOJIBAKE_TOKENS = [
  // Common UTF-8 text accidentally decoded as GBK and saved again as UTF-8.
  { token: "褰撳墠瀵硅薄", suggestion: "当前对象" },
  { token: "鍩虹鍙傛暟", suggestion: "基础参数" },
  { token: "姘村钩", suggestion: "水平" },
  { token: "鍨傜洿", suggestion: "垂直" },
  { token: "鍐呭缁戝畾", suggestion: "内容绑定" },
  { token: "鏂囨湰鍙傛暟", suggestion: "文本参数" },
  { token: "瀛椾綋", suggestion: "字体" },
  { token: "瀛楀彿", suggestion: "字号" },
  { token: "鎻忚竟", suggestion: "描边" },
  { token: "濉厖", suggestion: "填充" },
  { token: "閫忔槑搴", suggestion: "透明度" },
  { token: "棰勮", suggestion: "预览" },
  { token: "鏂囦欢", suggestion: "文件" },
  { token: "鎵撳嵃", suggestion: "打印" },
  { token: "淇濆瓨", suggestion: "保存" },
  { token: "璁剧疆", suggestion: "设置" },
  { token: "鍒犻櫎", suggestion: "删除" },
  { token: "澶嶅埗", suggestion: "复制" },
  { token: "绮樿创", suggestion: "粘贴" },
  { token: "鍚庨€€", suggestion: "后退" },
  { token: "鍓嶈繘", suggestion: "前进" },
  { token: "瀵煎嚭", suggestion: "导出" },
  { token: "妯℃澘", suggestion: "模板" },
  { token: "鎿嶄綔", suggestion: "操作" },
  { token: "鏍囩", suggestion: "标签" },
  { token: "鍏抽棴", suggestion: "关闭" },
  { token: "鏂板缓", suggestion: "新建" },
  { token: "瀹藉害", suggestion: "宽度" },
  { token: "楂樺害", suggestion: "高度" },
];

function listTrackedFiles() {
  const stdout = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" });
  return stdout
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

function shouldCheckTextFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const baseName = path.posix.basename(normalized);
  if (EXACT_TEXT_FILES.has(baseName) || EXACT_TEXT_FILES.has(normalized)) {
    return true;
  }
  return TEXT_FILE_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase());
}

function hasUtf16OrUtf32Bom(buffer) {
  if (buffer.length >= 2) {
    if ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff)) {
      return true;
    }
  }
  if (buffer.length >= 4) {
    if (
      (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xfe && buffer[3] === 0xff) ||
      (buffer[0] === 0xff && buffer[1] === 0xfe && buffer[2] === 0x00 && buffer[3] === 0x00)
    ) {
      return true;
    }
  }
  return false;
}

function hasSuspiciousNullBytes(buffer) {
  const sampleLength = Math.min(buffer.length, 4096);
  let nullByteCount = 0;
  for (let i = 0; i < sampleLength; i += 1) {
    if (buffer[i] === 0) {
      nullByteCount += 1;
    }
  }
  return sampleLength > 0 && nullByteCount / sampleLength > 0.05;
}

function decodeUtf8Strict(buffer) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return decoder.decode(buffer);
}

async function main() {
  const files = listTrackedFiles().filter(shouldCheckTextFile);
  const violations = [];

  for (const relativePath of files) {
    const absolutePath = path.resolve(relativePath);
    const buffer = await readFile(absolutePath);

    if (hasUtf16OrUtf32Bom(buffer)) {
      violations.push({
        file: relativePath,
        reason: "文件使用了 UTF-16/UTF-32 BOM，请改为 UTF-8。",
      });
      continue;
    }

    if (hasSuspiciousNullBytes(buffer)) {
      violations.push({
        file: relativePath,
        reason: "文件包含大量空字节，疑似非 UTF-8 文本编码。",
      });
      continue;
    }

    let text;
    try {
      text = decodeUtf8Strict(buffer);
    } catch {
      violations.push({
        file: relativePath,
        reason: "文件不是有效 UTF-8 编码，请改为 UTF-8。",
      });
      continue;
    }

    if (text.includes("\uFFFD")) {
      violations.push({
        file: relativePath,
        reason: "检测到替换字符 U+FFFD，疑似编码损坏。",
      });
    }

    for (const { token, suggestion } of SUSPICIOUS_MOJIBAKE_TOKENS) {
      if (text.includes(token)) {
        violations.push({
          file: relativePath,
          reason: `检测到疑似乱码片段 "${token}"，可能应为 "${suggestion}"。`,
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error("检测到文本编码/乱码问题：");
    for (const item of violations) {
      console.error(`- ${item.file}: ${item.reason}`);
    }
    console.error("\n请将相关文件统一为 UTF-8 编码并修复乱码后重试。");
    process.exit(1);
  }

  console.log("文本编码检查通过：未发现乱码或非 UTF-8 文本文件。");
}

await main();
