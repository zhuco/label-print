import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_VISUAL_FILL_RULE,
  DEFAULT_VISUAL_MITER_LIMIT,
  DEFAULT_VISUAL_OPACITY,
  DEFAULT_VISUAL_STROKE_WIDTH,
  MAX_VISUAL_STROKE_WIDTH,
  MIN_VISUAL_STROKE_WIDTH,
} from "../core/visual-style";
import { resetEditorStoreForTests, selectActiveDocument, useEditorStore } from "../editor.store";

describe("editor visual style normalization", () => {
  beforeEach(() => {
    resetEditorStoreForTests();
  });

  it("normalizes selected shape stroke width with industrial limits", () => {
    const store = useEditorStore.getState();
    store.addShapeElement();

    store.updateSelectedTextStyle({ strokeWidth: MIN_VISUAL_STROKE_WIDTH - 0.19 });
    let active = selectActiveDocument(useEditorStore.getState());
    let shape = active.elements.find((item) => item.id === active.selectedIds[0]);
    expect(shape?.type).toBe("shape");
    expect(shape?.textStyle.strokeWidth).toBe(MIN_VISUAL_STROKE_WIDTH);

    store.updateSelectedTextStyle({ strokeWidth: 2.137 });
    active = selectActiveDocument(useEditorStore.getState());
    shape = active.elements.find((item) => item.id === active.selectedIds[0]);
    expect(shape?.textStyle.strokeWidth).toBe(2.14);

    store.updateSelectedTextStyle({ strokeWidth: MAX_VISUAL_STROKE_WIDTH + 10 });
    active = selectActiveDocument(useEditorStore.getState());
    shape = active.elements.find((item) => item.id === active.selectedIds[0]);
    expect(shape?.textStyle.strokeWidth).toBe(MAX_VISUAL_STROKE_WIDTH);
  });

  it("keeps default stroke width for a newly added icon", () => {
    const store = useEditorStore.getState();
    store.addIconElement();

    const active = selectActiveDocument(useEditorStore.getState());
    const icon = active.elements.find((item) => item.id === active.selectedIds[0]);
    expect(icon?.type).toBe("icon");
    expect(icon?.textStyle.strokeWidth).toBe(DEFAULT_VISUAL_STROKE_WIDTH);
  });

  it("normalizes opacity and line style for selected visual element", () => {
    const store = useEditorStore.getState();
    store.addShapeElement();

    store.updateSelectedTextStyle({
      fillOpacity: 2,
      strokeOpacity: -0.5,
      strokeLineCap: "invalid" as never,
      strokeLineJoin: "invalid" as never,
    });

    const active = selectActiveDocument(useEditorStore.getState());
    const shape = active.elements.find((item) => item.id === active.selectedIds[0]);
    expect(shape?.type).toBe("shape");
    expect(shape?.textStyle.fillOpacity).toBe(DEFAULT_VISUAL_OPACITY);
    expect(shape?.textStyle.strokeOpacity).toBe(0);
    expect(shape?.textStyle.strokeLineCap).toBe("round");
    expect(shape?.textStyle.strokeLineJoin).toBe("round");
  });

  it("normalizes dash pattern, dash offset, miter limit and fill rule", () => {
    const store = useEditorStore.getState();
    store.addShapeElement();

    store.updateSelectedTextStyle({
      strokeDashArray: [-1, 0, Number.NaN, 3.456, 2],
      strokeDashOffset: Number.NaN,
      strokeMiterLimit: -3,
      fillRule: "bad" as never,
    });

    const active = selectActiveDocument(useEditorStore.getState());
    const shape = active.elements.find((item) => item.id === active.selectedIds[0]);
    expect(shape?.type).toBe("shape");
    expect(shape?.textStyle.strokeDashArray).toEqual([3.46, 2]);
    expect(shape?.textStyle.strokeDashOffset).toBe(0);
    expect(shape?.textStyle.strokeMiterLimit).toBe(1);
    expect(shape?.textStyle.fillRule).toBe(DEFAULT_VISUAL_FILL_RULE);

    store.updateSelectedTextStyle({
      strokeDashArray: "8, 4, 1.5" as never,
      strokeDashOffset: 1.234,
      strokeMiterLimit: 99,
      fillRule: "evenodd",
    });
    const updated = selectActiveDocument(useEditorStore.getState());
    const updatedShape = updated.elements.find((item) => item.id === updated.selectedIds[0]);
    expect(updatedShape?.textStyle.strokeDashArray).toEqual([8, 4, 1.5]);
    expect(updatedShape?.textStyle.strokeDashOffset).toBe(1.23);
    expect(updatedShape?.textStyle.strokeMiterLimit).toBe(20);
    expect(updatedShape?.textStyle.fillRule).toBe("evenodd");
    expect(updatedShape?.textStyle.strokeMiterLimit).not.toBe(DEFAULT_VISUAL_MITER_LIMIT + 100);
  });

  it("auto-fits preset element size to real ink bounding ratio when adding", () => {
    const store = useEditorStore.getState();
    store.addShapeElement({ presetId: "rectangle" });
    let active = selectActiveDocument(useEditorStore.getState());
    const shape = active.elements.find((item) => item.id === active.selectedIds[0]);
    expect(shape?.type).toBe("shape");
    if (shape?.type !== "shape") {
      return;
    }
    expect(shape.widthMm).toBeGreaterThan(shape.heightMm);
    expect(shape.widthMm / shape.heightMm).toBeGreaterThan(1.2);
    expect(shape.widthMm / shape.heightMm).toBeLessThan(1.5);

    store.addIconElement({ presetId: "mail" });
    active = selectActiveDocument(useEditorStore.getState());
    const icon = active.elements.find((item) => item.id === active.selectedIds[0]);
    expect(icon?.type).toBe("icon");
    if (icon?.type !== "icon") {
      return;
    }
    expect(icon.widthMm).toBeGreaterThan(icon.heightMm);
    expect(icon.widthMm / icon.heightMm).toBeGreaterThan(1.2);
    expect(icon.widthMm / icon.heightMm).toBeLessThan(1.5);
  });
});
