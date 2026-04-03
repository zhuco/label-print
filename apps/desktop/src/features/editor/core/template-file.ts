import { cloneElements, parseTemplateSnapshot, type TemplateSnapshot } from "./template-snapshot";
import { createBarcodeElement, createTextElement } from "./model";
import type { BarcodeSymbology, PrintDirection, TextStyle } from "./types";

const ASSET_URI_PREFIX = "asset://";
const SUPPORTED_FORMAT = "label-print-template";
const SUPPORTED_VERSION = 2;
const LABEL_MIN_SIZE_MM = 10;
const DEFAULT_PRINTER_ID = "Zebra-01";
const DDL_TEXT_POINT_TO_MM = 25.4 / 72;
const DEFAULT_TEXT_LINE_HEIGHT = 1.2;

const DDL_BARCODE_MAP: Record<string, BarcodeSymbology> = {
  CODE_128: "CODE128",
  CODE128: "CODE128",
  CODE_39: "CODE39",
  CODE39: "CODE39",
  CODE_93: "CODE93",
  CODE93: "CODE93",
  EAN_13: "EAN13",
  EAN13: "EAN13",
  EAN_8: "EAN8",
  EAN8: "EAN8",
  UPC: "UPC",
  UPC_A: "UPC",
  UPC_E: "UPCE",
  UPCE: "UPCE",
  ITF_14: "ITF14",
  ITF14: "ITF14",
  ITF: "ITF",
  MSI: "MSI",
  MSI_10: "MSI10",
  MSI10: "MSI10",
  MSI_11: "MSI11",
  MSI11: "MSI11",
  MSI_1010: "MSI1010",
  MSI1010: "MSI1010",
  MSI_1110: "MSI1110",
  MSI1110: "MSI1110",
  CODABAR: "codabar",
  PHARMACODE: "pharmacode",
};

type BundleAssetEntry = {
  id: string;
  mimeType: string;
  kind: "image" | "icon";
  dataBase64: string;
};

type TemplateBundle = {
  format: string;
  version: number;
  template: TemplateSnapshot;
  assets: BundleAssetEntry[];
};

type ParsedDataUrl = {
  mimeType: string;
  bytes: Uint8Array;
};

type AssetCache = {
  id: string;
};

export type DdlTemplateParseResult = {
  snapshot: TemplateSnapshot;
  totalCount: number;
  importedCount: number;
  ignoredCount: number;
  ignoredTypes: Array<{
    type: string;
    count: number;
  }>;
};

function parseDataUrl(value: string): ParsedDataUrl | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1].toLowerCase(),
    bytes: base64ToBytes(match[2]),
  };
}

function encodeUtf8(value: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }
  return Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
}

function decodeUtf8(value: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(value);
  }
  return Array.from(value, (code) => String.fromCharCode(code)).join("");
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const maybeBuffer = (globalThis as { Buffer?: { from: (input: string, encoding: string) => Uint8Array } }).Buffer;
  if (maybeBuffer) {
    return Uint8Array.from(maybeBuffer.from(base64, "base64"));
  }
  throw new Error("Base64 decode is not available in this runtime.");
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const value of bytes) {
      binary += String.fromCharCode(value);
    }
    return btoa(binary);
  }

  const maybeBuffer = (globalThis as {
    Buffer?: { from: (input: Uint8Array) => { toString: (encoding: string) => string } };
  }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString("base64");
  }
  throw new Error("Base64 encode is not available in this runtime.");
}

function stripExtension(name: string): string {
  const withoutLpt = name.replace(/\.lpt$/i, "");
  return withoutLpt.replace(/\.(json|ddl)$/i, "");
}

export function getTemplateFileBaseName(fileName: string): string {
  const base = stripExtension(fileName).trim();
  return base || "imported-template";
}

