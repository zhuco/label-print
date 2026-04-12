import {
  createBarcodeElement,
  createIconElement,
  createQrcodeElement,
  createShapeElement,
  createTextElement,
} from "./model";
import type { BarcodeSymbology, EditorElement, LabelSize } from "./types";
import { toIconPresetBindingValue, toShapePresetBindingValue } from "./visual-presets";
import type { RecognizeImageResult, RecognizedItem } from "./image-recognition";

const MIN_TEXT_CONFIDENCE = 0.45;
const MIN_BARCODE_CONFIDENCE = 0.5;
const MIN_SHAPE_CONFIDENCE = 0.62;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toMm(valuePx: number, totalPx: number, totalMm: number): number {
  if (!Number.isFinite(valuePx) || !Number.isFinite(totalPx) || !Number.isFinite(totalMm) || totalPx <= 0 || totalMm <= 0) {
    return 0;
  }
  return (valuePx / totalPx) * totalMm;
}

function normalizeBarcodeSymbology(format: string): BarcodeSymbology {
  const key = format.trim().toUpperCase();
  if (key.includes("EAN13") || key.includes("EAN_13")) {
    return "EAN13";
  }
  if (key.includes("EAN8") || key.includes("EAN_8")) {
    return "EAN8";
  }
  if (key.includes("UPC")) {
    return "UPC";
  }
  if (key.includes("CODE39") || key.includes("CODE_39")) {
    return "CODE39";
  }
  if (key.includes("CODE93") || key.includes("CODE_93")) {
    return "CODE93";
  }
  return "CODE128";
}

function buildElementRect(item: RecognizedItem, imageWidth: number, imageHeight: number, labelSize: LabelSize) {
  const widthMm = clamp(toMm(item.bbox.width, imageWidth, labelSize.widthMm), 2, labelSize.widthMm);
  const heightMm = clamp(toMm(item.bbox.height, imageHeight, labelSize.heightMm), 2, labelSize.heightMm);
  const xMm = clamp(toMm(item.bbox.x, imageWidth, labelSize.widthMm), 0, Math.max(0, labelSize.widthMm - widthMm));
  const yMm = clamp(toMm(item.bbox.y, imageHeight, labelSize.heightMm), 0, Math.max(0, labelSize.heightMm - heightMm));
  return { xMm, yMm, widthMm, heightMm };
}

function buildId(prefix: string, sequence: number): string {
  return `${prefix}-recognized-${Date.now()}-${sequence}`;
}

function toElement(
  item: RecognizedItem,
  sequence: number,
  imageWidth: number,
  imageHeight: number,
  labelSize: LabelSize
): EditorElement | null {
  if (item.kind === "text") {
    const text = item.text.trim();
    if (!text || item.confidence < MIN_TEXT_CONFIDENCE) {
      return null;
    }
    return createTextElement({
      id: buildId("text", sequence),
      ...buildElementRect(item, imageWidth, imageHeight, labelSize),
      binding: {
        mode: "fixed",
        fixedValue: text,
      },
    });
  }

  if (item.kind === "barcode") {
    const value = item.text.trim();
    if (!value || item.confidence < MIN_BARCODE_CONFIDENCE) {
      return null;
    }
    return createBarcodeElement({
      id: buildId("barcode", sequence),
      ...buildElementRect(item, imageWidth, imageHeight, labelSize),
      binding: {
        mode: "fixed",
        fixedValue: value,
      },
      barcode: {
        symbology: normalizeBarcodeSymbology(item.format),
      },
    });
  }

  if (item.kind === "qrcode") {
    const value = item.text.trim();
    if (!value || item.confidence < MIN_BARCODE_CONFIDENCE) {
      return null;
    }
    return createQrcodeElement({
      id: buildId("qrcode", sequence),
      ...buildElementRect(item, imageWidth, imageHeight, labelSize),
      binding: {
        mode: "fixed",
        fixedValue: value,
      },
    });
  }

  if (item.kind === "shape") {
    if (item.confidence < MIN_SHAPE_CONFIDENCE) {
      return null;
    }
    return createShapeElement({
      id: buildId("shape", sequence),
      ...buildElementRect(item, imageWidth, imageHeight, labelSize),
      binding: {
        mode: "fixed",
        fixedValue: toShapePresetBindingValue(item.presetId),
      },
    });
  }

  if (item.kind === "icon") {
    if (item.confidence < MIN_SHAPE_CONFIDENCE) {
      return null;
    }
    return createIconElement({
      id: buildId("icon", sequence),
      ...buildElementRect(item, imageWidth, imageHeight, labelSize),
      binding: {
        mode: "fixed",
        fixedValue: toIconPresetBindingValue(item.presetId),
      },
    });
  }

  return null;
}

export function buildElementsFromRecognition(result: RecognizeImageResult, labelSize: LabelSize): EditorElement[] {
  const output: EditorElement[] = [];
  let sequence = 1;
  for (const item of result.items) {
    const element = toElement(item, sequence, result.imageWidth, result.imageHeight, labelSize);
    sequence += 1;
    if (element) {
      output.push(element);
    }
  }
  return output;
}

