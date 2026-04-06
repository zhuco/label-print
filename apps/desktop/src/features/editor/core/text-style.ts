import type { TextStyle } from "./types";

type DecorationStyle = Pick<TextStyle, "underline" | "strikeThrough">;

export const ELEMENT_FRAME_PADDING_X_PX = 0;
export const ELEMENT_FRAME_PADDING_Y_PX = 0;

export function buildTextDecoration(style: DecorationStyle): string {
  const tokens: string[] = [];

  if (style.underline) {
    tokens.push("underline");
  }
  if (style.strikeThrough) {
    tokens.push("line-through");
  }

  return tokens.length > 0 ? tokens.join(" ") : "none";
}

type ComputeSingleLineScaleInput = {
  text: string;
  textStyle: TextStyle;
  widthMm: number;
  mmToPx: number;
};

let singleLineMeasureCanvas: HTMLCanvasElement | null = null;

export function computeSingleLineScaleX(input: ComputeSingleLineScaleInput): number {
  const declaredScale = clamp(input.textStyle.widthScale ?? 1, 0.001, 1);
  const plainText = input.text.replace(/\r?\n/g, " ");
  const fontPx = Math.max(1, input.textStyle.fontSize * input.mmToPx);
  const letterSpacingPx = Math.max(0, input.textStyle.letterSpacing * input.mmToPx);
  const measuredWidthPx = measureSingleLineTextWidthPx(plainText, input.textStyle, fontPx, letterSpacingPx);
  const estimatedWidthPx =
    measuredWidthPx > 0
      ? measuredWidthPx
      : estimateSingleLineUnits(plainText) * fontPx * 0.62 +
        Math.max(0, plainText.length - 1) * letterSpacingPx;

  const availableWidthPx = Math.max(1, input.widthMm * input.mmToPx - ELEMENT_FRAME_PADDING_X_PX * 2);
  const fitScale = estimatedWidthPx > 0 ? availableWidthPx / estimatedWidthPx : 1;

  return clamp(Math.min(declaredScale, fitScale), 0.001, 1);
}

function estimateSingleLineUnits(value: string): number {
  const text = value.replace(/\r?\n/g, " ").trim();
  if (!text) {
    return 0;
  }

  let units = 0;
  for (const char of text) {
    if (char === " ") {
      units += 0.35;
      continue;
    }
    units += char.charCodeAt(0) <= 0x7f ? 0.55 : 1;
  }
  return units;
}

function measureSingleLineTextWidthPx(
  text: string,
  textStyle: TextStyle,
  fontPx: number,
  letterSpacingPx: number
): number {
  if (!text) {
    return 0;
  }
  if (typeof document === "undefined") {
    return 0;
  }
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return 0;
  }

  try {
    if (!singleLineMeasureCanvas) {
      singleLineMeasureCanvas = document.createElement("canvas");
    }
    const context = singleLineMeasureCanvas.getContext("2d");
    if (!context) {
      return 0;
    }

    const weight = Math.max(100, Math.min(900, Math.round(textStyle.fontWeight || 400)));
    const italic = textStyle.italic ? "italic " : "";
    context.font = `${italic}${weight} ${fontPx}px ${textStyle.fontFamily}`;
    const metricsWidthPx = context.measureText(text).width;

    return metricsWidthPx + Math.max(0, text.length - 1) * letterSpacingPx;
  } catch {
    return 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
