import { beforeEach, describe, expect, it, vi } from "vitest";

import { closeWindow, minimizeWindow, startDragWindow, toggleMaximizeWindow } from "../window-controls";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("window controls ipc", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("calls minimize command", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await minimizeWindow();
    expect(invokeMock).toHaveBeenCalledWith("window_minimize");
  });

  it("calls maximize toggle command and returns status", async () => {
    invokeMock.mockResolvedValueOnce(true);
    await expect(toggleMaximizeWindow()).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("window_toggle_maximize");
  });

  it("calls close command", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await closeWindow();
    expect(invokeMock).toHaveBeenCalledWith("window_close");
  });

  it("calls start drag command", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await startDragWindow();
    expect(invokeMock).toHaveBeenCalledWith("window_start_drag");
  });
});
