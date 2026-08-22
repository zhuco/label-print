import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { within } from "@testing-library/react";
import "../../styles/layout.css";

const minimizeWindowMock = vi.fn();
const toggleMaximizeWindowMock = vi.fn();
const closeWindowMock = vi.fn();
const startDragWindowMock = vi.fn();
const showSaveFilePickerMock = vi.fn();
const consumeLaunchFilesMock = vi.fn();
const subscribeLaunchFilesMock = vi.fn();
const launchFileListeners: Array<(payloads: unknown[]) => void> = [];
const tauriInvokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => tauriInvokeMock(...args),
}));

vi.mock("../../services/ipc/window-controls", () => ({
  minimizeWindow: () => minimizeWindowMock(),
  toggleMaximizeWindow: () => toggleMaximizeWindowMock(),
  closeWindow: () => closeWindowMock(),
  startDragWindow: () => startDragWindowMock(),
}));

vi.mock("../../services/ipc/launch-files", () => ({
  consumeLaunchFiles: () => consumeLaunchFilesMock(),
  subscribeLaunchFiles: (handler: (payloads: unknown[]) => void) => subscribeLaunchFilesMock(handler),
}));

import App, { shouldOpenCloudAuthOnStartup } from "../../App";
import {
  CloudApiClient,
  CloudAuthSession,
  CloudLabelRepository,
  type CachedCloudLabel,
} from "../../features/cloud";
import type { CloudLabelContentV1 } from "@label/template-schema";
import { resetEditorStoreForTests, useEditorStore } from "../../features/editor/editor.store";

const DDL_IMPORT_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<DLabel source="pc" version="3.2.8">
  <paper w="40" h="30">
    <labelobjects>
      <drawobj itemtype="5" l="2" t="1.5" w="30" h="8" rotate="0" fontsize="10" fontbold="true">
        <textlist>
          <text value="Product Name" />
        </textlist>
      </drawobj>
      <drawobj itemtype="7" barcodetype="CODE_128" l="2" t="12" w="28" h="10" rotate="0" density="0.33" quietzone="10">
        <textlist>
          <text value="6252277" />
        </textlist>
      </drawobj>
      <drawobj itemtype="99" l="0" t="0" w="1" h="1" />
    </labelobjects>
  </paper>
