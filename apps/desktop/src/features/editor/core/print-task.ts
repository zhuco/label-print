import { resolveBindingValue } from "./binding";
import type {
  BarcodeElement,
  EditorElement,
  ElementType,
  LabelSize,
  PrintDirection,
  TextElement,
} from "./types";

export type CalibrationParams = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type SubmitTaskPayload = {
  templateId: number;
  templateVersion: number;
  printerId: string;
  copies: number;
  totalItems: number;
  calibration: CalibrationParams;
  payload: string;
};

export type PrintSubmitPayload = {
  templateId: number;
  templateVersion: number;
  labelSize: LabelSize;
  printerId: string;
  copies: number;
  totalItems: number;
  calibration: CalibrationParams;
  printDirection: PrintDirection;
  elements: ResolvedElementPayload[];
  records: Record<string, string>[];
};

export type BuildPrintSubmitInput = {
  templateId: number;
  templateVersion: number;
  labelSize: LabelSize;
  printerId: string;
  copies?: number;
  calibration?: Partial<CalibrationParams>;
  printDirection?: PrintDirection;
  elements: EditorElement[];
  records: Record<string, string | number | null | undefined>[];
};

export type ResolvedElementPayload = {
  id: string;
  type: ElementType;
  name: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  content: string;
  textStyle: TextElement["textStyle"];
  barcode?: BarcodeElement["barcode"];
};

export function buildPrintSubmitPayload(input: BuildPrintSubmitInput): PrintSubmitPayload {
  const records = input.records.map((row) => normalizeRow(row));
  const previewRecord = records[0] ?? {};
  const printTimestamp = new Date();

  const elements = input.elements.map((element) => {
    const common = {
      id: element.id,
      type: element.type,
      name: element.name,
      xMm: element.xMm,
      yMm: element.yMm,
      widthMm: element.widthMm,
      heightMm: element.heightMm,
      rotation: element.rotation,
      content: resolveBindingValue(element.binding, previewRecord, { now: printTimestamp }),
      textStyle: element.textStyle,
    };

    if (element.type === "barcode") {
      return {
        ...common,
        barcode: element.barcode,
      };
    }

    return common;
  });

  return {
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    labelSize: input.labelSize,
    printerId: input.printerId,
    copies: Math.max(1, Math.trunc(input.copies ?? 1)),
    totalItems: records.length,
    calibration: {
      offsetX: input.calibration?.offsetX ?? 0,
      offsetY: input.calibration?.offsetY ?? 0,
      scale: input.calibration?.scale ?? 1,
    },
    printDirection: input.printDirection ?? "normal",
    elements,
    records,
  };
}

export function toSubmitTaskPayload(payload: PrintSubmitPayload): SubmitTaskPayload {
  return {
    templateId: payload.templateId,
    templateVersion: payload.templateVersion,
    printerId: payload.printerId,
    copies: payload.copies,
    totalItems: payload.totalItems,
    calibration: payload.calibration,
    payload: JSON.stringify({
      templateVersion: payload.templateVersion,
      labelSize: payload.labelSize,
      printDirection: payload.printDirection,
      elements: payload.elements,
      records: payload.records,
    }),
  };
}

function normalizeRow(
  row: Record<string, string | number | null | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value === null || value === undefined ? "" : String(value),
    ])
  );
}
