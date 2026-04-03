import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const minimizeWindowMock = vi.fn();
const toggleMaximizeWindowMock = vi.fn();
const closeWindowMock = vi.fn();
const startDragWindowMock = vi.fn();
const showSaveFilePickerMock = vi.fn();

vi.mock("../../services/ipc/window-controls", () => ({
  minimizeWindow: () => minimizeWindowMock(),
  toggleMaximizeWindow: () => toggleMaximizeWindowMock(),
  closeWindow: () => closeWindowMock(),
  startDragWindow: () => startDragWindowMock(),
}));

import App from "../../App";

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

describe("App shell", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    minimizeWindowMock.mockReset();
    toggleMaximizeWindowMock.mockReset();
    closeWindowMock.mockReset();
    startDragWindowMock.mockReset();
    showSaveFilePickerMock.mockReset();
    localStorage.clear();

    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      writable: true,
      value: showSaveFilePickerMock,
    });
  });

  it("renders custom titlebar with logo and tabs", () => {
    render(<App />);
    expect(screen.getByText("标签打印")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ / })).toBeInTheDocument();
  });

  it("returns to home when clicking logo area", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /标签打印/ }));

    expect(screen.getByRole("button", { name: "新建标签" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开标签" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入文件名或标签名")).toBeInTheDocument();
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

  it("uses file picker when clicking open command button", () => {
    const { container, getByTestId } = render(<App />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const clickSpy = vi.spyOn(fileInput!, "click");
    fireEvent.click(getByTestId("cmd-open"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("opens save dialog when clicking save command button", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const createWritableMock = vi.fn().mockResolvedValue({
      write: writeMock,
      close: closeMock,
    });
    showSaveFilePickerMock.mockResolvedValue({
      createWritable: createWritableMock,
    });

    const { getByTestId } = render(<App />);
    fireEvent.click(getByTestId("cmd-save"));

    await waitFor(() => expect(showSaveFilePickerMock).toHaveBeenCalledTimes(1));
    expect(createWritableMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("reuses save target and updates document title after first save", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const createWritableMock = vi.fn().mockResolvedValue({
      write: writeMock,
      close: closeMock,
    });
    showSaveFilePickerMock.mockResolvedValue({
      name: "客户标签.lpt",
      createWritable: createWritableMock,
    });

    const { getByTestId, container } = render(<App />);

    fireEvent.click(getByTestId("cmd-save"));
    await waitFor(() => expect(showSaveFilePickerMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(createWritableMock).toHaveBeenCalledTimes(1));

    fireEvent.click(getByTestId("cmd-save"));
    await waitFor(() => expect(createWritableMock).toHaveBeenCalledTimes(2));
    expect(showSaveFilePickerMock).toHaveBeenCalledTimes(1);

    const activeTabButton = container.querySelector<HTMLButtonElement>(".doc-tab.active > button");
    expect(activeTabButton?.textContent).toBe("客户标签");
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
      expect(container.querySelectorAll(".home-recent-card")).toHaveLength(0);
    });
  });

  it("records saved recent item by saved name and renders drawable thumbnail", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const createWritableMock = vi.fn().mockResolvedValue({
      write: writeMock,
      close: closeMock,
    });
    showSaveFilePickerMock.mockResolvedValue({
      name: "货架标签.lpt",
      createWritable: createWritableMock,
    });

    const { getByTestId, container } = render(<App />);
    const toolButtons = container.querySelectorAll<HTMLButtonElement>(".palette-tool");
    expect(toolButtons.length).toBeGreaterThan(0);
    fireEvent.click(toolButtons[0]);

    fireEvent.click(getByTestId("cmd-save"));
    await waitFor(() => expect(createWritableMock).toHaveBeenCalledTimes(1));

    const homeButton = container.querySelector<HTMLButtonElement>(".brand-home");
    expect(homeButton).not.toBeNull();
    fireEvent.click(homeButton!);

    await waitFor(() => {
      expect(container.querySelector(".home-recent-meta > h4")?.textContent).toBe("货架标签");
    });
    expect(container.querySelector(".home-recent-thumbnail")).not.toBeNull();
    expect(container.querySelectorAll(".home-thumb-element").length).toBeGreaterThan(0);
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
      expect(container.querySelector(".command-status")?.textContent).toContain("导入2个元素，忽略1个");
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
      title: "重复标签A",
      labelSize: { widthMm: 40, heightMm: 30 },
      elements: [],
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "Zebra-01",
      copies: 1,
    });
    const secondContent = JSON.stringify({
      title: "重复标签B",
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
      expect(container.querySelector(".doc-tab.active > button")?.textContent).toBe("重复标签A");
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
      expect(container.querySelector(".command-status")?.textContent).toContain("已切换到已打开模板：重复标签A。");
      expect(container.querySelectorAll(".doc-tab")).toHaveLength(tabCountAfterFirstOpen);
      expect(container.querySelector(".doc-tab.active > button")?.textContent).toBe("重复标签A");
    });
  });
});
