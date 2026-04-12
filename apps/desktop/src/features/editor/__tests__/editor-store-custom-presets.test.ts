import { beforeEach, describe, expect, it } from "vitest";

import { resetEditorStoreForTests, selectActiveDocument, useEditorStore } from "../editor.store";

describe("editor custom presets", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEditorStoreForTests();
  });

  it("saves one or more selected elements into a custom preset", () => {
    const store = useEditorStore.getState();
    store.addTextElement();
    store.addBarcodeElement();

    const active = selectActiveDocument(useEditorStore.getState());
    store.setSelection(active.elements.map((item) => item.id));

    const saved = (useEditorStore.getState() as unknown as {
      saveSelectionAsCustomPreset: (input: { name: string; category: string }) => boolean;
    }).saveSelectionAsCustomPreset({
      name: "收货标签片段",
      category: "物流",
    });

    expect(saved).toBe(true);

    const nextState = useEditorStore.getState() as unknown as {
      customPresets: Array<{ id: string; name: string; category: string; elementCount: number }>;
    };
    expect(nextState.customPresets.length).toBe(1);
    expect(nextState.customPresets[0].name).toBe("收货标签片段");
    expect(nextState.customPresets[0].category).toBe("物流");
    expect(nextState.customPresets[0].elementCount).toBe(2);
  });

  it("applies a saved custom preset back to canvas", () => {
    const store = useEditorStore.getState();
    store.addTextElement();

    const active = selectActiveDocument(useEditorStore.getState());
    store.setSelection(active.elements.map((item) => item.id));

    const api = useEditorStore.getState() as unknown as {
      saveSelectionAsCustomPreset: (input: { name: string; category: string }) => boolean;
      applyCustomPreset: (id: string) => void;
    };

    const saved = api.saveSelectionAsCustomPreset({
      name: "单行文本",
      category: "常用",
    });
    expect(saved).toBe(true);

    store.replaceElements([], [], true);
    store.setSelection([]);
    const latest = useEditorStore.getState() as unknown as {
      customPresets: Array<{ id: string }>;
      applyCustomPreset: (id: string) => void;
    };
    latest.applyCustomPreset(latest.customPresets[0].id);

    const nextActive = selectActiveDocument(useEditorStore.getState());
    expect(nextActive.elements.length).toBe(1);
    expect(nextActive.selectedIds.length).toBe(1);
  });
});
