import { describe, expect, it } from "vitest";

import { buildBarcodeTextStyle } from "../barcode-text-style";
import type { TextStyle } from "../types";

const BASE_TEXT_STYLE: TextStyle = {
  fontFamily: "Microsoft YaHei",
  fontSize: 6,
  fontWeight: 400,
  italic: false,
  underline: false,
  strikeThrough: false,
  align: "center",
  color: "#101828",
  letterSpacing: 0,
  lineHeight: 1.2,
  wrapMode: "auto",
};

function readFontSizePx(value: string | number | undefined): number {
  return Number.parseFloat(typeof value === "number" ? String(value) : value ?? "0");
}

describe("buildBarcodeTextStyle", () => {
  it("keeps increasing rendered font size when configured font size grows", () => {
    const small = buildBarcodeTextStyle({ ...BASE_TEXT_STYLE, fontSize: 2.2 }, {
      mmToPx: 8,
      heightMm: 12,
      widthMm: 28,
      text: "987654321",
    });
    const large = buildBarcodeTextStyle({ ...BASE_TEXT_STYLE, fontSize: 3.2 }, {
      mmToPx: 8,
      heightMm: 12,
      widthMm: 28,
      text: "987654321",
    });

    const smallPx = readFontSizePx(small.fontSize as string | number | undefined);
    const largePx = readFontSizePx(large.fontSize as string | number | undefined);

    expect(largePx).toBeGreaterThan(smallPx);
    expect(largePx).toBeGreaterThan(16);
  });

  it("limits text size to protect barcode core minimum height", () => {
    const style = buildBarcodeTextStyle({ ...BASE_TEXT_STYLE, fontSize: 10 }, {
      mmToPx: 8,
      heightMm: 12,
      widthMm: 28,
      text: "987654321",
      minBarcodeHeightMm: 8,
      textGapMm: 0.6,
    });

    const fontPx = readFontSizePx(style.fontSize as string | number | undefined);
    expect(fontPx).toBeLessThanOrEqual(23);
  });

  it("compresses glyph width when text cannot fit in the box", () => {
    const style = buildBarcodeTextStyle({ ...BASE_TEXT_STYLE, fontSize: 7 }, {
      mmToPx: 8,
      heightMm: 10,
      widthMm: 10,
      text: "12345678901234567890",
    });

    expect(typeof style.transform).toBe("string");
    expect(String(style.transform)).toContain("scaleX(");
  });
});
