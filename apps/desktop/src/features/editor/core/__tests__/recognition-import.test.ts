import { describe, expect, it } from "vitest";

import { buildElementsFromRecognition } from "../recognition-import";
import type { LabelSize } from "../types";

const labelSize: LabelSize = { widthMm: 40, heightMm: 30 };

describe("识别结果导入映射", () => {
  it("maps text, barcode and icon items into editable elements", () => {
    const result = buildElementsFromRecognition(
      {
        imageWidth: 800,
        imageHeight: 600,
        warnings: [],
        items: [
          {
            kind: "text",
            text: "SKU-001",
            confidence: 0.95,
            bbox: { x: 80, y: 60, width: 320, height: 80 },
          },
          {
            kind: "barcode",
            text: "6901234567892",
            format: "EAN_13",
            confidence: 0.9,
            bbox: { x: 120, y: 220, width: 520, height: 180 },
          },
          {
            kind: "icon",
            presetId: "printer",
            confidence: 0.8,
            bbox: { x: 680, y: 40, width: 80, height: 80 },
          },
        ],
      },
      labelSize
    );

    expect(result).toHaveLength(3);
    expect(result[0]?.type).toBe("text");
    expect(result[1]?.type).toBe("barcode");
    expect(result[2]?.type).toBe("icon");
    expect(result[1]?.xMm).toBeGreaterThan(5);
    expect(result[1]?.widthMm).toBeGreaterThan(20);
  });

  it("ignores low confidence text and empty barcode payload", () => {
    const result = buildElementsFromRecognition(
      {
        imageWidth: 400,
        imageHeight: 300,
        warnings: [],
        items: [
          {
            kind: "text",
            text: "noise",
            confidence: 0.3,
            bbox: { x: 10, y: 10, width: 60, height: 20 },
          },
          {
            kind: "barcode",
            text: "   ",
            format: "CODE_128",
            confidence: 0.9,
            bbox: { x: 100, y: 100, width: 200, height: 100 },
          },
        ],
      },
      labelSize
    );

    expect(result).toHaveLength(0);
  });
});
