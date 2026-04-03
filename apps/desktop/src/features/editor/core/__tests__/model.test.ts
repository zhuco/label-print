import { describe, expect, it } from "vitest";

import {
  createBarcodeElement,
  createIconElement,
  createImageElement,
  createQrcodeElement,
  createShapeElement,
  createTextElement,
} from "../model";

describe("element model defaults", () => {
  it("text element should use default fixed prompt", () => {
    const element = createTextElement({ id: "t-1" });
    expect(element.binding).toEqual({
      mode: "fixed",
      fixedValue: "双击编辑",
    });
  });

  it("barcode element should default to fixed 123456789", () => {
    const element = createBarcodeElement({ id: "b-1" });
    expect(element.binding).toEqual({
      mode: "fixed",
      fixedValue: "123456789",
    });
  });

  it("image element should default to 图片", () => {
    const element = createImageElement({ id: "img-1" });
    expect(element.type).toBe("image");
    expect(element.binding.fixedValue).toBe("图片");
  });

  it("qrcode element should default to URL", () => {
    const element = createQrcodeElement({ id: "qr-1" });
    expect(element.type).toBe("qrcode");
    expect(element.binding.fixedValue).toBe("https://label.local");
  });

  it("shape element should default to 矩形", () => {
    const element = createShapeElement({ id: "shape-1" });
    expect(element.type).toBe("shape");
    expect(element.binding.fixedValue).toBe("矩形");
  });

  it("icon element should default to @", () => {
    const element = createIconElement({ id: "icon-1" });
    expect(element.type).toBe("icon");
    expect(element.binding.fixedValue).toBe("@");
  });
});
