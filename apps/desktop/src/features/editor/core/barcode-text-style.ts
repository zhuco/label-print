import type { CSSProperties } from "react";

import { buildTextDecoration } from "./text-style";
import type { TextStyle } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type BuildBarcodeTextStyleInput = {
  mmToPx: number;
  heightMm: number;
  widthMm: number;
  text: string;
  minBarcodeHeightMm?: number;
  textGapMm?: number;
};

let measureCanvas: HTMLCanvasElement | null = null;

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
  if (!text || typeof document === "undefined") {
    return 0;
  }
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return 0;
  }

  try {
    if (!measureCanvas) {
      measureCanvas = document.createElement("canvas");
    }
    const context = measureCanvas.getContext("2d");
    if (!context) {
      return 0;
    }
    const weight = Math.max(100, Math.min(900, Math.round(textStyle.fontWeight || 400)));
    const italic = textStyle.italic ? "italic " : "";
    context.font = `${italic}${weight} ${Math.max(1, fontPx)}px ${textStyle.fontFamily}`;
    const metricsWidth = context.measureText(text).width;
    return metricsWidth + Math.max(0, text.length - 1) * letterSpacingPx;
  } catch {
    return 0;
  }
}

function getAlignTransformOrigin(align: TextStyle["align"]): "left" | "center" | "right" {
  if (align === "center") {
    return "center";
  }
  if (align === "right") {
    return "right";
  }
  return "left";
}

export function buildBarcodeTextStyle(textStyle: TextStyle, input: BuildBarcodeTextStyleInput): CSSProperties {
  const safeMmToPx = Number.isFinite(input.mmToPx) && input.mmToPx > 0 ? input.mmToPx : 8;
  const safeWidthMm = Number.isFinite(input.widthMm) ? Math.max(0, input.widthMm) : 0;
  const safeText = (input.text ?? "").replace(/\r?\n/g, " ");

  const widthPx = Math.max(1, safeWidthMm * safeMmToPx);
  const lineHeight = clamp(textStyle.lineHeight, 1, 1.4);
  const minReadableFontPx = 3;
  const requestedFontPx = Number.isFinite(textStyle.fontSize) ? textStyle.fontSize * safeMmToPx : minReadableFontPx;
  const fontPx = Math.max(minReadableFontPx, requestedFontPx);

  const requestedLetterSpacingPx = Number.isFinite(textStyle.letterSpacing) ? textStyle.letterSpacing * safeMmToPx : 0;
  const letterSpacingPx = clamp(requestedLetterSpacingPx, 0, fontPx * 0.3);

  const measuredWidthPx = measureSingleLineTextWidthPx(safeText, textStyle, fontPx, letterSpacingPx);
  const estimatedWidthPx =
    measuredWidthPx > 0
      ? measuredWidthPx
      : estimateSingleLineUnits(safeText) * fontPx * 0.62 + Math.max(0, safeText.length - 1) * letterSpacingPx;
  const horizontalScale =
    estimatedWidthPx > widthPx ? clamp(widthPx / estimatedWidthPx, 0.05, 1) : 1;

  return {
    fontFamily: textStyle.fontFamily,
    fontSize: `${fontPx}px`,
    fontWeight: textStyle.fontWeight,
    fontStyle: textStyle.italic ? "italic" : "normal",
    textDecoration: buildTextDecoration(textStyle),
    color: textStyle.color,
    letterSpacing: `${letterSpacingPx}px`,
    lineHeight,
    textAlign: textStyle.align,
    transform: horizontalScale < 0.999 ? `scaleX(${horizontalScale})` : undefined,
    transformOrigin: `${getAlignTransformOrigin(textStyle.align)} center`,
  };
}
