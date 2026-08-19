import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { getCachedSystemPrinters, listSystemPrinters, revealPdfOutput, submitDirectPrint } from "../print";

describe("print ipc", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "__TAURI__");
    localStorage.clear();
  });

  it("loads system printers via tauri invoke even without global bridge", async () => {
    invokeMock.mockResolvedValueOnce(["Brother MFC-7360 Printer", "Microsoft Print to PDF"]);

    await expect(listSystemPrinters()).resolves.toEqual(["Brother MFC-7360 Printer", "Microsoft Print to PDF"]);
    expect(invokeMock).toHaveBeenCalledWith("list_system_printers");
  });

  it("returns cached printers immediately when cache exists", () => {
    localStorage.setItem(
      "label-print.system-printers",
      JSON.stringify({
        printers: ["导出为WPS PDF", "Microsoft Print to PDF"],
        cachedAt: Date.now(),
      })
    );

    expect(getCachedSystemPrinters()).toEqual(["导出为WPS PDF", "Microsoft Print to PDF"]);
  });

  it("updates cache after loading system printers", async () => {
    invokeMock.mockResolvedValueOnce(["Brother MFC-7360 Printer", "导出为WPS PDF"]);

    await expect(listSystemPrinters()).resolves.toEqual(["Brother MFC-7360 Printer", "导出为WPS PDF"]);

    expect(getCachedSystemPrinters()).toEqual(["Brother MFC-7360 Printer", "导出为WPS PDF"]);
  });

  it("drops stale cached printers by default", () => {
    localStorage.setItem(
      "label-print.system-printers",
      JSON.stringify({
        printers: ["Old Printer"],
        cachedAt: Date.now() - 31 * 60 * 1000,
      })
    );

    expect(getCachedSystemPrinters()).toEqual([]);
  });

  it("deduplicates concurrent system printer requests", async () => {
    let resolveInvoke!: (value: string[]) => void;
    invokeMock.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          resolveInvoke = resolve;
        })
    );

    const first = listSystemPrinters();
    const second = listSystemPrinters();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    resolveInvoke(["Printer-A"]);

    await expect(first).resolves.toEqual(["Printer-A"]);
    await expect(second).resolves.toEqual(["Printer-A"]);
  });

  it("sends every rendered record image to the native direct-print command", async () => {
    invokeMock.mockResolvedValueOnce({ jobId: 9, outputPath: null });

    await expect(submitDirectPrint({
      templateId: 1,
      totalItems: 2,
      printerId: "Printer-A",
      copies: 3,
      calibrationJson: "{}",
      payloadJson: "{}",
      previewPngBase64s: ["first", "second"],
      widthMm: 40,
      heightMm: 30,
      title: "批量标签",
    })).resolves.toEqual({ jobId: 9, outputPath: null });

    expect(invokeMock).toHaveBeenCalledWith("submit_direct_print", {
      payload: expect.objectContaining({ preview_png_base64s: ["first", "second"] }),
    });
  });

  it("opens Explorer with the generated PDF selected", async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await expect(revealPdfOutput("C:/Users/test/Documents/LabelPrint-PDF/food-label.pdf")).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith("reveal_pdf_output", {
      path: "C:/Users/test/Documents/LabelPrint-PDF/food-label.pdf",
    });
  });
});
