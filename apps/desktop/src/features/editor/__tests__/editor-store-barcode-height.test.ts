import { beforeEach, describe, expect, it } from "vitest";

import { resetEditorStoreForTests, selectActiveDocument, useEditorStore } from "../editor.store";

describe("editor barcode height constraint", () => {
  beforeEach(() => {
    resetEditorStoreForTests();
  });

  it("allows barcode element height down to 3mm", () => {
    const store = useEditorStore.getState();
    store.addBarcodeElement();

    const active = selectActiveDocument(useEditorStore.getState());
    const barcodeId = active.selectedIds[0];
    expect(barcodeId).toBeTruthy();

    store.updateElementRect(barcodeId, { heightMm: 2.2 }, false);

    const next = selectActiveDocument(useEditorStore.getState());
    const barcode = next.elements.find((item) => item.id === barcodeId);
    expect(barcode?.type).toBe("barcode");
    expect(barcode?.heightMm).toBe(3);
  });
});
