import { describe, expect, it } from "vitest";

import { buildTextDecoration, computeSingleLineScaleX } from "../text-style";
import type { TextStyle } from "../types";

describe("buildTextDecoration", () => {
  it("returns underline when underline only", () => {
    expect(buildTextDecoration({ underline: true, strikeThrough: false })).toBe("underline");
  });

  it("returns line-through when strikeThrough only", () => {
    expect(buildTextDecoration({ underline: false, strikeThrough: true })).toBe("line-through");
  });

  it("returns combined token when both underline and strikeThrough are enabled", () => {
    expect(buildTextDecoration({ underline: true, strikeThrough: true })).toBe("underline line-through");
  });

  it("returns none when no decoration is enabled", () => {
    expect(buildTextDecoration({ underline: false, strikeThrough: false })).toBe("none");
  });
});

describe("computeSingleLineScaleX", () => {
  const baseStyle: TextStyle = {
    fontFamily: "Microsoft YaHei",
    fontSize: 6,
    fontWeight: 400,
    italic: false,
    underline: false,
    strikeThrough: false,
    align: "left",
    color: "#101828",
    letterSpacing: 0,
    lineHeight: 1.2,
    wrapMode: "singleLine",
    widthScale: 1,
  };

  it("keeps scale stable when only mmToPx changes", () => {
    const text = "1234567890ABCDEFG";
    const widthMm = 24;

    const scaleAt8 = computeSingleLineScaleX({
      text,
      textStyle: baseStyle,
      widthMm,
      mmToPx: 8,
    });

    const scaleAt16 = computeSingleLineScaleX({
      text,
      textStyle: baseStyle,
      widthMm,
      mmToPx: 16,
    });

    expect(scaleAt8).toBeCloseTo(scaleAt16, 4);
  });

  it("honors declared widthScale upper bound", () => {
    const scale = computeSingleLineScaleX({
      text: "ABCD",
      textStyle: {
        ...baseStyle,
        widthScale: 0.58,
      },
      widthMm: 60,
      mmToPx: 8,
    });

    expect(scale).toBeCloseTo(0.58, 4);
  });
});
