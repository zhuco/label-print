import { describe, expect, it } from "vitest";

import {
  ICON_PRESETS,
  SHAPE_PRESETS,
  getVisualPresetAspectRatio,
  readIconPresetIdFromBinding,
  readShapePresetIdFromBinding,
  toIconPresetBindingValue,
  toShapePresetBindingValue,
} from "../visual-presets";

describe("visual preset catalog", () => {
  it("contains richer built-in shape and icon presets", () => {
    expect(SHAPE_PRESETS.length).toBeGreaterThanOrEqual(32);
    expect(ICON_PRESETS.length).toBeGreaterThanOrEqual(50);
  });

  it("uses Chinese category labels for shape and icon presets", () => {
    const shapeCategories = new Set(SHAPE_PRESETS.map((preset) => preset.category));
    const iconCategories = new Set(ICON_PRESETS.map((preset) => preset.category));

    expect(shapeCategories.has("基础形状")).toBe(true);
    expect(shapeCategories.has("箭头指引")).toBe(true);
    expect(iconCategories.has("常用")).toBe(true);
    expect(iconCategories.has("物流仓储")).toBe(true);
  });

  it("round-trips shape binding values", () => {
    const bindingValue = toShapePresetBindingValue("rectangle");
    expect(readShapePresetIdFromBinding(bindingValue)).toBe("rectangle");
    expect(readShapePresetIdFromBinding("rectangle")).toBe("rectangle");
    expect(readShapePresetIdFromBinding("shape:missing-id")).toBeNull();
  });

  it("round-trips icon binding values", () => {
    const bindingValue = toIconPresetBindingValue("printer");
    expect(readIconPresetIdFromBinding(bindingValue)).toBe("printer");
    expect(readIconPresetIdFromBinding("printer")).toBe("printer");
    expect(readIconPresetIdFromBinding("icon:missing-id")).toBeNull();
  });

  it("computes visual preset aspect ratio from real ink bounds", () => {
    const shapeRatio = getVisualPresetAspectRatio("shape", "rectangle");
    const iconRatio = getVisualPresetAspectRatio("icon", "mail");

    expect(shapeRatio).toBeTruthy();
    expect(iconRatio).toBeTruthy();
    expect(shapeRatio).toBeGreaterThan(1.2);
    expect(shapeRatio).toBeLessThan(1.5);
    expect(iconRatio).toBeGreaterThan(1.2);
    expect(iconRatio).toBeLessThan(1.5);
  });
});
