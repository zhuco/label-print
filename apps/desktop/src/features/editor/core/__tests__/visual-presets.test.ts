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
  it("contains rich built-in shape and icon presets", () => {
    expect(SHAPE_PRESETS.length).toBeGreaterThanOrEqual(24);
    expect(ICON_PRESETS.length).toBeGreaterThanOrEqual(30);
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

