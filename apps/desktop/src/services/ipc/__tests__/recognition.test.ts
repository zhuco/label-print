import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { recognizeImageNative } from "../recognition";

describe("recognition ipc", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("invokes tauri native recognition and normalizes payload", async () => {
    invokeMock.mockResolvedValueOnce({
      imageWidth: 800,
      imageHeight: 600,
      backend: "native-test",
      warnings: ["w1", "", "w2"],
      items: [
        {
          kind: "text",
          text: "  SKU-001 ",
          confidence: 1.2,
          bbox: { x: 10, y: 20, width: 30, height: 40 },
        },
        {
          kind: "qrcode",
          text: "https://example.com",
          format: "QR_CODE",
          confidence: 0.9,
          bbox: { x: 50, y: 60, width: 70, height: 80 },
        },
      ],
    });

    const result = await recognizeImageNative("data:image/png;base64,abc");

    expect(invokeMock).toHaveBeenCalledWith("recognize_image_native", {
      payload: {
        image_data_url: "data:image/png;base64,abc",
      },
    });
    expect(result).toEqual({
      imageWidth: 800,
      imageHeight: 600,
      backend: "native-test",
      warnings: ["w1", "w2"],
      items: [
        {
          kind: "text",
          text: "SKU-001",
          confidence: 1,
          bbox: { x: 10, y: 20, width: 30, height: 40 },
        },
        {
          kind: "qrcode",
          text: "https://example.com",
          format: "QR_CODE",
          confidence: 0.9,
          bbox: { x: 50, y: 60, width: 70, height: 80 },
        },
      ],
    });
  });

  it("returns null when tauri bridge is unavailable", async () => {
    invokeMock.mockRejectedValueOnce(new Error("window.__TAURI__ is not available"));

    await expect(recognizeImageNative("data:image/png;base64,abc")).resolves.toBeNull();
  });
});
