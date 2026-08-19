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

function readScaleX(value: unknown): number {
  const raw = String(value ?? "");
  const match = /scaleX\(([^)]+)\)/.exec(raw);
  if (!match) {
    return 1;
  }
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : 1;
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

  it("keeps barcode number font size stable when only barcode height changes", () => {
    const tall = buildBarcodeTextStyle({ ...BASE_TEXT_STYLE, fontSize: 3.2 }, {
      mmToPx: 8,
      heightMm: 12,
      widthMm: 28,
      text: "987654321",
      minBarcodeHeightMm: 3,
      textGapMm: 0.6,
    });
    const short = buildBarcodeTextStyle({ ...BASE_TEXT_STYLE, fontSize: 3.2 }, {
      mmToPx: 8,
      heightMm: 3,
      widthMm: 28,
      text: "987654321",
      minBarcodeHeightMm: 3,
      textGapMm: 0.6,
    });

    const tallPx = readFontSizePx(tall.fontSize as string | number | undefined);
    const shortPx = readFontSizePx(short.fontSize as string | number | undefined);
    expect(Math.abs(tallPx - shortPx)).toBeLessThan(0.01);
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

  it("allows aggressive horizontal compression for very narrow widths", () => {
    const style = buildBarcodeTextStyle({ ...BASE_TEXT_STYLE, fontSize: 7 }, {
      mmToPx: 8,
      heightMm: 10,
      widthMm: 3.2,
      text: "123456789012345678901234567890",
    });

    const transform = String(style.transform ?? "");
    const match = /scaleX\(([^)]+)\)/.exec(transform);
    const scaleValue = match ? Number.parseFloat(match[1]) : 1;
    expect(scaleValue).toBeLessThan(0.2);
  });

  it("shrinks barcode number scaleX proportionally when width narrows", () => {
    const wide = buildBarcodeTextStyle({ ...BASE_TEXT_STYLE, fontSize: 3.2 }, {
      mmToPx: 8,
      heightMm: 10,
      widthMm: 28,
      text: "1234567890123456789012345",
    });
    const narrow = buildBarcodeTextStyle({ ...BASE_TEXT_STYLE, fontSize: 3.2 }, {
      mmToPx: 8,
      heightMm: 10,
      widthMm: 12,
      text: "1234567890123456789012345",
    });

    const wideScale = readScaleX(wide.transform);
    const narrowScale = readScaleX(narrow.transform);

    expect(wideScale).toBeLessThanOrEqual(1);
    expect(narrowScale).toBeLessThanOrEqual(1);
    expect(narrowScale).toBeLessThan(wideScale);
  });
});
