import { ICON_PRESETS, SHAPE_PRESETS } from "./visual-presets";
import { recognizeImageNative, type NativeRecognizedItem } from "../../../services/ipc/recognition";

export type RecognizedBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RecognizedTextItem = {
  kind: "text";
  text: string;
  confidence: number;
  bbox: RecognizedBBox;
};

export type RecognizedBarcodeItem = {
  kind: "barcode" | "qrcode";
  text: string;
  format: string;
  confidence: number;
  bbox: RecognizedBBox;
};

export type RecognizedShapeItem = {
  kind: "shape" | "icon";
  presetId: string;
  confidence: number;
  bbox: RecognizedBBox;
};

export type RecognizedItem = RecognizedTextItem | RecognizedBarcodeItem | RecognizedShapeItem;

export type RecognizeImageResult = {
  imageWidth: number;
  imageHeight: number;
  items: RecognizedItem[];
  warnings: string[];
};

type TemplatePreset = {
  kind: "shape" | "icon";
  presetId: string;
  markup: string;
};

type TemplateMask = TemplatePreset & {
  mask: Uint8Array;
  size: number;
};

type OcrWord = {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
};

type OcrResult = {
  data?: {
    words?: OcrWord[];
  };
};

const TEMPLATE_SIZE = 28;
const RECOGNITION_PRESET_IDS: TemplatePreset[] = [
  ...SHAPE_PRESETS.slice(0, 10).map((item) => ({ kind: "shape" as const, presetId: item.id, markup: item.markup })),
  ...ICON_PRESETS.slice(0, 10).map((item) => ({ kind: "icon" as const, presetId: item.id, markup: item.markup })),
];

let templateMasksPromise: Promise<TemplateMask[]> | null = null;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.startsWith("data:image/")) {
        resolve(reader.result);
        return;
      }
      reject(new Error("图片数据无效"));
    };
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("图片加载失败"));
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });
}

function createOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  return canvas;
}

function getBoundingBoxFromPoints(points: Array<{ x: number; y: number }>, fallbackWidth: number, fallbackHeight: number): RecognizedBBox {
  if (points.length === 0) {
    return {
      x: 0,
      y: 0,
      width: fallbackWidth,
      height: fallbackHeight,
    };
  }
  const xs = points.map((item) => item.x);
  const ys = points.map((item) => item.y);
  const minX = Math.max(0, Math.min(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxX = Math.max(minX + 1, Math.max(...xs));
  const maxY = Math.max(minY + 1, Math.max(...ys));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function computeOverlapRatio(a: RecognizedBBox, b: RecognizedBBox): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) {
    return 0;
  }
  const inter = (right - left) * (bottom - top);
  const areaA = a.width * a.height;
  if (areaA <= 0) {
    return 0;
  }
  return inter / areaA;
}

async function detectBarcodeItems(dataUrl: string, width: number, height: number): Promise<RecognizedBarcodeItem[]> {
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/library");
    const reader = new BrowserMultiFormatReader();
    const result = await reader.decodeFromImageUrl(dataUrl);
    const format = result.getBarcodeFormat()?.toString?.() ?? "UNKNOWN";
    const points = (result.getResultPoints?.() ?? [])
      .map((point) => {
        const x = Number(point.getX());
        const y = Number(point.getY());
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return null;
        }
        return { x, y };
      })
      .filter((item): item is { x: number; y: number } => item !== null);

    const kind = format.toUpperCase().includes("QR") ? "qrcode" : "barcode";
    return [
      {
        kind,
        text: result.getText() || "",
        format,
        confidence: 0.9,
        bbox: getBoundingBoxFromPoints(points, width, height),
      },
    ];
  } catch {
    return [];
  }
}

async function detectTextItems(dataUrl: string): Promise<RecognizedTextItem[]> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("chi_sim+eng");
    const recognized = (await worker.recognize(dataUrl)) as OcrResult;
    await worker.terminate();
    const words = recognized.data?.words ?? [];
    return words
      .map<RecognizedTextItem | null>((word: OcrWord) => {
        const text = (word.text || "").trim();
        const bbox = word.bbox;
        if (!text || !bbox) {
          return null;
        }
        const width = Math.max(1, bbox.x1 - bbox.x0);
        const height = Math.max(1, bbox.y1 - bbox.y0);
        const rawConfidence = Number(word.confidence ?? 0);
        const confidence = rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;
        return {
          kind: "text",
          text,
          confidence: Math.max(0, Math.min(1, confidence)),
          bbox: {
            x: Math.max(0, bbox.x0),
            y: Math.max(0, bbox.y0),
            width,
            height,
          },
        };
      })
      .filter((item: RecognizedTextItem | null): item is RecognizedTextItem => item !== null);
  } catch {
    return [];
  }
}

