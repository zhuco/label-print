import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EditorPage } from "../EditorPage";
import { resetEditorStoreForTests, selectActiveDocument, useEditorStore } from "../editor.store";

describe("editor text style shortcuts", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEditorStoreForTests();
  });

  afterEach(() => {
    cleanup();
  });

  it("toggles bold, italic, and underline for selected text elements", () => {
    const store = useEditorStore.getState();
    store.addTextElement();
    const textId = selectActiveDocument(useEditorStore.getState()).selectedIds[0]!;
    store.addBarcodeElement();
    const barcodeId = selectActiveDocument(useEditorStore.getState()).selectedIds[0]!;
    store.setSelection([textId, barcodeId]);
    render(<EditorPage />);

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    fireEvent.keyDown(window, { key: "i", ctrlKey: true });
    fireEvent.keyDown(window, { key: "u", ctrlKey: true });

    const elements = selectActiveDocument(useEditorStore.getState()).elements;
    for (const id of [textId, barcodeId]) {
      const element = elements.find((item) => item.id === id);
      expect(element?.textStyle).toMatchObject({ fontWeight: 700, italic: true, underline: true });
    }

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    fireEvent.keyDown(window, { key: "i", ctrlKey: true });
    fireEvent.keyDown(window, { key: "u", ctrlKey: true });

    const toggledElements = selectActiveDocument(useEditorStore.getState()).elements;
    for (const id of [textId, barcodeId]) {
      const element = toggledElements.find((item) => item.id === id);
      expect(element?.textStyle).toMatchObject({ fontWeight: 400, italic: false, underline: false });
    }
  });

  it("does not apply text shortcuts to non-text selected elements", () => {
    const store = useEditorStore.getState();
    store.addTextElement();
    const textId = selectActiveDocument(useEditorStore.getState()).selectedIds[0]!;
    store.addQrcodeElement();
    const qrcodeId = selectActiveDocument(useEditorStore.getState()).selectedIds[0]!;
    store.setSelection([textId, qrcodeId]);
    render(<EditorPage />);

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });

    const elements = selectActiveDocument(useEditorStore.getState()).elements;
    expect(elements.find((item) => item.id === textId)?.textStyle.fontWeight).toBe(700);
    expect(elements.find((item) => item.id === qrcodeId)?.textStyle.fontWeight).toBe(400);
  });

  it("leaves native text editing shortcuts available while an input is focused", () => {
    const store = useEditorStore.getState();
    store.addTextElement();
    const textId = selectActiveDocument(useEditorStore.getState()).selectedIds[0]!;
    const { container } = render(<EditorPage />);
    const input = container.querySelector<HTMLInputElement>("input[type='file']")!;
    input.focus();

    fireEvent.keyDown(input, { key: "b", ctrlKey: true });

    expect(selectActiveDocument(useEditorStore.getState()).elements.find((item) => item.id === textId)?.textStyle.fontWeight).toBe(400);
  });
});
