import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { listTemplates, pickTemplateFile, pickTemplateSavePath, saveTemplate } from "../template";

describe("template IPC fallback", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockRejectedValue(new Error("tauri invoke not available"));
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "__TAURI__");
    localStorage.clear();
  });

  it("keeps complete browser-preview templates in memory rather than localStorage", async () => {
    const id = await saveTemplate("preview-only", "complete private template content");

    expect((await listTemplates()).find((template) => template.id === id)).toMatchObject({ name: "preview-only", content: "complete private template content" });
    expect(localStorage.getItem("label-print.templates")).toBeNull();
  });

  it("treats a native file-picker cancellation as cancellation instead of falling back", async () => {
    Reflect.set(globalThis as Record<string, unknown>, "__TAURI__", {
      core: { invoke: invokeMock },
    });
    invokeMock.mockResolvedValue(null);

    await expect(pickTemplateFile()).resolves.toEqual({ status: "cancelled" });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("returns the native save location and whether it replaces an existing file", async () => {
    Reflect.set(globalThis as Record<string, unknown>, "__TAURI__", {
      core: { invoke: invokeMock },
    });
    invokeMock.mockResolvedValue({
      fileName: "标签.lpt",
      filePath: "D:/labels/标签.lpt",
      replacingExisting: true,
    });

    await expect(pickTemplateSavePath("标签.lpt")).resolves.toEqual({
      status: "selected",
      file: {
        fileName: "标签.lpt",
        filePath: "D:/labels/标签.lpt",
        replacingExisting: true,
      },
    });
    expect(invokeMock).toHaveBeenCalledWith("pick_template_save_path", {
      payload: { suggestedName: "标签.lpt" },
    });
  });
});