function buildBinaryMask(imageData: ImageData): { mask: Uint8Array; width: number; height: number } {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  const histogram = new Uint32Array(256);

  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const value = Math.round(data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
    gray[i] = value;
    histogram[value] += 1;
  }

  const total = width * height;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) {
    sum += i * histogram[i];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = -1;
  let threshold = 127;
  for (let i = 0; i < 256; i += 1) {
    weightBackground += histogram[i];
    if (weightBackground === 0) {
      continue;
    }
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) {
      break;
    }
    sumBackground += i * histogram[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  const mask = new Uint8Array(width * height);
  let foregroundCount = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const foreground = gray[i] <= threshold ? 1 : 0;
    mask[i] = foreground;
    foregroundCount += foreground;
  }

  if (foregroundCount / Math.max(1, gray.length) > 0.62) {
    for (let i = 0; i < mask.length; i += 1) {
      mask[i] = mask[i] ? 0 : 1;
    }
  }
  return { mask, width, height };
}

function collectComponents(mask: Uint8Array, width: number, height: number): RecognizedBBox[] {
  const visited = new Uint8Array(mask.length);
  const components: RecognizedBBox[] = [];
  const queue = new Int32Array(mask.length);

  const minArea = Math.max(90, Math.floor(mask.length * 0.00035));
  const maxArea = Math.floor(mask.length * 0.22);

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0 || visited[index] === 1) {
      continue;
    }
    let head = 0;
    let tail = 0;
    queue[tail++] = index;
    visited[index] = 1;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;

    while (head < tail) {
      const current = queue[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const neighbors = [current - 1, current + 1, current - width, current + width];
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length) {
          continue;
        }
        if (visited[next] === 1 || mask[next] === 0) {
          continue;
        }
        const nx = next % width;
        const ny = Math.floor(next / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) {
          continue;
        }
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    if (area < minArea || area > maxArea) {
      continue;
    }
    components.push({
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX + 1),
      height: Math.max(1, maxY - minY + 1),
    });
  }
  return components;
}

function extractNormalizedMask(mask: Uint8Array, width: number, height: number, box: RecognizedBBox, size: number): Uint8Array {
  const output = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(width - 1, Math.max(0, Math.floor(box.x + (x / size) * box.width)));
      const sourceY = Math.min(height - 1, Math.max(0, Math.floor(box.y + (y / size) * box.height)));
      output[y * size + x] = mask[sourceY * width + sourceX];
    }
  }
  return output;
}

function computeMaskSimilarity(left: Uint8Array, right: Uint8Array): number {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i] === 1;
    const r = right[i] === 1;
    if (l && r) {
      intersection += 1;
    }
    if (l || r) {
      union += 1;
    }
  }
  if (union === 0) {
    return 0;
  }
  return intersection / union;
}

async function renderPresetTemplateMask(template: TemplatePreset): Promise<TemplateMask | null> {
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${TEMPLATE_SIZE}" height="${TEMPLATE_SIZE}" style="color:#000;background:#fff">${template.markup}</svg>`;
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const image = await loadImageFromDataUrl(dataUrl);
    const canvas = createOffscreenCanvas(TEMPLATE_SIZE, TEMPLATE_SIZE);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);
    ctx.drawImage(image, 0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);
    const imageData = ctx.getImageData(0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);
    const { mask } = buildBinaryMask(imageData);
    return {
      ...template,
      mask,
      size: TEMPLATE_SIZE,
    };
  } catch {
    return null;
  }
}

async function getTemplateMasks(): Promise<TemplateMask[]> {
  if (!templateMasksPromise) {
    templateMasksPromise = Promise.all(RECOGNITION_PRESET_IDS.map((item) => renderPresetTemplateMask(item))).then((all) =>
      all.filter((item): item is TemplateMask => item !== null)
    );
  }
  return templateMasksPromise;
}

