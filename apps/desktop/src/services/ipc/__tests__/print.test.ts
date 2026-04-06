import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { getCachedSystemPrinters, listSystemPrinters } from "../print";

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
});
