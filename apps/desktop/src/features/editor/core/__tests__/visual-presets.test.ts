import { describe, expect, it } from "vitest";

import {
  ICON_PRESETS,
  SHAPE_PRESETS,
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
});
