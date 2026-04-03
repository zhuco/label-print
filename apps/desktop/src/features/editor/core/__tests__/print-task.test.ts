import { describe, expect, it } from "vitest";

import { createBarcodeElement, createTextElement } from "../model";
import { buildPrintSubmitPayload } from "../print-task";

describe("打印任务载荷", () => {
  it("应包含校准参数与数据条数", () => {
    const elements = [
      createTextElement({
        id: "t1",
        xMm: 5,
        yMm: 5,
        widthMm: 20,
        heightMm: 6,
        textStyle: {
          wrapMode: "singleLine",
          widthScale: 0.62,
        },
      }),
      createBarcodeElement({
        id: "b1",
        xMm: 5,
        yMm: 13,
        widthMm: 28,
        heightMm: 10,
      }),
    ];

    const payload = buildPrintSubmitPayload({
      templateId: 1,
      templateVersion: 2,
      labelSize: { widthMm: 40, heightMm: 30 },
      printerId: "Zebra-01",
      copies: 2,
      calibration: { offsetX: 0.3, offsetY: -0.2, scale: 1.01 },
      elements,
      records: [
        { sku: "A01", price: "9.9", code: "6252277" },
        { sku: "A02", price: "10.9", code: "6252278" },
      ],
    });

    expect(payload.printerId).toBe("Zebra-01");
    expect(payload.totalItems).toBe(2);
    expect(payload.calibration).toEqual({ offsetX: 0.3, offsetY: -0.2, scale: 1.01 });
    expect(payload.elements).toHaveLength(2);

    const textPayload = payload.elements.find((item) => item.type === "text");
    expect(textPayload?.textStyle.wrapMode).toBe("singleLine");
    expect(textPayload?.textStyle.widthScale).toBeCloseTo(0.62, 2);
  });
});