</DLabel>`;

function makeCloudLabel(
  id: string,
  name: string,
  content: CloudLabelContentV1,
  revision: number
): CachedCloudLabel {
  const timestamp = "2026-08-19T00:00:00.000Z";
  return {
    id,
    name,
    categoryId: null,
    schemaVersion: content.version,
    revision,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    lastOpenedAt: timestamp,
    content,
    syncStatus: "synced",
    lastSyncedAt: timestamp,
  };
}

describe("App shell", () => {
  it("opens the cloud login at production startup only when no session is restored", () => {
    expect(shouldOpenCloudAuthOnStartup({ status: "anonymous", user: null }, true)).toBe(true);
    expect(shouldOpenCloudAuthOnStartup({ status: "loading", user: null }, true)).toBe(false);
    expect(shouldOpenCloudAuthOnStartup({ status: "anonymous", user: null }, false)).toBe(false);
  });

  const openNewLabelModal = (container: HTMLElement) => {
    const newTabButton = container.querySelector<HTMLButtonElement>(".new-tab");
    expect(newTabButton).not.toBeNull();
    fireEvent.click(newTabButton!);

    const modal = container.querySelector<HTMLElement>(".new-label-modal");
    expect(modal).not.toBeNull();
    return modal!;
  };

  const enterEditorMode = (container: HTMLElement) => {
    const tabButton = container.querySelector<HTMLButtonElement>(".doc-tab > button");
    if (tabButton) {
      fireEvent.click(tabButton);
      return;
    }

    const newTabButton = container.querySelector<HTMLButtonElement>(".new-tab");
    expect(newTabButton).not.toBeNull();
    fireEvent.click(newTabButton!);

    const confirmButton = container.querySelector<HTMLButtonElement>(".new-label-modal .primary");
    expect(confirmButton).not.toBeNull();
    fireEvent.click(confirmButton!);
  };

  const openLocalFileFromCloud = () => {
    fireEvent.click(screen.getByTestId("cmd-open"));
    fireEvent.click(screen.getByRole("button", { name: "从本机打开" }));
  };

  const exportToLocalFile = () => {
    fireEvent.click(screen.getByTestId("cmd-save"));
    const saveDialog = screen.queryByRole("dialog", { name: "保存标签" });
    if (saveDialog) {
      fireEvent.click(screen.getByRole("button", { name: /本地保存/ }));
      fireEvent.click(within(saveDialog).getByRole("button", { name: "保存" }));
    }
  };

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    resetEditorStoreForTests();
    minimizeWindowMock.mockReset();
    toggleMaximizeWindowMock.mockReset();
    closeWindowMock.mockReset();
    startDragWindowMock.mockReset();
    showSaveFilePickerMock.mockReset();
    consumeLaunchFilesMock.mockReset();
    subscribeLaunchFilesMock.mockReset();
    tauriInvokeMock.mockReset();
    tauriInvokeMock.mockRejectedValue(new Error("tauri invoke not available"));
    launchFileListeners.length = 0;
    localStorage.clear();
    consumeLaunchFilesMock.mockResolvedValue([]);
    subscribeLaunchFilesMock.mockImplementation((handler: (payloads: unknown[]) => void) => {
      launchFileListeners.push(handler);
      return Promise.resolve(() => {
        const index = launchFileListeners.indexOf(handler);
        if (index >= 0) {
          launchFileListeners.splice(index, 1);
        }
      });
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      writable: true,
      value: showSaveFilePickerMock,
    });
    Object.defineProperty(window, "__TAURI__", {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it("renders custom titlebar with logo and tabs", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".brand-home")).not.toBeNull();
    expect(container.querySelector(".brand-mark img")).not.toBeNull();
    expect(container.querySelector(".new-tab")).not.toBeNull();
  });

  it("lets the tab strip own the only flexible titlebar column", () => {
    const { container } = render(<App />);
    const titlebarMain = container.querySelector<HTMLElement>(".titlebar-main");

    expect(titlebarMain).not.toBeNull();
    expect(titlebarMain?.querySelector(".title-tabs")).not.toBeNull();
    expect(titlebarMain?.querySelector(".titlebar-spacer")).not.toBeNull();
  });

  it("starts on home page without opening new label modal", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".home-page")).not.toBeNull();
    expect(container.querySelector(".shell-commandbar")).toBeNull();
    expect(container.querySelector(".new-label-modal")).toBeNull();
    expect(container.querySelector(".doc-tab")).toBeNull();
  });

  it("does not load system printers on initial startup", async () => {
    tauriInvokeMock.mockResolvedValue([]);
    render(<App />);

    await waitFor(() => {
      expect(subscribeLaunchFilesMock).toHaveBeenCalledTimes(1);
    });

    expect(tauriInvokeMock).not.toHaveBeenCalledWith("list_system_printers");
  });

  it("preloads system printers in background after startup delay", async () => {
    tauriInvokeMock.mockResolvedValue([]);
    vi.useFakeTimers();
    try {
      render(<App />);
      await Promise.resolve();

      expect(tauriInvokeMock).not.toHaveBeenCalledWith("list_system_printers");
      await vi.advanceTimersByTimeAsync(4000);
      await Promise.resolve();

      expect(tauriInvokeMock).toHaveBeenCalledWith("list_system_printers");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not prompt unsaved warning when untouched document only changed by cached printer auto-sync", async () => {
    localStorage.setItem(
      "label-print.system-printers",
      JSON.stringify({
        printers: ["Brother MFC-7360 Printer"],
        cachedAt: Date.now(),
      })
    );

    const { container } = render(<App />);

    await waitFor(() => {
      const active = useEditorStore
        .getState()
        .documents.find((item) => item.id === useEditorStore.getState().activeDocumentId);
      expect(active?.printerId).toBe("Brother MFC-7360 Printer");
    });

    const closeWindowButton = container.querySelector<HTMLButtonElement>(".win-btn.close");
    expect(closeWindowButton).not.toBeNull();
    fireEvent.click(closeWindowButton!);

    expect(container.querySelector(".confirm-modal")).toBeNull();
    expect(closeWindowMock).toHaveBeenCalledTimes(1);
  });

  it("opens launch-associated template file on startup", async () => {
    const startupSnapshot = {
      title: "内嵌标题不会覆盖文件名",
      labelSize: { widthMm: 40, heightMm: 30 },
      elements: [],
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "Zebra-01",
      copies: 1,
    };
    consumeLaunchFilesMock.mockResolvedValue([
      {
        fileName: "开机模板.json",
        filePath: "C:/tmp/开机模板.json",
        bytes: Array.from(new TextEncoder().encode(JSON.stringify(startupSnapshot))),
      },
    ]);

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector(".command-status")?.textContent).toContain("已打开模板文件：开机模板.json");
    });
    const activeTabTitle = container.querySelector<HTMLButtonElement>(".doc-tab.active > button")?.textContent;
    expect(activeTabTitle).toBe("开机模板");
  });

  it("opens forwarded launch files while running and keeps single tab per file path", async () => {
    const firstSnapshot = {
      title: "Forwarded One",
      labelSize: { widthMm: 40, heightMm: 30 },
      elements: [],
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "Zebra-01",
      copies: 1,
    };
    const secondSnapshot = {
      title: "Forwarded Two",
      labelSize: { widthMm: 50, heightMm: 35 },
      elements: [],
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "Zebra-01",
      copies: 1,
    };

    const { container } = render(<App />);

    await waitFor(() => {
      expect(subscribeLaunchFilesMock).toHaveBeenCalledTimes(1);
      expect(launchFileListeners).toHaveLength(1);
    });

    const listener = launchFileListeners[0]!;
    listener([
      {
        fileName: "forwarded-one.json",
        filePath: "C:/tmp/forwarded-one.json",
        bytes: Array.from(new TextEncoder().encode(JSON.stringify(firstSnapshot))),
      },
    ]);

    await waitFor(() => {
      expect(container.querySelector<HTMLButtonElement>(".doc-tab.active > button")?.textContent).toBe(
        "forwarded-one"
      );
      expect(container.querySelectorAll(".doc-tab")).toHaveLength(1);
    });

    listener([
      {
        fileName: "forwarded-two.json",
        filePath: "C:/tmp/forwarded-two.json",
        bytes: Array.from(new TextEncoder().encode(JSON.stringify(secondSnapshot))),
      },
    ]);

    await waitFor(() => {
      expect(container.querySelector<HTMLButtonElement>(".doc-tab.active > button")?.textContent).toBe(
        "forwarded-two"
      );
      expect(container.querySelectorAll(".doc-tab")).toHaveLength(2);
    });

    listener([
      {
        fileName: "forwarded-two.json",
        filePath: "C:/tmp/forwarded-two.json",
        bytes: Array.from(new TextEncoder().encode("invalid-json-content")),
      },
    ]);

    await waitFor(() => {
      expect(container.querySelectorAll(".doc-tab")).toHaveLength(2);
      expect(container.querySelector<HTMLButtonElement>(".doc-tab.active > button")?.textContent).toBe(
        "forwarded-two"
      );
    });
  });

  it("uses last created label size as default for next creation", () => {
    const { container } = render(<App />);

    let modal = openNewLabelModal(container);
    let numberInputs = modal.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(numberInputs).toHaveLength(2);

    fireEvent.change(numberInputs[0]!, { target: { value: "76" } });
    fireEvent.change(numberInputs[1]!, { target: { value: "38" } });

    const firstConfirmButton = modal.querySelector<HTMLButtonElement>(".primary");
    expect(firstConfirmButton).not.toBeNull();
    fireEvent.click(firstConfirmButton!);

    modal = openNewLabelModal(container);
    numberInputs = modal.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(numberInputs[0]?.value).toBe("76");
    expect(numberInputs[1]?.value).toBe("38");
  });

  it("shows common size presets when creating a new label", () => {
    const { container } = render(<App />);

    const modal = openNewLabelModal(container);
    const presetSelect = modal.querySelector<HTMLSelectElement>("select");
    expect(presetSelect).not.toBeNull();

    const options = Array.from(presetSelect!.querySelectorAll("option"));
    expect(options.length).toBeGreaterThanOrEqual(31);
    expect(options[1]?.textContent).toBe("40×30");
  });

  it("returns to home when clicking logo area", () => {
    const { container } = render(<App />);
    const homeButton = container.querySelector<HTMLButtonElement>(".brand-home");
    expect(homeButton).not.toBeNull();
    fireEvent.click(homeButton!);

    expect(container.querySelector(".home-page")).not.toBeNull();
    expect(container.querySelector(".shell-commandbar")).toBeNull();
  });

  it("starts window drag after moving on right blank titlebar area with left button", () => {
    const { container } = render(<App />);
    const spacer = container.querySelector<HTMLDivElement>(".titlebar-spacer");
    expect(spacer).not.toBeNull();

    fireEvent.mouseDown(spacer!, { button: 0, clientX: 20, clientY: 20 });
    expect(startDragWindowMock).toHaveBeenCalledTimes(0);

    fireEvent.mouseMove(window, { buttons: 1, clientX: 30, clientY: 21 });
    expect(startDragWindowMock).toHaveBeenCalledTimes(1);
    fireEvent.mouseUp(window);

    fireEvent.mouseDown(spacer!, { button: 1 });
    expect(startDragWindowMock).toHaveBeenCalledTimes(1);
  });

  it("toggles maximize when double-clicking right blank titlebar area", () => {
    const { container } = render(<App />);
    const spacer = container.querySelector<HTMLDivElement>(".titlebar-spacer");
    expect(spacer).not.toBeNull();

    fireEvent.doubleClick(spacer!);
    expect(toggleMaximizeWindowMock).toHaveBeenCalledTimes(1);
  });

  it("supports drag and double-click maximize on blank area of title tabs", () => {
    const { container } = render(<App />);
    const titleTabs = container.querySelector<HTMLDivElement>(".title-tabs");
    expect(titleTabs).not.toBeNull();

    fireEvent.mouseDown(titleTabs!, { button: 0, clientX: 40, clientY: 16 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 48, clientY: 18 });
    expect(startDragWindowMock).toHaveBeenCalledTimes(1);
    fireEvent.mouseUp(window);

    fireEvent.doubleClick(titleTabs!);
    expect(toggleMaximizeWindowMock).toHaveBeenCalledTimes(1);
  });

  it("does not trigger drag when pressing a tab button", () => {
    const { container } = render(<App />);
    enterEditorMode(container);
    const tabButton = container.querySelector<HTMLButtonElement>(".doc-tab > button");
    expect(tabButton).not.toBeNull();

    fireEvent.mouseDown(tabButton!, { button: 0, clientX: 12, clientY: 12 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 24, clientY: 20 });
    expect(startDragWindowMock).toHaveBeenCalledTimes(0);
    fireEvent.mouseUp(window);
  });

  it("renders icon nodes for window controls instead of garbled characters", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".win-icon-minimize")).not.toBeNull();
    expect(container.querySelector(".win-icon-maximize")).not.toBeNull();
  });

  it("asks for an opening source and opens the local picker only after choosing local", async () => {
    const { container } = render(<App />);
    enterEditorMode(container);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const clickSpy = vi.spyOn(fileInput!, "click");
    fireEvent.click(screen.getByTestId("cmd-open"));
    expect(screen.getByRole("dialog", { name: "打开标签" })).toBeInTheDocument();
    expect(clickSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "从本机打开" }));
    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("renders file dropdown menu with common actions and supports import item", async () => {
    const { container } = render(<App />);
    enterEditorMode(container);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const clickSpy = vi.spyOn(fileInput!, "click");

    const fileMenuButton = screen.getByRole("button", { name: "文件" });
    fireEvent.click(fileMenuButton);

    const menuItems = Array.from(container.querySelectorAll<HTMLButtonElement>(".file-menu-item")).map((button) =>
      (button.textContent || "").trim()
    );
    expect(menuItems).toEqual(["新建", "打开", "导入", "保存", "另存为", "打印"]);

    const importButton = screen.getByRole("button", { name: "导入" });
    fireEvent.click(importButton);

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("saves a bound cloud label as a new cloud copy and binds later saves to that copy", async () => {
    const user = {
      id: "user-save-as",
      displayName: "另存为测试",
      plan: "free" as const,
      planExpiresAt: null,
      labelUsage: { used: 1, limit: 50, canCreate: true },
    };
    vi.spyOn(CloudAuthSession.prototype, "state", "get").mockReturnValue({ status: "authenticated", user });
    vi.spyOn(CloudAuthSession.prototype, "user", "get").mockReturnValue(user);
    vi.spyOn(CloudAuthSession.prototype, "restore").mockResolvedValue({ status: "authenticated", user });
    vi.spyOn(CloudAuthSession.prototype, "refreshProfile").mockResolvedValue(user);
    vi.spyOn(CloudApiClient.prototype, "listLabelCategories").mockResolvedValue([]);

    const createdLabels = new Map<string, ReturnType<typeof makeCloudLabel>>();
    let createdSequence = 0;
    const createSpy = vi.spyOn(CloudLabelRepository.prototype, "create").mockImplementation(async (input) => {
      createdSequence += 1;
      const label = makeCloudLabel(`cloud-${createdSequence}`, input.name, input.content, 1);
      createdLabels.set(label.id, label);
      return label;
    });
    const updateSpy = vi.spyOn(CloudLabelRepository.prototype, "update").mockImplementation(async (id, input) => {
      const current = createdLabels.get(id);
      expect(current).toBeDefined();
      const updated = makeCloudLabel(id, current!.name, input.content, input.expectedRevision + 1);
      createdLabels.set(id, updated);
      return updated;
    });
    vi.spyOn(CloudLabelRepository.prototype, "list").mockImplementation(async () => ({
      items: Array.from(createdLabels.values()),
      nextCursor: null,
      source: "cloud",
    }));

    const { container } = render(<App />);
    enterEditorMode(container);

    fireEvent.click(screen.getByTestId("cmd-save"));
    fireEvent.click(within(screen.getByRole("dialog", { name: "保存标签" })).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "文件" }));
    fireEvent.click(screen.getByRole("button", { name: "另存为" }));
    const saveAsDialog = screen.getByRole("dialog", { name: "另存为标签" });
    expect(screen.getByRole("button", { name: /云端标签/ })).toHaveClass("active");
    const nameInput = within(saveAsDialog).getByRole("textbox", { name: "标签名称" });
    expect(nameInput).toHaveValue("新建标签1 副本");
    fireEvent.change(nameInput, { target: { value: "云端副本" } });
    fireEvent.click(within(saveAsDialog).getByRole("button", { name: "另存为" }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(updateSpy).not.toHaveBeenCalled();
      expect(container.querySelector(".command-status")?.textContent).toContain("已另存为新的云标签");
      expect(container.querySelector(".doc-tab.active > button")?.textContent).toBe("云端副本");
    });

    useEditorStore.getState().addTextElement();
    fireEvent.click(screen.getByTestId("cmd-save"));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        "cloud-2",
        expect.objectContaining({ expectedRevision: 1 })
      );
    });
  });

  it("keeps editor side panels visible by default and remembers an explicit hide", () => {
    const firstRender = render(<App />);
    enterEditorMode(firstRender.container);

    expect(screen.getByRole("heading", { name: "元素" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "属性" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "隐藏元素面板" }));
    expect(localStorage.getItem("label-print.editor.left-panel-visible")).toBe("false");
    expect(firstRender.container.querySelector(".panel.left")).toHaveClass("panel-hidden");

    firstRender.unmount();
    const secondRender = render(<App />);
    enterEditorMode(secondRender.container);
    expect(secondRender.container.querySelector(".panel.left")).toHaveClass("panel-hidden");
    expect(screen.getByRole("button", { name: "显示元素面板" })).toBeInTheDocument();
  });

  it("opens template through tauri dialog and then saves back to original path", async () => {
    const tauriTemplate = {
      title: "来自系统对话框",
      labelSize: { widthMm: 40, heightMm: 30 },
      elements: [],
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "Zebra-01",
      copies: 1,
    };
    const invokeMock = vi.fn(async (command: string) => {
      if (command === "list_system_fonts") {
        return [];
      }
      if (command === "open_template_file") {
        return {
          fileName: "from-dialog.json",
          filePath: "D:/projects/labels/from-dialog.json",
          bytes: Array.from(new TextEncoder().encode(JSON.stringify(tauriTemplate))),
        };
      }
      if (command === "save_template_file") {
        return { fileName: "from-dialog.json" };
      }
      return [];
    });
    Object.defineProperty(window, "__TAURI__", {
      configurable: true,
      writable: true,
      value: {
        core: {
          invoke: invokeMock,
        },
      },
    });

    const { container } = render(<App />);
    enterEditorMode(container);

    openLocalFileFromCloud();

    await waitFor(() => {
      expect(container.querySelector(".command-status")?.textContent).toContain("已打开模板文件：from-dialog.json");
    });

    exportToLocalFile();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "save_template_file",
        expect.objectContaining({
          payload: expect.objectContaining({
            path: "D:/projects/labels/from-dialog.json",
          }),
        })
      );
    });
    expect(showSaveFilePickerMock).toHaveBeenCalledTimes(0);
  });

  it("forces save-as flow for .ddl opened from tauri path", async () => {
    const createWritableMock = vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    });
    showSaveFilePickerMock.mockResolvedValue({
      name: "imported-template.lpt",
      createWritable: createWritableMock,
    });

    const invokeMock = vi.fn(async (command: string) => {
      if (command === "list_system_fonts") {
        return [];
      }
      if (command === "open_template_file") {
        return {
          fileName: "from-device.ddl",
          filePath: "D:/templates/from-device.ddl",
          bytes: Array.from(new TextEncoder().encode(DDL_IMPORT_SAMPLE)),
        };
      }
      if (command === "save_template_file") {
        return { fileName: "from-device.ddl" };
      }
      return [];
    });
    Object.defineProperty(window, "__TAURI__", {
      configurable: true,
      writable: true,
      value: {
        core: {
          invoke: invokeMock,
        },
      },
    });

    const { container } = render(<App />);
    enterEditorMode(container);

    openLocalFileFromCloud();
    await waitFor(() => {
      expect(container.querySelector(".command-status")?.textContent).toContain("from-device.ddl");
    });

    exportToLocalFile();
    await waitFor(() => {
      expect(showSaveFilePickerMock).toHaveBeenCalledTimes(1);
      expect(createWritableMock).toHaveBeenCalledTimes(1);
    });
    expect(invokeMock.mock.calls.some(([command]) => command === "save_template_file")).toBe(false);
  });

  it("opens save dialog when exporting to the local computer", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const createWritableMock = vi.fn().mockResolvedValue({
      write: writeMock,
      close: closeMock,
    });
    showSaveFilePickerMock.mockResolvedValue({
      createWritable: createWritableMock,
    });

    const { container } = render(<App />);
    enterEditorMode(container);
    exportToLocalFile();

    await waitFor(() => expect(showSaveFilePickerMock).toHaveBeenCalledTimes(1));
    expect(createWritableMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("collects a label name, saves to the native selected path, and reports overwrite handling", async () => {
    const invokeMock = vi.fn(async (command: string) => {
      if (command === "list_system_fonts" || command === "custom_presets_list") {
        return [];
      }
      if (command === "pick_template_save_path") {
        return {
          fileName: "货架标签.lpt",
          filePath: "D:/labels/货架标签.lpt",
          replacingExisting: true,
        };
      }
      if (command === "save_template_file") {
        return { fileName: "货架标签.lpt" };
      }
      return [];
    });
    Object.defineProperty(window, "__TAURI__", {
      configurable: true,
      writable: true,
      value: { core: { invoke: invokeMock } },
    });

    const { container } = render(<App />);
    enterEditorMode(container);
    fireEvent.click(screen.getByTestId("cmd-save"));
    fireEvent.click(screen.getByRole("button", { name: /本地保存/ }));

    const nameInput = screen.getByRole("textbox", { name: "标签名称" });
    fireEvent.change(nameInput, { target: { value: "货架标签" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pick_template_save_path", {
        payload: { suggestedName: "货架标签.lpt" },
      });
      expect(invokeMock).toHaveBeenCalledWith(
        "save_template_file",
        expect.objectContaining({
          payload: expect.objectContaining({ path: "D:/labels/货架标签.lpt" }),
        })
      );
      expect(container.querySelector(".command-status")?.textContent).toContain("已确认覆盖同名文件");
    });

    useEditorStore.getState().addTextElement();
    fireEvent.click(screen.getByTestId("cmd-save"));

    await waitFor(() => {
      expect(invokeMock.mock.calls.filter(([command]) => command === "pick_template_save_path")).toHaveLength(1);
      expect(invokeMock.mock.calls.filter(([command]) => command === "save_template_file")).toHaveLength(2);
      expect(screen.queryByRole("dialog", { name: "保存标签" })).not.toBeInTheDocument();
    });
  });

  it("allows the same file name in a different location", async () => {
    localStorage.setItem(
      "label-print.recent-opened",
      JSON.stringify([
        {
          id: "recent-dup-name",
          fileName: "重复标签.lpt",
          filePath: "D:/labels/重复标签.lpt",
          saved: true,
          openedAt: Date.UTC(2026, 3, 10, 8, 0, 0),
          snapshot: {
            title: "重复标签",
            labelSize: { widthMm: 40, heightMm: 30 },
            elements: [],
            calibration: { offsetX: 0, offsetY: 0, scale: 1 },
            printerId: "Zebra-01",
            copies: 1,
          },
        },
      ])
    );

    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const createWritableMock = vi.fn().mockResolvedValue({
      write: writeMock,
      close: closeMock,
    });
    showSaveFilePickerMock.mockResolvedValue({
      name: "重复标签.lpt",
      createWritable: createWritableMock,
    });

    const { container } = render(<App />);
    enterEditorMode(container);
    exportToLocalFile();

    await waitFor(() => expect(showSaveFilePickerMock).toHaveBeenCalledTimes(1));
    expect(createWritableMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".command-status")?.textContent).toContain("已保存到文件");
  });

  it("saves launch-opened template back to original path without save dialog", async () => {
    const startupSnapshot = {
      title: "开机模板",
      labelSize: { widthMm: 40, heightMm: 30 },
      elements: [],
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "Zebra-01",
      copies: 1,
    };
    consumeLaunchFilesMock.mockResolvedValue([
      {
        fileName: "开机模板.json",
        filePath: "C:/tmp/开机模板.json",
        bytes: Array.from(new TextEncoder().encode(JSON.stringify(startupSnapshot))),
      },
    ]);

    const invokeMock = vi.fn().mockResolvedValue({ fileName: "开机模板.json" });
    Object.defineProperty(window, "__TAURI__", {
      configurable: true,
      writable: true,
      value: {
        core: {
          invoke: invokeMock,
        },
      },
    });

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector(".command-status")?.textContent).toContain("已打开模板文件：开机模板.json");
    });

    exportToLocalFile();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "save_template_file",
        expect.objectContaining({
          payload: expect.objectContaining({
            path: "C:/tmp/开机模板.json",
          }),
        })
      );
    });
    expect(showSaveFilePickerMock).toHaveBeenCalledTimes(0);
  });

  it("uses Ctrl+S to open the unified save dialog with cloud selected", () => {
    const { container } = render(<App />);
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "保存标签" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /云端标签/ })).toHaveClass("active");
    expect(screen.getByRole("button", { name: /本地保存/ })).not.toHaveClass("active");
    expect(container.querySelector(".cloud-auth-modal")).toBeNull();
  });

  it("uses Escape to cancel the save dialog without closing the application", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "保存标签" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "保存标签" })).not.toBeInTheDocument();
    expect(closeWindowMock).not.toHaveBeenCalled();
  });

  it("uses Escape on the main UI to run the same close flow as the titlebar close button", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(closeWindowMock).toHaveBeenCalledTimes(1);
  });

  it("shows the unsaved warning when Escape closes the main UI", () => {
    const { container } = render(<App />);
    enterEditorMode(container);
    useEditorStore.getState().addTextElement();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByRole("dialog", { name: "关闭程序确认" })).toBeInTheDocument();
    expect(closeWindowMock).not.toHaveBeenCalled();
  });

  it("supports Ctrl+N to open new label modal", () => {
    const { container } = render(<App />);
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    expect(container.querySelector(".new-label-modal")).not.toBeNull();
  });

  it("supports Ctrl+C, Ctrl+X, and Ctrl+V for canvas elements", () => {
    const { container } = render(<App />);
    enterEditorMode(container);
    useEditorStore.getState().addTextElement();

    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    expect(useEditorStore.getState().documents.find((item) => item.id === useEditorStore.getState().activeDocumentId)?.elements).toHaveLength(2);

    fireEvent.keyDown(window, { key: "x", ctrlKey: true });
    expect(useEditorStore.getState().documents.find((item) => item.id === useEditorStore.getState().activeDocumentId)?.elements).toHaveLength(1);

    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    expect(useEditorStore.getState().documents.find((item) => item.id === useEditorStore.getState().activeDocumentId)?.elements).toHaveLength(2);
  });

  it("supports Ctrl+P to open print modal in editor", () => {
    const { container } = render(<App />);
    enterEditorMode(container);

    fireEvent.keyDown(window, { key: "p", ctrlKey: true });

    expect(container.querySelector(".print-modal")).not.toBeNull();
  });

  it("uses software-level default printer in print modal instead of per-tab printer", async () => {
    localStorage.setItem(
      "label-print.system-printers",
      JSON.stringify({
        printers: ["Office-Default", "Office-Label-A", "Office-Label-B"],
        cachedAt: Date.now(),
      })
    );
    localStorage.setItem("label-print.default-printer", "Office-Default");

    const { container } = render(<App />);
    enterEditorMode(container);

    useEditorStore.getState().setPrinterConfig({ printerId: "Office-Label-A" });
    expect(
      useEditorStore
        .getState()
        .documents.find((item) => item.id === useEditorStore.getState().activeDocumentId)?.printerId
    ).toBe("Office-Label-A");

    fireEvent.keyDown(window, { key: "p", ctrlKey: true });
    await waitFor(() => {
      const printerSelect = container.querySelector<HTMLSelectElement>(".print-settings select");
      expect(printerSelect).not.toBeNull();
      expect(printerSelect?.value).toBe("Office-Default");
    });

    const cancelButton = container.querySelector<HTMLButtonElement>(".print-cancel-btn");
    expect(cancelButton).not.toBeNull();
    fireEvent.click(cancelButton!);
    await waitFor(() => {
      expect(container.querySelector(".print-modal")).toBeNull();
    });

    useEditorStore.getState().createDocument({
      title: "标签B",
      labelSize: { widthMm: 40, heightMm: 30 },
    });
    useEditorStore.getState().setPrinterConfig({ printerId: "Office-Label-B" });

    fireEvent.keyDown(window, { key: "p", ctrlKey: true });
    await waitFor(() => {
      const printerSelect = container.querySelector<HTMLSelectElement>(".print-settings select");
      expect(printerSelect).not.toBeNull();
      expect(printerSelect?.value).toBe("Office-Default");
    });
  });

  it("supports Ctrl+W to close active tab", async () => {
    const { container } = render(<App />);
    useEditorStore.getState().createDocument({
      title: "标签A",
      labelSize: { widthMm: 40, heightMm: 30 },
    });
    useEditorStore.getState().createDocument({
      title: "标签B",
      labelSize: { widthMm: 40, heightMm: 30 },
    });

    await waitFor(() => {
      expect(container.querySelectorAll(".doc-tab").length).toBeGreaterThanOrEqual(2);
    });
    const beforeCloseCount = container.querySelectorAll(".doc-tab").length;

    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    await waitFor(() => {
      const afterCloseCount = container.querySelectorAll(".doc-tab").length;
      expect(afterCloseCount).toBe(beforeCloseCount - 1);
    });
  });

  it("allows closing the only tab and returns to home page", async () => {
    const { container } = render(<App />);

    const modal = openNewLabelModal(container);
    const confirmButton = modal.querySelector<HTMLButtonElement>(".primary");
    expect(confirmButton).not.toBeNull();
    fireEvent.click(confirmButton!);

    await waitFor(() => {
      expect(container.querySelectorAll(".doc-tab")).toHaveLength(1);
    });

    const closeButton = container.querySelector<HTMLButtonElement>(".doc-tab .close-tab");
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);

    await waitFor(() => {
      expect(container.querySelector(".home-page")).not.toBeNull();
      expect(container.querySelectorAll(".doc-tab")).toHaveLength(0);
    });
  });

  it("prompts when closing an unsaved tab and keeps tab when canceled", async () => {
    const { container } = render(<App />);

    const modal = openNewLabelModal(container);
    const confirmButton = modal.querySelector<HTMLButtonElement>(".primary");
    expect(confirmButton).not.toBeNull();
    fireEvent.click(confirmButton!);

    useEditorStore.getState().addTextElement();
    const activeAfterEdit = useEditorStore.getState().documents.find(
      (item) => item.id === useEditorStore.getState().activeDocumentId
    );
    expect(activeAfterEdit?.elements.length).toBeGreaterThan(0);

    const closeButton = container.querySelector<HTMLButtonElement>(".doc-tab .close-tab");
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);

    const confirmDialog = container.querySelector<HTMLElement>(".confirm-modal");
    expect(confirmDialog).not.toBeNull();
    expect(confirmDialog?.textContent).toContain("未保存变更");

    const cancelButton = confirmDialog?.querySelector<HTMLButtonElement>(".confirm-cancel");
    expect(cancelButton).not.toBeNull();
    fireEvent.click(cancelButton!);

    expect(container.querySelector(".confirm-modal")).toBeNull();
    expect(container.querySelectorAll(".doc-tab")).toHaveLength(1);
  });

  it("supports save-and-close action in unsaved tab close confirmation", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const createWritableMock = vi.fn().mockResolvedValue({
      write: writeMock,
      close: closeMock,
    });
    showSaveFilePickerMock.mockResolvedValue({
      name: "关闭前保存.lpt",
      createWritable: createWritableMock,
    });

    const { container } = render(<App />);

    const modal = openNewLabelModal(container);
    const confirmButton = modal.querySelector<HTMLButtonElement>(".primary");
    expect(confirmButton).not.toBeNull();
    fireEvent.click(confirmButton!);

    useEditorStore.getState().addTextElement();
    const closeButton = container.querySelector<HTMLButtonElement>(".doc-tab .close-tab");
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);

    const confirmDialog = container.querySelector<HTMLElement>(".confirm-modal");
    expect(confirmDialog).not.toBeNull();

    const saveAndCloseButton = confirmDialog?.querySelector<HTMLButtonElement>(".confirm-save-close");
    expect(saveAndCloseButton).not.toBeNull();
    fireEvent.click(saveAndCloseButton!);

    const saveDialog = await screen.findByRole("dialog", { name: "保存标签" });
    fireEvent.click(within(saveDialog).getByRole("button", { name: /本地保存/ }));
    fireEvent.click(within(saveDialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(showSaveFilePickerMock).toHaveBeenCalledTimes(1);
      expect(createWritableMock).toHaveBeenCalledTimes(1);
      expect(container.querySelector(".confirm-modal")).toBeNull();
      expect(container.querySelector(".home-page")).not.toBeNull();
      expect(container.querySelectorAll(".doc-tab")).toHaveLength(0);
    });
  });

  it("supports Ctrl+W to close the only tab and return to home page", async () => {
    const { container } = render(<App />);

    const modal = openNewLabelModal(container);
    const confirmButton = modal.querySelector<HTMLButtonElement>(".primary");
    expect(confirmButton).not.toBeNull();
    fireEvent.click(confirmButton!);

    await waitFor(() => {
      expect(container.querySelectorAll(".doc-tab")).toHaveLength(1);
    });

    fireEvent.keyDown(window, { key: "w", ctrlKey: true });

    await waitFor(() => {
      expect(container.querySelector(".home-page")).not.toBeNull();
      expect(container.querySelectorAll(".doc-tab")).toHaveLength(0);
    });
  });

  it("prompts before closing app when there are unsaved tabs", () => {
    const { container } = render(<App />);

    const modal = openNewLabelModal(container);
    const confirmButton = modal.querySelector<HTMLButtonElement>(".primary");
    expect(confirmButton).not.toBeNull();
    fireEvent.click(confirmButton!);

    useEditorStore.getState().addTextElement();
    const activeAfterEdit = useEditorStore.getState().documents.find(
      (item) => item.id === useEditorStore.getState().activeDocumentId
    );
    expect(activeAfterEdit?.elements.length).toBeGreaterThan(0);

    const closeWindowButton = container.querySelector<HTMLButtonElement>(".win-btn.close");
    expect(closeWindowButton).not.toBeNull();
    fireEvent.click(closeWindowButton!);

    const confirmDialog = container.querySelector<HTMLElement>(".confirm-modal");
    expect(confirmDialog).not.toBeNull();
    expect(confirmDialog?.textContent).toContain("未保存变更");

    const cancelButton = confirmDialog?.querySelector<HTMLButtonElement>(".confirm-cancel");
    expect(cancelButton).not.toBeNull();
    fireEvent.click(cancelButton!);

    expect(container.querySelector(".confirm-modal")).toBeNull();
    expect(closeWindowMock).not.toHaveBeenCalled();
  });

  it("closes app after confirming unsaved warning dialog", () => {
    const { container } = render(<App />);

    const modal = openNewLabelModal(container);
    const confirmButton = modal.querySelector<HTMLButtonElement>(".primary");
    expect(confirmButton).not.toBeNull();
    fireEvent.click(confirmButton!);

    useEditorStore.getState().addTextElement();
    const closeWindowButton = container.querySelector<HTMLButtonElement>(".win-btn.close");
    expect(closeWindowButton).not.toBeNull();
    fireEvent.click(closeWindowButton!);

    const confirmDialog = container.querySelector<HTMLElement>(".confirm-modal");
    expect(confirmDialog).not.toBeNull();
    const confirmCloseButton = confirmDialog?.querySelector<HTMLButtonElement>(".confirm-confirm");
    expect(confirmCloseButton).not.toBeNull();
    fireEvent.click(confirmCloseButton!);

    expect(closeWindowMock).toHaveBeenCalledTimes(1);
  });

  it("reuses save target and updates document title after first save", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const createWritableMock = vi.fn().mockResolvedValue({
      write: writeMock,
      close: closeMock,
    });
    showSaveFilePickerMock.mockResolvedValue({
      name: "\u5ba2\u6237\u6807\u7b7e.lpt",
      createWritable: createWritableMock,
    });

    const { container } = render(<App />);
    enterEditorMode(container);

    exportToLocalFile();
    await waitFor(() => expect(showSaveFilePickerMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(createWritableMock).toHaveBeenCalledTimes(1));

    exportToLocalFile();
    await waitFor(() => expect(createWritableMock).toHaveBeenCalledTimes(2));
    expect(showSaveFilePickerMock).toHaveBeenCalledTimes(1);

    const activeTabButton = container.querySelector<HTMLButtonElement>(".doc-tab.active > button");
    expect(activeTabButton?.textContent).toBe("\u5ba2\u6237\u6807\u7b7e");
  });

  it("does not show unsaved labels in recent list", async () => {
    const { container } = render(<App />);
    const newTabButton = container.querySelector<HTMLButtonElement>(".new-tab");
    expect(newTabButton).not.toBeNull();
    fireEvent.click(newTabButton!);

    const confirmButton = container.querySelector<HTMLButtonElement>(".new-label-modal .primary");
    expect(confirmButton).not.toBeNull();
    fireEvent.click(confirmButton!);

    const homeButton = container.querySelector<HTMLButtonElement>(".brand-home");
    expect(homeButton).not.toBeNull();
    fireEvent.click(homeButton!);

    await waitFor(() => {
      expect(container.querySelectorAll(".home-label-item")).toHaveLength(0);
    });
  });

  it("records saved recent item by its saved name and shows explicit actions", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const createWritableMock = vi.fn().mockResolvedValue({
      write: writeMock,
      close: closeMock,
    });
    showSaveFilePickerMock.mockResolvedValue({
      name: "\u8d27\u67b6\u6807\u7b7e.lpt",
      createWritable: createWritableMock,
    });

    const { container } = render(<App />);
    enterEditorMode(container);
    const toolButtons = container.querySelectorAll<HTMLButtonElement>(".palette-tool");
    expect(toolButtons.length).toBeGreaterThan(0);
    fireEvent.click(toolButtons[0]);

    exportToLocalFile();
    await waitFor(() => expect(createWritableMock).toHaveBeenCalledTimes(1));

    const homeButton = container.querySelector<HTMLButtonElement>(".brand-home");
    expect(homeButton).not.toBeNull();
    fireEvent.click(homeButton!);

    await waitFor(() => {
      expect(container.querySelector(".home-label-item-name > strong")?.textContent).toBe("\u8d27\u67b6\u6807\u7b7e");
    });
    expect(container.querySelector(".home-recent-thumbnail")).not.toBeNull();
    expect(container.querySelectorAll(".home-label-action")).toHaveLength(3);
  });

  it("supports recent search by label name and allows clear/search actions", async () => {
    localStorage.setItem(
      "label-print.recent-opened",
      JSON.stringify([
        {
          id: "recent-a",
          fileName: "四月标签",
          saved: true,
          openedAt: Date.UTC(2026, 3, 5, 10, 20, 0),
          snapshot: {
            title: "四月测试",
            labelSize: { widthMm: 40, heightMm: 30 },
            elements: [],
            calibration: { offsetX: 0, offsetY: 0, scale: 1 },
            printerId: "Zebra-01",
            copies: 1,
          },
        },
        {
          id: "recent-b",
          fileName: "十二月标签",
          saved: true,
          openedAt: Date.UTC(2025, 11, 1, 9, 30, 0),
          snapshot: {
            title: "十二月测试",
            labelSize: { widthMm: 40, heightMm: 30 },
            elements: [],
            calibration: { offsetX: 0, offsetY: 0, scale: 1 },
            printerId: "Zebra-01",
            copies: 1,
          },
        },
      ])
    );

    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelectorAll(".home-label-item")).toHaveLength(2);
    });

    const searchInput = container.querySelector<HTMLInputElement>(".home-search input");
    expect(searchInput).not.toBeNull();
    fireEvent.change(searchInput!, { target: { value: "四月" } });

    const clearButton = container.querySelector<HTMLButtonElement>(".home-search-clear");
    const searchButton = container.querySelector<HTMLButtonElement>(".home-search-submit");
    expect(clearButton).not.toBeNull();
    expect(searchButton).not.toBeNull();

    fireEvent.click(searchButton!);
    await waitFor(() => {
      expect(container.querySelectorAll(".home-label-item")).toHaveLength(1);
      expect(container.querySelector(".home-label-item-name > strong")?.textContent).toBe("四月标签");
    });

    fireEvent.click(clearButton!);
    await waitFor(() => {
      expect(container.querySelectorAll(".home-label-item")).toHaveLength(2);
    });
  });

  it("opens the print dialog from a recent label without entering the editor", async () => {
    localStorage.setItem(
      "label-print.recent-opened",
      JSON.stringify([
        {
          id: "recent-print",
          fileName: "直接打印标签.lpt",
          saved: true,
          openedAt: Date.UTC(2026, 3, 5, 10, 20, 0),
          snapshot: {
            title: "不应显示的内部标题",
            labelSize: { widthMm: 40, heightMm: 30 },
            elements: [],
            calibration: { offsetX: 0, offsetY: 0, scale: 1 },
            printerId: "Zebra-01",
            copies: 1,
          },
        },
      ])
    );

    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelectorAll(".home-label-item")).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "打印" }));

    expect(container.querySelector(".print-modal")).not.toBeNull();
    expect(container.querySelector(".app-shell")).toHaveClass("home-mode");
    expect(container.querySelector(".doc-tab")).toBeNull();
    expect(screen.getByText("模板：直接打印标签 · 尺寸：40 × 30 mm")).toBeInTheDocument();
  });

  it("requires confirmation before removing a recent item", async () => {
    localStorage.setItem(
      "label-print.recent-opened",
      JSON.stringify([
        {
          id: "recent-delete",
          fileName: "可删除标签.lpt",
          filePath: "D:/labels/可删除标签.lpt",
          saved: true,
          openedAt: Date.UTC(2026, 3, 5, 10, 20, 0),
          snapshot: {
            title: "可删除标签",
            labelSize: { widthMm: 40, heightMm: 30 },
            elements: [],
            calibration: { offsetX: 0, offsetY: 0, scale: 1 },
            printerId: "Zebra-01",
            copies: 1,
          },
        },
      ])
    );

    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelectorAll(".home-label-item")).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByText("确认从最近使用中移除“可删除标签.lpt”吗？")).toBeInTheDocument();
    expect(screen.getByText("只会移除最近记录，不会删除电脑中的标签文件。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(container.querySelectorAll(".home-label-item")).toHaveLength(0);
    });
    expect(localStorage.getItem("label-print.recent-opened")).toBeNull();
  });

  it("saves .lpt opened from recent items back to remembered file path", async () => {
    localStorage.setItem(
      "label-print.recent-opened",
      JSON.stringify([
        {
          id: "recent-lpt",
          fileName: "订单标签.lpt",
          filePath: "D:/labels/store-a/订单标签.lpt",
          saved: true,
          openedAt: Date.UTC(2026, 3, 5, 10, 20, 0),
          snapshot: {
            title: "订单标签",
            labelSize: { widthMm: 40, heightMm: 30 },
            elements: [],
            calibration: { offsetX: 0, offsetY: 0, scale: 1 },
            printerId: "Zebra-01",
            copies: 1,
          },
        },
      ])
    );

    const invokeMock = vi.fn(async (command: string) => {
      if (command === "list_system_fonts") {
        return [];
      }
      if (command === "save_template_file") {
        return { fileName: "订单标签.lpt" };
      }
      return [];
    });
    Object.defineProperty(window, "__TAURI__", {
      configurable: true,
      writable: true,
      value: {
        core: {
          invoke: invokeMock,
        },
      },
    });

    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelectorAll(".home-label-item")).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    exportToLocalFile();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "save_template_file",
        expect.objectContaining({
          payload: expect.objectContaining({
            path: "D:/labels/store-a/订单标签.lpt",
          }),
        })
      );
    });
    expect(showSaveFilePickerMock).toHaveBeenCalledTimes(0);
  });

  it("imports .ddl template files into editor snapshot", async () => {
    const { container } = render(<App />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput?.getAttribute("accept")).toContain(".ddl");

    const ddlFile = new File([DDL_IMPORT_SAMPLE], "import-case.ddl", { type: "application/xml" });
    Object.defineProperty(ddlFile, "text", {
      configurable: true,
      value: async () => DDL_IMPORT_SAMPLE,
    });
    Object.defineProperty(fileInput!, "files", {
      configurable: true,
      value: [ddlFile],
    });
    fireEvent.change(fileInput!);

    await waitFor(() => {
      expect(container.querySelector(".command-status")?.textContent).toContain("import-case.ddl");
      expect(container.querySelector(".command-status")?.textContent).toContain(
        "\u5bfc\u51652\u4e2a\u5143\u7d20\uff0c\u5ffd\u75651\u4e2a"
      );
      expect(container.querySelector(".command-status")?.textContent).toContain("itemtype=99");
      const tabTitles = Array.from(container.querySelectorAll<HTMLButtonElement>(".doc-tab > button")).map(
        (button) => button.textContent
      );
      expect(tabTitles).toContain("import-case");
    });
  });

  it("switches to existing tab when opening the same file again", async () => {
    const { container } = render(<App />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const firstContent = JSON.stringify({
      title: "\u91cd\u590d\u6807\u7b7eA",
      labelSize: { widthMm: 40, heightMm: 30 },
      elements: [],
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "Zebra-01",
      copies: 1,
    });
    const secondContent = JSON.stringify({
      title: "\u91cd\u590d\u6807\u7b7eB",
      labelSize: { widthMm: 50, heightMm: 30 },
      elements: [],
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "Zebra-01",
      copies: 1,
    });

    const firstFile = new File([firstContent], "duplicate-open.json", { type: "application/json" });
    Object.defineProperty(firstFile, "text", {
      configurable: true,
      value: async () => firstContent,
    });
    Object.defineProperty(fileInput!, "files", {
      configurable: true,
      value: [firstFile],
    });
    fireEvent.change(fileInput!);

    await waitFor(() => {
      expect(container.querySelector(".doc-tab.active > button")?.textContent).toBe("duplicate-open");
    });
    const tabCountAfterFirstOpen = container.querySelectorAll(".doc-tab").length;

    const secondFile = new File([secondContent], "duplicate-open.json", { type: "application/json" });
    Object.defineProperty(secondFile, "text", {
      configurable: true,
      value: async () => "invalid-json",
    });
    Object.defineProperty(fileInput!, "files", {
      configurable: true,
      value: [secondFile],
    });
    fireEvent.change(fileInput!);

    await waitFor(() => {
      expect(container.querySelector(".command-status")?.textContent).toContain(
        "已切换到已打开模板：duplicate-open。"
      );
      expect(container.querySelectorAll(".doc-tab")).toHaveLength(tabCountAfterFirstOpen);
      expect(container.querySelector(".doc-tab.active > button")?.textContent).toBe("duplicate-open");
    });
  });
});
