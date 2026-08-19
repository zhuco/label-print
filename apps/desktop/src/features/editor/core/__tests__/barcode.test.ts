import { describe, expect, it } from "vitest";

import { BARCODE_SYMBOLOGY_OPTIONS, getDefaultBarcodeValue, normalizeBarcodeValue } from "../barcode";

describe("barcode symbology config", () => {
  it("includes extended code128 and ean add-on options", () => {
    const values = BARCODE_SYMBOLOGY_OPTIONS.map((item) => item.value);
    expect(values).toEqual(
      expect.arrayContaining(["CODE128A", "CODE128B", "CODE128C", "EAN2", "EAN5"])
    );
  });

  it("provides default values for newly supported symbologies", () => {
    expect(getDefaultBarcodeValue("CODE128A")).toBe("123456789");
    expect(getDefaultBarcodeValue("CODE128B")).toBe("ABC123");
    expect(getDefaultBarcodeValue("CODE128C")).toBe("123456");
    expect(getDefaultBarcodeValue("EAN2")).toBe("12");
    expect(getDefaultBarcodeValue("EAN5")).toBe("12345");
  });

  it("normalizes ean add-on and code128c values", () => {
    expect(normalizeBarcodeValue("9", "EAN2")).toBe("90");
    expect(normalizeBarcodeValue("1A2B", "EAN5")).toBe("12000");
    expect(normalizeBarcodeValue("A1B2C3D", "CODE128C")).toBe("1230");
  });
});
