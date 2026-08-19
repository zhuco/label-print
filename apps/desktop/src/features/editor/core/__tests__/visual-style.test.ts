import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISUAL_OPACITY,
  DEFAULT_VISUAL_STROKE_WIDTH,
  DEFAULT_VISUAL_FILL_RULE,
  DEFAULT_VISUAL_MITER_LIMIT,
  DEFAULT_VISUAL_ADVANCED_STYLE_PATCH,
  MAX_VISUAL_STROKE_WIDTH,
  MAX_VISUAL_DASH_SEGMENTS,
  VISUAL_STYLE_PRESETS,
  formatVisualDashArray,
  getVisualStylePreset,
  normalizeVisualDashArray,
  normalizeVisualFillRule,
  normalizeVisualLineCap,
  normalizeVisualLineJoin,
  normalizeVisualMiterLimit,
  normalizeVisualOpacity,
  MIN_VISUAL_STROKE_WIDTH,
  normalizeVisualStrokeWidth,
  nudgeVisualStrokeWidth,
} from "../visual-style";

describe("visual stroke style", () => {
  it("falls back to default stroke width for invalid values", () => {
    expect(normalizeVisualStrokeWidth(undefined)).toBe(DEFAULT_VISUAL_STROKE_WIDTH);
    expect(normalizeVisualStrokeWidth(Number.NaN)).toBe(DEFAULT_VISUAL_STROKE_WIDTH);
  });

  it("clamps stroke width into safe range and keeps 0.01 precision", () => {
    expect(normalizeVisualStrokeWidth(0.01)).toBe(MIN_VISUAL_STROKE_WIDTH);
    expect(normalizeVisualStrokeWidth(2.137)).toBe(2.14);
    expect(normalizeVisualStrokeWidth(999)).toBe(MAX_VISUAL_STROKE_WIDTH);
  });

  it("nudges stroke width with micro-step while honoring limits", () => {
    expect(nudgeVisualStrokeWidth(1.8, -0.05)).toBe(1.75);
    expect(nudgeVisualStrokeWidth(1.8, 0.05)).toBe(1.85);
    expect(nudgeVisualStrokeWidth(MIN_VISUAL_STROKE_WIDTH, -0.05)).toBe(MIN_VISUAL_STROKE_WIDTH);
    expect(nudgeVisualStrokeWidth(MAX_VISUAL_STROKE_WIDTH, 0.05)).toBe(MAX_VISUAL_STROKE_WIDTH);
  });

  it("normalizes visual opacity into 0..1 range", () => {
    expect(normalizeVisualOpacity(undefined)).toBe(DEFAULT_VISUAL_OPACITY);
    expect(normalizeVisualOpacity(-0.3)).toBe(0);
    expect(normalizeVisualOpacity(0.237)).toBe(0.24);
    expect(normalizeVisualOpacity(5)).toBe(1);
  });

  it("normalizes line cap and join with safe fallback", () => {
    expect(normalizeVisualLineCap("round")).toBe("round");
    expect(normalizeVisualLineCap("invalid" as never)).toBe("round");
    expect(normalizeVisualLineJoin("bevel")).toBe("bevel");
    expect(normalizeVisualLineJoin("invalid" as never)).toBe("round");
  });

  it("normalizes dash arrays from string input and filters invalid values", () => {
    expect(normalizeVisualDashArray("4, 2, 0, -1, foo, 1.256")).toEqual([4, 2, 1.26]);
    expect(normalizeVisualDashArray("4，2；1")).toEqual([4, 2, 1]);
    expect(normalizeVisualDashArray("1 2 3 4 5 6 7 8 9 10 11 12 13")).toHaveLength(MAX_VISUAL_DASH_SEGMENTS);
    expect(normalizeVisualDashArray("")).toEqual([]);
    expect(normalizeVisualDashArray(undefined)).toEqual([]);
    expect(formatVisualDashArray([4, 2, 1.26])).toBe("4,2,1.26");
  });

  it("normalizes miter limit and fill rule", () => {
    expect(normalizeVisualMiterLimit(undefined)).toBe(DEFAULT_VISUAL_MITER_LIMIT);
    expect(normalizeVisualMiterLimit(-2)).toBe(1);
    expect(normalizeVisualMiterLimit(3.236)).toBe(3.24);
    expect(normalizeVisualMiterLimit(99)).toBe(20);
    expect(normalizeVisualFillRule(undefined)).toBe(DEFAULT_VISUAL_FILL_RULE);
    expect(normalizeVisualFillRule("evenodd")).toBe("evenodd");
    expect(normalizeVisualFillRule("bad" as never)).toBe(DEFAULT_VISUAL_FILL_RULE);
  });

  it("exposes curated visual style presets with lookup support", () => {
    expect(VISUAL_STYLE_PRESETS.length).toBeGreaterThanOrEqual(3);
    const first = VISUAL_STYLE_PRESETS[0];
    const byId = getVisualStylePreset(first.id);
    expect(byId).toEqual(first);
    expect(getVisualStylePreset("not-exist")).toBeNull();
  });

  it("provides advanced style reset patch for quick recovery", () => {
    expect(DEFAULT_VISUAL_ADVANCED_STYLE_PATCH.strokeDashArray).toEqual([]);
    expect(DEFAULT_VISUAL_ADVANCED_STYLE_PATCH.strokeDashOffset).toBe(0);
    expect(DEFAULT_VISUAL_ADVANCED_STYLE_PATCH.strokeMiterLimit).toBe(DEFAULT_VISUAL_MITER_LIMIT);
    expect(DEFAULT_VISUAL_ADVANCED_STYLE_PATCH.fillRule).toBe(DEFAULT_VISUAL_FILL_RULE);
  });
});