function parseFinite(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositive(value: string | null, fallback: number, min = 0): number {
  const parsed = parseFinite(value, fallback);
  return Math.max(min, parsed);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function extractDdlTextCharacterLength(drawObject: Element): number | null {
  const textNode = drawObject.querySelector("textlist > text, text");
  if (!textNode) {
    return null;
  }
  const value = textNode.getAttribute("characterlength");
  const parsed = parseFinite(value, Number.NaN);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeDdlTextRawValue(value: string): string {
  return value
    .replace(/\\r\\n|\\n\\r|\\n|\\r/g, "\n")
    .replace(/&#x0d;&#x0a;|&#13;&#10;|&#x0a;&#x0d;|&#10;&#13;/gi, "\n")
    .replace(/&#x0d;|&#13;/gi, "\n")
    .replace(/&#x0a;|&#10;/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n?/g, "\n");
}

function estimateSingleLineTextUnits(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  let units = 0;
  for (const char of trimmed) {
    if (char === " ") {
      units += 0.35;
      continue;
    }
    units += char.charCodeAt(0) <= 0x7f ? 0.55 : 1;
  }
  return units;
}

function estimateTextUnits(value: string, lengthHint: number | null): number {
  if (typeof lengthHint === "number" && Number.isFinite(lengthHint) && lengthHint > 0) {
    return lengthHint;
  }
  const lines = value.split(/\r?\n/);
  return lines.reduce((maxUnits, line) => Math.max(maxUnits, estimateSingleLineTextUnits(line)), 0);
}

function normalizeDdlTextFontSize(
  fontsize: string | null,
  widthMm: number,
  heightMm: number,
  textValue: string,
  textLengthHint: number | null
): number {
  const rawPointSize = parsePositive(fontsize, 18, 1);
  const convertedMm = rawPointSize * DDL_TEXT_POINT_TO_MM;
  const maxByHeight = Math.max(1, heightMm / DEFAULT_TEXT_LINE_HEIGHT);
  const maxByFrame = Math.max(1, heightMm * 0.38);
  const textUnits = estimateTextUnits(textValue, textLengthHint);
  const maxByContent = textUnits > 0 ? Math.max(1, (widthMm / textUnits) * 1.25) : Number.POSITIVE_INFINITY;
  return round2(Math.min(Math.max(convertedMm, 1), maxByHeight, maxByFrame, maxByContent));
}

function parseBoolean(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function mapTextAlign(value: string | null): TextStyle["align"] {
  const alignCode = parseFinite(value, 1);
  if (alignCode === 2 || alignCode === 5 || alignCode === 8) {
    return "center";
  }
  if (alignCode === 3 || alignCode === 6 || alignCode === 9) {
    return "right";
  }
  return "left";
}

function mapBarcodeSymbology(value: string | null): BarcodeSymbology {
  if (!value) {
    return "CODE128";
  }
  const normalized = value.trim().toUpperCase().replace(/[-\s]/g, "_");
  return DDL_BARCODE_MAP[normalized] ?? "CODE128";
}

function mapRotationToDirection(rotation: number): PrintDirection {
  const normalized = ((Math.round(rotation) % 360) + 360) % 360;
  if (normalized === 90) {
    return "rotate90";
  }
  if (normalized === 180) {
    return "rotate180";
  }
  if (normalized === 270) {
    return "rotate270";
  }
  return "normal";
}

function mapBarcodeTextPosition(value: string | null): "none" | "top" | "bottom" {
  if (!value) {
    return "bottom";
  }
  const code = value.trim();
  if (code === "1") {
    return "top";
  }
  if (code === "2") {
    return "none";
  }
  return "bottom";
}

function normalizeQuietZone(value: string | null): number {
  const parsed = parseFinite(value, 1);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed > 5 ? parsed / 10 : parsed;
}

function normalizeDdlTextWidthScale(stretch: string | null): number | undefined {
  if (!stretch) {
    return undefined;
  }
  const parsed = parseFinite(stretch, Number.NaN);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  const ratio = parsed > 5 ? parsed / 100 : parsed;
  return Math.min(Math.max(ratio, 0.2), 2);
}

function mapDdlWrapMode(stretch: string | null): TextStyle["wrapMode"] {
  const widthScale = normalizeDdlTextWidthScale(stretch);
  return typeof widthScale === "number" && Math.abs(widthScale - 1) > 0.01 ? "singleLine" : "auto";
}

function extractDdlTextValue(drawObject: Element): string {
  const textNodes = Array.from(drawObject.querySelectorAll("textlist > text, text"));
  if (textNodes.length === 0) {
    return "";
  }
  const candidates = ["value", "sourcetext", "customvalue", "field"];

  const chunks: string[] = [];
  for (const textNode of textNodes) {
    for (const name of candidates) {
      const value = textNode.getAttribute(name);
      if (typeof value === "string" && value.length > 0) {
        chunks.push(normalizeDdlTextRawValue(value));
        break;
      }
    }
  }

  return chunks.join("\n");
}

function parseDdlDocument(content: string): Document | null {
  if (typeof DOMParser !== "function") {
    return null;
  }
  const xml = new DOMParser().parseFromString(content, "application/xml");
  if (xml.querySelector("parsererror")) {
    return null;
  }
  if (!xml.querySelector("DLabel")) {
    return null;
  }
  return xml;
}

export function parseDdlTemplateSnapshot(content: string, fallbackName: string): TemplateSnapshot | null {
  const xml = parseDdlDocument(content);
  if (!xml) {
    return null;
  }

  const paper = xml.querySelector("paper");
  if (!paper) {
    return null;
  }

  const labelSize = {
    widthMm: parsePositive(paper.getAttribute("w"), 40, LABEL_MIN_SIZE_MM),
    heightMm: parsePositive(paper.getAttribute("h"), 30, LABEL_MIN_SIZE_MM),
  };

  const elements: TemplateSnapshot["elements"] = [];
  const drawObjects = Array.from(paper.querySelectorAll("labelobjects > drawobj, drawobj"));

  for (const [index, drawObject] of drawObjects.entries()) {
    const itemType = drawObject.getAttribute("itemtype");
    const rotation = parseFinite(drawObject.getAttribute("rotate"), 0);
    const xMm = parseFinite(drawObject.getAttribute("l"), 0);
    const yMm = parseFinite(drawObject.getAttribute("t"), 0);
    const widthMm = parsePositive(drawObject.getAttribute("w"), 20, 1);
    const heightMm = parsePositive(drawObject.getAttribute("h"), 8, 1);
    const value = extractDdlTextValue(drawObject);
    const textLengthHint = extractDdlTextCharacterLength(drawObject);

    if (itemType === "5") {
      const textElement = createTextElement({
        id: `ddl-text-${index + 1}`,
        name: `Text ${index + 1}`,
        xMm,
        yMm,
        widthMm,
        heightMm,
        rotation,
        binding: {
          mode: "fixed",
          fixedValue: value,
        },
        textStyle: {
          fontFamily: drawObject.getAttribute("fontfamily")?.trim() || "Microsoft YaHei",
          fontSize: normalizeDdlTextFontSize(
            drawObject.getAttribute("fontsize"),
            widthMm,
            heightMm,
            value,
            textLengthHint
          ),
          widthScale: normalizeDdlTextWidthScale(drawObject.getAttribute("stretch")),
          wrapMode: mapDdlWrapMode(drawObject.getAttribute("stretch")),
          fontWeight: parseBoolean(drawObject.getAttribute("fontbold")) ? 700 : 400,
          italic: parseBoolean(drawObject.getAttribute("fontitalic")),
          underline: parseBoolean(drawObject.getAttribute("fontunderline")),
          align: mapTextAlign(drawObject.getAttribute("alignment")),
          letterSpacing: parseFinite(drawObject.getAttribute("fontletterspacing"), 0),
        },
      });
      elements.push(textElement);
      continue;
    }

    if (itemType === "7") {
      const barcodeElement = createBarcodeElement({
        id: `ddl-barcode-${index + 1}`,
        name: `Barcode ${index + 1}`,
        xMm,
        yMm,
        widthMm,
        heightMm,
        rotation,
        binding: {
          mode: "fixed",
          fixedValue: value,
        },
        barcode: {
          symbology: mapBarcodeSymbology(drawObject.getAttribute("barcodetype")),
          moduleWidth: parsePositive(drawObject.getAttribute("density"), 0.33, 0.1),
          textPosition: mapBarcodeTextPosition(drawObject.getAttribute("textposition")),
          quietZone: normalizeQuietZone(drawObject.getAttribute("quietzone")),
          checksumEnabled: parseBoolean(drawObject.getAttribute("checkcode")),
          minHeight: parsePositive(drawObject.getAttribute("h"), 8, 1),
          direction: mapRotationToDirection(rotation),
        },
      });
      elements.push(barcodeElement);
    }
  }

  const snapshot: TemplateSnapshot = {
    title: fallbackName.trim() || "imported-template",
    labelSize,
    elements,
    calibration: {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    },
    printerId: DEFAULT_PRINTER_ID,
    copies: 1,
  };

  return snapshot;
}

export function parseDdlTemplate(content: string, fallbackName: string): DdlTemplateParseResult | null {
  const xml = parseDdlDocument(content);
  if (!xml) {
    return null;
  }

  const paper = xml.querySelector("paper");
  if (!paper) {
    return null;
  }

  const drawObjects = Array.from(paper.querySelectorAll("labelobjects > drawobj, drawobj"));
  const totalCount = drawObjects.length;
  const ignoredTypeCounter = new Map<string, number>();
  for (const drawObject of drawObjects) {
    const itemType = drawObject.getAttribute("itemtype");
    if (itemType === "5" || itemType === "7") {
      continue;
    }
    const key = `itemtype=${itemType?.trim() || "unknown"}`;
    ignoredTypeCounter.set(key, (ignoredTypeCounter.get(key) ?? 0) + 1);
  }

  const snapshot = parseDdlTemplateSnapshot(content, fallbackName);
  if (!snapshot) {
    return null;
  }
  const importedCount = snapshot.elements.length;
  const ignoredTypes = Array.from(ignoredTypeCounter.entries())
    .sort((left, right) => left[0].localeCompare(right[0], "zh-CN"))
    .map(([type, count]) => ({ type, count }));

  return {
    snapshot,
    totalCount,
    importedCount,
    ignoredCount: Math.max(0, totalCount - importedCount),
    ignoredTypes,
  };
}

export function packTemplateBundle(snapshot: TemplateSnapshot): Uint8Array {
  const assetCache = new Map<string, AssetCache>();
  const assets: BundleAssetEntry[] = [];

  const normalized: TemplateSnapshot = {
    ...snapshot,
    elements: cloneElements(snapshot.elements),
  };

  for (const element of normalized.elements) {
    if ((element.type !== "image" && element.type !== "icon") || element.binding.mode !== "fixed") {
      continue;
    }
    const rawValue = element.binding.fixedValue ?? "";
    const parsed = parseDataUrl(rawValue);
    if (!parsed) {
      continue;
    }

    const cached = assetCache.get(rawValue);
    if (cached) {
      element.binding.fixedValue = `${ASSET_URI_PREFIX}${cached.id}`;
      continue;
    }

    const id = `asset-${assets.length + 1}`;
    assets.push({
      id,
      mimeType: parsed.mimeType,
      kind: element.type,
      dataBase64: bytesToBase64(parsed.bytes),
    });
    assetCache.set(rawValue, { id });
    element.binding.fixedValue = `${ASSET_URI_PREFIX}${id}`;
  }

  const bundle: TemplateBundle = {
    format: SUPPORTED_FORMAT,
    version: SUPPORTED_VERSION,
    template: normalized,
    assets,
  };

  return encodeUtf8(JSON.stringify(bundle));
}

function validateBundle(raw: unknown): TemplateBundle {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid template bundle: payload is not an object.");
  }

  const bundle = raw as Partial<TemplateBundle>;
  if (bundle.format !== SUPPORTED_FORMAT) {
    throw new Error("Invalid template bundle: unsupported format.");
  }
  if (bundle.version !== SUPPORTED_VERSION) {
    throw new Error("Invalid template bundle: unsupported version.");
  }
  if (!bundle.template || typeof bundle.template !== "object") {
    throw new Error("Invalid template bundle: template payload is missing.");
  }
  if (!Array.isArray(bundle.assets)) {
    throw new Error("Invalid template bundle: assets is not an array.");
  }

  return {
    format: bundle.format,
    version: bundle.version,
    template: bundle.template as TemplateSnapshot,
    assets: bundle.assets.map((asset) => {
      if (
        !asset ||
        typeof asset !== "object" ||
        typeof asset.id !== "string" ||
        typeof asset.mimeType !== "string" ||
        typeof asset.dataBase64 !== "string"
      ) {
        throw new Error("Invalid template bundle: malformed asset entry.");
      }
      return {
        id: asset.id,
        mimeType: asset.mimeType,
        dataBase64: asset.dataBase64,
        kind: asset.kind === "icon" ? "icon" : "image",
      };
    }),
  };
}

function buildAssetDataUrlMap(assets: BundleAssetEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const asset of assets) {
    map.set(asset.id, `data:${asset.mimeType};base64,${asset.dataBase64}`);
  }
  return map;
}

export function unpackTemplateBundle(bundle: Uint8Array): TemplateSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(decodeUtf8(bundle));
  } catch {
    throw new Error("Invalid template bundle: JSON parse failed.");
  }

  const parsed = validateBundle(raw);
  const snapshot = parseTemplateSnapshot(JSON.stringify(parsed.template), "Imported Template");
  if (!snapshot) {
    throw new Error("Invalid template bundle: template payload is malformed.");
  }

  const assetDataMap = buildAssetDataUrlMap(parsed.assets);
  return {
    ...snapshot,
    elements: cloneElements(snapshot.elements).map((element) => {
      if (element.binding.mode !== "fixed") {
        return element;
      }
      const value = element.binding.fixedValue ?? "";
      if (!value.startsWith(ASSET_URI_PREFIX)) {
        return element;
      }
      const assetId = value.slice(ASSET_URI_PREFIX.length);
      const dataUrl = assetDataMap.get(assetId);
      if (!dataUrl) {
        return element;
      }
      return {
        ...element,
        binding: {
          ...element.binding,
          fixedValue: dataUrl,
        },
      };
    }),
  };
}