async function detectShapeItemsFromImageData(
  imageData: ImageData,
  exclusions: RecognizedBBox[]
): Promise<RecognizedShapeItem[]> {
  const templates = await getTemplateMasks();
  if (templates.length === 0) {
    return [];
  }

  const { mask, width, height } = buildBinaryMask(imageData);
  const components = collectComponents(mask, width, height);

  const output: RecognizedShapeItem[] = [];
  for (const component of components) {
    const overlap = exclusions.some((box) => computeOverlapRatio(component, box) > 0.3);
    if (overlap) {
      continue;
    }
    const ratio = component.width / Math.max(1, component.height);
    if (ratio > 4 || ratio < 0.25) {
      continue;
    }

    const normalized = extractNormalizedMask(mask, width, height, component, TEMPLATE_SIZE);
    let best: { template: TemplateMask; score: number } | null = null;
    for (const template of templates) {
      const score = computeMaskSimilarity(normalized, template.mask);
      if (!best || score > best.score) {
        best = { template, score };
      }
    }
    if (!best || best.score < 0.62) {
      continue;
    }

    output.push({
      kind: best.template.kind,
      presetId: best.template.presetId,
      confidence: best.score,
      bbox: component,
    });
  }

  return output;
}

function sortRecognizedItems(items: RecognizedItem[]): RecognizedItem[] {
  return [...items].sort((left, right) => {
    const yDiff = left.bbox.y - right.bbox.y;
    if (Math.abs(yDiff) > 2) {
      return yDiff;
    }
    return left.bbox.x - right.bbox.x;
  });
}

function normalizeNativeItem(item: NativeRecognizedItem): RecognizedTextItem | RecognizedBarcodeItem {
  if (item.kind === "text") {
    return {
      kind: "text",
      text: item.text,
      confidence: Math.max(0, Math.min(1, Number(item.confidence))),
      bbox: item.bbox,
    };
  }
  return {
    kind: item.kind,
    text: item.text,
    format: item.format ?? (item.kind === "qrcode" ? "QR_CODE" : "CODE128"),
    confidence: Math.max(0, Math.min(1, Number(item.confidence))),
    bbox: item.bbox,
  };
}

function isTextItem(item: RecognizedTextItem | RecognizedBarcodeItem): item is RecognizedTextItem {
  return item.kind === "text";
}

function isBarcodeItem(item: RecognizedTextItem | RecognizedBarcodeItem): item is RecognizedBarcodeItem {
  return item.kind === "barcode" || item.kind === "qrcode";
}

export async function recognizeImageFile(file: File): Promise<RecognizeImageResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("只能识别图片文件");
  }
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(dataUrl);
  const canvas = createOffscreenCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前环境不支持图像识别");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const warnings: string[] = [];
  const native = await recognizeImageNative(dataUrl);
  const nativeItems = (native?.items ?? []).map(normalizeNativeItem);
  warnings.push(...(native?.warnings ?? []));

  let textAndCodeItems: Array<RecognizedTextItem | RecognizedBarcodeItem>;
  if (nativeItems.length > 0) {
    textAndCodeItems = nativeItems;
  } else {
    if (native) {
      warnings.push("本地图像识别未返回可用结果，已自动回退前端识别。");
    }
    const [barcodes, texts] = await Promise.all([detectBarcodeItems(dataUrl, canvas.width, canvas.height), detectTextItems(dataUrl)]);
    textAndCodeItems = [...texts, ...barcodes];
  }

  const texts = textAndCodeItems.filter(isTextItem);
  const barcodes = textAndCodeItems.filter(isBarcodeItem);

  if (texts.length === 0 && !warnings.some((item) => item.includes("OCR"))) {
    warnings.push("OCR 未识别到明显文字，建议使用更清晰的图片。");
  }

  const exclusionBoxes = [...barcodes.map((item) => item.bbox), ...texts.map((item) => item.bbox)];
  const shapes = await detectShapeItemsFromImageData(imageData, exclusionBoxes);
  if (shapes.length === 0) {
    warnings.push("图案识别未命中预设模板，可在编辑器中手动补充。");
  }

  return {
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    items: sortRecognizedItems([...textAndCodeItems, ...shapes]),
    warnings,
  };
}
