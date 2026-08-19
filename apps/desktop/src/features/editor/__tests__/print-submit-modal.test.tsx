import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toPngMock = vi.fn();
const getFontEmbedCSSMock = vi.fn();

vi.mock("html-to-image", () => ({
  toPng: (...args: unknown[]) => toPngMock(...args),
  getFontEmbedCSS: (...args: unknown[]) => getFontEmbedCSSMock(...args),
}));

import { PrintSubmitModal } from "../PrintSubmitModal";
import { createShapeElement } from "../core/model";
import { toShapePresetBindingValue } from "../core/visual-presets";

function buildProps() {
  return {
    open: true,
    title: "测试标签",
    labelSize: { widthMm: 40, heightMm: 30 },
    printers: ["Zebra-01", "Microsoft Print to PDF"],
    printerHint: "已读取到 2 台系统打印机。",
    printerId: "Zebra-01",
    copies: 10,
    elements: [],
    printRecords: [{}],
    submitStatus: "",
    submitting: false,
    loadingPrinters: false,
    onClose: vi.fn(),
    onRefreshPrinters: vi.fn(),
    onPrinterChange: vi.fn(),
    onCopiesChange: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue(true),
  };
}

describe("Print submit modal", () => {
  beforeEach(() => {
    toPngMock.mockReset();
    toPngMock.mockResolvedValue("data:image/png;base64,ZmFrZQ==");
    getFontEmbedCSSMock.mockReset();
    getFontEmbedCSSMock.mockResolvedValue("@font-face { font-family: test; }");
  });

  afterEach(() => {
    cleanup();
  });

  it("shows print, cancel, refresh actions and printer hint", () => {
    render(<PrintSubmitModal {...buildProps()} />);

    expect(screen.getByRole("button", { name: "打印" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新系统打印机" })).toBeInTheDocument();
    expect(screen.getByText("已读取到 2 台系统打印机。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "500" })).not.toBeInTheDocument();
  });

  it("submits direct print payload with one rendered image per record", async () => {
    const props = buildProps();
    props.printRecords = [{ sku: "A-001" }, { sku: "B-002" }];
    props.elements = [{
      id: "text-1",
      type: "text",
      name: "SKU",
      xMm: 1,
      yMm: 1,
      widthMm: 30,
      heightMm: 8,
      rotation: 0,
      binding: { mode: "column", column: "sku" },
      textStyle: { fontFamily: "Arial", fontSize: 3, fontWeight: 400, italic: false, underline: false, align: "left", color: "#000000", letterSpacing: 0, lineHeight: 1.2 },
    }] as never;
    toPngMock.mockImplementation(async (node: HTMLElement) =>
      node.textContent?.includes("A-001") ? "data:image/png;base64,QS0wMDE=" : "data:image/png;base64,Qi0wMDI="
    );
    render(<PrintSubmitModal {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "打印" }));

    await waitFor(() => {
      expect(props.onConfirm).toHaveBeenCalledTimes(1);
    });
    expect(props.onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        printerId: "Zebra-01",
        copies: 10,
        widthMm: 40,
        heightMm: 30,
        previewPngBase64s: ["QS0wMDE=", "Qi0wMDI="],
      })
    );
    expect(toPngMock).toHaveBeenCalledTimes(2);
    expect(getFontEmbedCSSMock).toHaveBeenCalledTimes(1);
    expect(toPngMock.mock.calls[0]?.[1]).toMatchObject({
      fontEmbedCSS: "@font-face { font-family: test; }",
    });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open when submitting the print task fails", async () => {
    const props = buildProps();
    props.onConfirm = vi.fn().mockResolvedValue(false);
    render(<PrintSubmitModal {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "打印" }));

    await waitFor(() => {
      expect(props.onConfirm).toHaveBeenCalledOnce();
    });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("captures preview in export mode to avoid UI border artifacts", async () => {
    const props = buildProps();
    toPngMock.mockImplementation(async (node: HTMLElement, options: Record<string, unknown>) => {
      expect(node.classList.contains("print-preview-capture-mode")).toBe(true);
      expect(options).toMatchObject({
        cacheBust: false,
        backgroundColor: "#ffffff",
        canvasWidth: 472,
        canvasHeight: 354,
        fontEmbedCSS: "@font-face { font-family: test; }",
        pixelRatio: 1,
      });
      return "data:image/png;base64,ZmFrZQ==";
    });

    const { container } = render(<PrintSubmitModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "打印" }));

    await waitFor(() => {
      expect(props.onConfirm).toHaveBeenCalledTimes(1);
    });

    const surface = container.querySelector<HTMLElement>(".print-preview-canvas-surface");
    expect(surface?.classList.contains("print-preview-capture-mode")).toBe(false);
  });

  it("uses CSS borders for rectangle presets so export keeps their line width", () => {
    const props = buildProps();
    props.elements = [createShapeElement({
      id: "shape-1",
      binding: { mode: "fixed", fixedValue: toShapePresetBindingValue("rectangle") },
      textStyle: { fillColor: "#2a6fa8", fillOpacity: 0.12 },
    })] as never;

    const { container } = render(<PrintSubmitModal {...props} />);
    const presetShape = container.querySelector<HTMLElement>(".print-preview-css-shape");

    expect(presetShape).not.toBeNull();
    expect(presetShape?.querySelector("svg")).toBeNull();
    expect(presetShape?.style.borderWidth).toBe("1.3px");
    expect(presetShape?.style.borderRadius).toBe("0");
    expect(presetShape?.style.backgroundColor).toBe("transparent");
  });

  it("supports keyboard shortcuts", async () => {
    const props = buildProps();
    render(<PrintSubmitModal {...props} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => {
      expect(props.onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it("focuses copies input and selects all text when opened", async () => {
    render(<PrintSubmitModal {...buildProps()} />);

    const input = screen.getByRole("textbox", { name: "打印数量" }) as HTMLInputElement;
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(String(input.value).length);
  });
});
