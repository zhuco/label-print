import { invoke } from "@tauri-apps/api/core";

export type NativeRecognizedBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NativeRecognizedItem = {
  kind: "text" | "barcode" | "qrcode";
  text: string;
  format?: string;
  confidence: number;
  bbox: NativeRecognizedBbox;
};

export type NativeRecognizeImageResult = {
  imageWidth: number;
  imageHeight: number;
  items: NativeRecognizedItem[];
  warnings: string[];
  backend?: string;
};

function isTauriUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tauri|invoke|not available|not found|window.__TAURI__/i.test(message);
}

function toNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBBox(value: unknown): NativeRecognizedBbox | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Partial<Record<keyof NativeRecognizedBbox, unknown>>;
  const x = Math.max(0, toNumber(raw.x, 0));
  const y = Math.max(0, toNumber(raw.y, 0));
  const width = Math.max(1, toNumber(raw.width, 1));
  const height = Math.max(1, toNumber(raw.height, 1));
  return { x, y, width, height };
}

function normalizeKind(value: unknown): NativeRecognizedItem["kind"] | null {
  if (value === "text" || value === "barcode" || value === "qrcode") {
    return value;
  }
  return null;
}

function normalizeItem(value: unknown): NativeRecognizedItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const kind = normalizeKind(raw.kind);
  const text = normalizeText(raw.text);
  const bbox = normalizeBBox(raw.bbox);
  if (!kind || !text || !bbox) {
    return null;
  }

  const format = normalizeText(raw.format);
  return {
    kind,
    text,
    confidence: Math.max(0, Math.min(1, toNumber(raw.confidence, 0.7))),
    ...(format ? { format } : {}),
    bbox,
  };
}

function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const output: string[] = [];
  for (const item of value) {
    const text = normalizeText(item);
    if (text) {
      output.push(text);
    }
  }
  return output;
}

function normalizeResult(value: unknown): NativeRecognizeImageResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const imageWidth = Math.max(1, toNumber(raw.imageWidth, 0));
  const imageHeight = Math.max(1, toNumber(raw.imageHeight, 0));

  const sourceItems = Array.isArray(raw.items) ? raw.items : [];
  const items = sourceItems.map((item) => normalizeItem(item)).filter((item): item is NativeRecognizedItem => item !== null);

  const backendText = normalizeText(raw.backend);
  return {
    imageWidth,
    imageHeight,
    items,
    warnings: normalizeWarnings(raw.warnings),
    ...(backendText ? { backend: backendText } : {}),
  };
}

export async function recognizeImageNative(dataUrl: string): Promise<NativeRecognizeImageResult | null> {
  const payload = dataUrl.trim();
  if (!payload) {
    return null;
  }

  try {
    const result = await invoke<unknown>("recognize_image_native", {
      payload: {
        image_data_url: payload,
      },
    });
    return normalizeResult(result);
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return null;
    }
    return null;
  }
}
