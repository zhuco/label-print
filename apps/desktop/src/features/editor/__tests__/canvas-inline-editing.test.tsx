import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CanvasStage } from "../CanvasStage";
import { selectActiveDocument, useEditorStore } from "../editor.store";

afterEach(() => {
  cleanup();
});

function openEmptyDocument() {
  return useEditorStore.getState().createDocument({
    title: `inline-edit-${Date.now()}-${Math.random()}`,
    labelSize: { widthMm: 40, heightMm: 30 },
  });
}

describe("canvas inline editing", () => {
  it("keeps the text preview mounted and updates it on every input change", () => {
    openEmptyDocument();
    useEditorStore.getState().addTextElement();

    const { container } = render(<CanvasStage systemFonts={[]} />);
    const element = container.querySelector<HTMLElement>(".canvas-element");
    expect(element).not.toBeNull();

    fireEvent.doubleClick(element!);
    const editor = screen.getByRole("textbox", { name: "编辑文本内容（实时预览）" });
    expect(element).toContainElement(editor);
    expect(editor).toHaveClass("inline-editor-inplace");
    expect(container.querySelector(".canvas-element.editing .inline-editor-popover")).toBeNull();
    fireEvent.change(editor, { target: { value: "实时文本\n第二行" } });

    expect(container.querySelector(".element-content")).toHaveTextContent("实时文本 第二行");
    expect(container.querySelector(".canvas-element.editing .element-content")).not.toBeNull();

    fireEvent.blur(editor);
    const document = selectActiveDocument(useEditorStore.getState());
    expect(document.elements[0]?.binding).toMatchObject({ mode: "fixed", fixedValue: "实时文本\n第二行" });
  });

  it("fits a live barcode render to its element while the value changes", () => {
    openEmptyDocument();
    useEditorStore.getState().addBarcodeElement();

    const { container } = render(<CanvasStage systemFonts={[]} />);
    const element = container.querySelector<HTMLElement>(".canvas-element");
    expect(element).not.toBeNull();

    fireEvent.doubleClick(element!);
    const editor = screen.getByRole("textbox", { name: "编辑内容（实时预览）" });
    fireEvent.change(editor, { target: { value: "ABC123456789XYZ" } });

    expect(container.querySelector(".barcode-preview-text")).toHaveTextContent("ABC123456789XYZ");
    const svg = container.querySelector<SVGSVGElement>(".barcode-svg");
    expect(svg).toHaveAttribute("width", "100%");
    expect(svg).toHaveAttribute("height", "100%");
    expect(svg).toHaveAttribute("preserveAspectRatio", "none");
    expect(svg).toHaveAttribute("viewBox");
  });

  it("keeps other element previews mounted during live editing", () => {
    openEmptyDocument();
    useEditorStore.getState().addQrcodeElement();

    const { container } = render(<CanvasStage systemFonts={[]} />);
    const element = container.querySelector<HTMLElement>(".canvas-element");
    expect(element).not.toBeNull();

    fireEvent.doubleClick(element!);
    const editor = screen.getByRole("textbox", { name: "编辑内容（实时预览）" });
    fireEvent.change(editor, { target: { value: "https://example.test/live" } });

    expect(container.querySelector(".canvas-element.editing .qrcode-preview")).not.toBeNull();
    expect(editor).toHaveValue("https://example.test/live");
  });

  it("draws solid rectangle frames inside their bounds so no edge is clipped", () => {
    openEmptyDocument();
    useEditorStore.getState().addShapeElement({ presetId: "rectangle" });

    const { container } = render(<CanvasStage systemFonts={[]} />);
    const frame = container.querySelector<HTMLElement>(".shape-preview-css-frame");

    expect(frame).not.toBeNull();
    expect(frame?.querySelector("svg")).toBeNull();
    expect(frame?.style.borderWidth).toBe("0px");
    expect(frame?.style.boxShadow).toBe("inset 0 0 0 1.3px #2a6fa8");
  });
});
