import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrintSubmitModal } from "../PrintSubmitModal";

function buildProps() {
  return {
    open: true,
    title: "测试标签",
    labelSize: { widthMm: 40, heightMm: 30 },
    printers: ["Zebra-01"],
    printerId: "Zebra-01",
    copies: 10,
    elements: [],
    previewRecord: {},
    submitStatus: "",
    submitting: false,
    onClose: vi.fn(),
    onPrinterChange: vi.fn(),
    onCopiesChange: vi.fn(),
    onConfirm: vi.fn(),
  };
}

describe("Print submit modal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all quick submit buttons", () => {
    render(<PrintSubmitModal {...buildProps()} />);

    expect(screen.getByRole("button", { name: "提交50" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交100" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交200" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交300" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交500" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交1000" })).toBeInTheDocument();
  });

  it("submits selected quick quantity", () => {
    const props = buildProps();
    render(<PrintSubmitModal {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "提交500" }));

    expect(props.onCopiesChange).toHaveBeenCalledWith(500);
    expect(props.onConfirm).toHaveBeenCalledWith(500);
  });

  it("supports keyboard shortcuts", () => {
    const props = buildProps();
    render(<PrintSubmitModal {...props} />);

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Enter" });

    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onConfirm).toHaveBeenCalledWith();
  });
});
