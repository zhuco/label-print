import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NewLabelModal } from "../NewLabelModal";

function buildProps() {
  return {
    open: true,
    title: "测试标签",
    widthMm: 40,
    heightMm: 30,
    onClose: vi.fn(),
    onTitleChange: vi.fn(),
    onWidthChange: vi.fn(),
    onHeightChange: vi.fn(),
    onConfirm: vi.fn(),
  };
}

describe("New label modal keyboard shortcuts", () => {
  afterEach(() => cleanup());

  it("confirms creation when Enter is pressed", () => {
    const props = buildProps();
    render(<NewLabelModal {...props} />);

    fireEvent.keyDown(window, { key: "Enter" });

    expect(props.onConfirm).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("closes without creating when Escape is pressed", () => {
    const props = buildProps();
    render(<NewLabelModal {...props} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("ignores Enter while an input method is composing text", () => {
    const props = buildProps();
    render(<NewLabelModal {...props} />);

    fireEvent.keyDown(window, { key: "Enter", isComposing: true });

    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});
