import type { EditorElement, LabelSize } from "./types";
import type { Calibration } from "../editor.store";

const LABEL_MIN_SIZE_MM = 10;
const DEFAULT_PRINTER_ID = "Zebra-01";

export type TemplateSnapshot = {
  title: string;
  labelSize: LabelSize;
  elements: EditorElement[];
  calibration: Calibration;
  printerId: string;
  copies: number;
};

const DEFAULT_CALIBRATION: Calibration = { offsetX: 0, offsetY: 0, scale: 1 };

function parsePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(LABEL_MIN_SIZE_MM, value);
}

export function cloneElement(element: EditorElement): EditorElement {
  if (element.type === "barcode") {
    return {
      ...element,
      binding: { ...element.binding },
      textStyle: { ...element.textStyle },
      barcode: { ...element.barcode },
    };
  }
  return {
    ...element,
    binding: { ...element.binding },
    textStyle: { ...element.textStyle },
  };
}

export function cloneElements(elements: EditorElement[]): EditorElement[] {
  return elements.map((element) => cloneElement(element));
}

export function buildTemplateSnapshot(document: {
  title: string;
  labelSize: LabelSize;
  elements: EditorElement[];
  calibration: Calibration;
  printerId: string;
  copies: number;
}): TemplateSnapshot {
  return {
    title: document.title,
    labelSize: document.labelSize,
    elements: cloneElements(document.elements),
    calibration: document.calibration,
    printerId: document.printerId,
    copies: document.copies,
  };
}

export function parseTemplateSnapshot(content: string, fallbackName: string): TemplateSnapshot | null {
  try {
    const raw = JSON.parse(content) as Partial<TemplateSnapshot>;
    const rawLabelSize = (raw.labelSize ?? {}) as Partial<LabelSize>;

    return {
      title: typeof raw.title === "string" && raw.title.trim() ? raw.title : fallbackName,
      labelSize: {
        widthMm: parsePositive(Number(rawLabelSize.widthMm), 40),
        heightMm: parsePositive(Number(rawLabelSize.heightMm), 30),
      },
      elements: Array.isArray(raw.elements) ? (raw.elements as EditorElement[]).map(cloneElement) : [],
      calibration:
        raw.calibration &&
        Number.isFinite(raw.calibration.offsetX) &&
        Number.isFinite(raw.calibration.offsetY) &&
        Number.isFinite(raw.calibration.scale)
          ? raw.calibration
          : DEFAULT_CALIBRATION,
      printerId: typeof raw.printerId === "string" && raw.printerId ? raw.printerId : DEFAULT_PRINTER_ID,
      copies: Number.isFinite(raw.copies) ? Math.max(1, Math.trunc(raw.copies as number)) : 1,
    };
  } catch {
    return null;
  }
}
