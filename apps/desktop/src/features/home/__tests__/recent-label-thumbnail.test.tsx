import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createBarcodeElement, createShapeElement } from "../../editor/core/model";
import type { TemplateSnapshot } from "../../editor/core/template-snapshot";
import { toShapePresetBindingValue } from "../../editor/core/visual-presets";
import { RecentLabelThumbnail } from "../RecentLabelThumbnail";

const multilineSnapshot = {
  labelSize: { widthMm: 100, heightMm: 50 },
  elements: [
    {
      id: "text-1",
      type: "text",
      name: "Multiline text",
      xMm: 5,
      yMm: 5,
      widthMm: 90,
      heightMm: 35,
      rotation: 0,
      binding: { mode: "fixed", fixedValue: "First line\nSecond line" },
      textStyle: {
        fontFamily: "Arial",
        fontSize: 5,
        fontWeight: 400,
        italic: false,
        underline: false,
        align: "left",
        color: "#000000",
        letterSpacing: 0.5,
        lineHeight: 1.4,
        wrapMode: "auto",
      },
    },
  ],
} as unknown as TemplateSnapshot;

describe("RecentLabelThumbnail", () => {
  it("preserves multiline text and scales its typography from the label width", () => {
    const { container } = render(<RecentLabelThumbnail snapshot={multilineSnapshot} />);

    const text = container.querySelector<HTMLSpanElement>(".home-thumb-text > span");
    expect(text?.textContent).toBe("First line\nSecond line");
    expect(text).toHaveStyle({
      letterSpacing: "0.5cqw",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
      lineHeight: "1.4",
    });
  });

  it("shows barcode numbers unless the barcode text is explicitly hidden", () => {
    const visibleBarcode = createBarcodeElement({
      id: "barcode-visible",
      binding: { mode: "fixed", fixedValue: "123456789" },
    });
    const hiddenBarcode = createBarcodeElement({
      id: "barcode-hidden",
      yMm: 20,
      barcode: { textPosition: "none" },
      binding: { mode: "fixed", fixedValue: "987654321" },
    });
    const snapshot = {
      title: "Barcode thumbnail",
      labelSize: { widthMm: 100, heightMm: 50 },
      elements: [visibleBarcode, hiddenBarcode],
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "test-printer",
      copies: 1,
    } satisfies TemplateSnapshot;

    const { container } = render(<RecentLabelThumbnail snapshot={snapshot} />);
    const barcodeSvgs = container.querySelectorAll(".home-thumb-barcode-svg");

    expect(barcodeSvgs[0]?.querySelector("text")).toHaveTextContent("123456789");
    expect(barcodeSvgs[1]?.querySelector("text")).toBeNull();
  });

  it("keeps preset shape containers transparent", () => {
    const rectangle = createShapeElement({
      id: "rectangle",
      binding: { mode: "fixed", fixedValue: toShapePresetBindingValue("rectangle") },
      textStyle: { fillColor: "#2a6fa8", fillOpacity: 0.12 },
    });
    const snapshot = {
      title: "Transparent rectangle",
      labelSize: { widthMm: 100, heightMm: 50 },
      elements: [rectangle],
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "test-printer",
      copies: 1,
    } satisfies TemplateSnapshot;

    const { container } = render(<RecentLabelThumbnail snapshot={snapshot} />);
    const presetShape = container.querySelector<HTMLElement>(".home-thumb-shape-preset");

    expect(presetShape).not.toBeNull();
    expect(presetShape?.style.background).toBe("transparent");
    expect(presetShape?.style.backgroundImage).toBe("");
    expect(presetShape?.style.borderWidth).toBe("0px");
  });
});
