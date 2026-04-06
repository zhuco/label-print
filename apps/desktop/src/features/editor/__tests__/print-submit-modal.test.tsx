import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toPngMock = vi.fn();

vi.mock("html-to-image", () => ({
  toPng: (...args: unknown[]) => toPngMock(...args),
}));

import { PrintSubmitModal } from "../PrintSubmitModal";

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
    previewRecord: {},
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

  it("submits direct print payload with preview image", async () => {
    const props = buildProps();
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
        previewPngBase64: "ZmFrZQ==",
      })
    );
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
