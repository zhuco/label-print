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

  it("saves the complete selection snapshot even if the active selection changes before confirmation", () => {
    const store = useEditorStore.getState();
    store.addTextElement();
    store.addBarcodeElement();
    store.addQrcodeElement();

    const selectedIds = selectActiveDocument(useEditorStore.getState()).elements.map((item) => item.id);
    store.setSelection(selectedIds);
    store.setSelection([selectedIds[0]]);

    const saved = useEditorStore.getState().saveSelectionAsCustomPreset({
      name: "完整选区",
      category: "常用",
      selectedIds,
    });

    expect(saved).toBe(true);
    expect(useEditorStore.getState().customPresets[0].elementCount).toBe(3);
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
    expect(nextActive.elements[0]?.groupId).toBeTruthy();
    expect(nextActive.elements[0]?.presetInstanceId).toBeTruthy();
    expect(nextActive.elements[0]?.sourcePresetId).toBe(latest.customPresets[0].id);
  });

  it("groups and ungroups selected elements without flattening their editable data", () => {
    const store = useEditorStore.getState();
    store.addTextElement();
    store.addBarcodeElement();
    const active = selectActiveDocument(useEditorStore.getState());
    store.setSelection(active.elements.map((element) => element.id));

    expect(store.groupSelection()).toBe(true);
    const grouped = selectActiveDocument(useEditorStore.getState());
    const groupId = grouped.elements[0]?.groupId;
    expect(groupId).toBeTruthy();
    expect(grouped.elements.every((element) => element.groupId === groupId)).toBe(true);

    expect(useEditorStore.getState().ungroupSelection()).toBe(true);
    expect(selectActiveDocument(useEditorStore.getState()).elements.every((element) => !element.groupId)).toBe(true);
  });

  it("updates, duplicates, and deletes a custom preset explicitly", () => {
    const store = useEditorStore.getState();
    store.addTextElement();
    const active = selectActiveDocument(useEditorStore.getState());
    store.setSelection(active.elements.map((element) => element.id));
    expect(store.saveSelectionAsCustomPreset({ name: "原图形", category: "常用" })).toBe(true);
    const presetId = useEditorStore.getState().customPresets[0]!.id;

    store.addBarcodeElement();
    const current = selectActiveDocument(useEditorStore.getState());
    store.setSelection(current.elements.map((element) => element.id));
    expect(useEditorStore.getState().updateCustomPresetFromSelection(presetId)).toBe(true);
    expect(useEditorStore.getState().customPresets[0]!.elementCount).toBe(2);
    expect(useEditorStore.getState().updateCustomPresetMeta(presetId, { name: "新图形", category: "物流" })).toBe(true);
    expect(useEditorStore.getState().customPresets[0]).toMatchObject({ name: "新图形", category: "物流" });
    expect(useEditorStore.getState().duplicateCustomPreset(presetId)).toBe(true);
    expect(useEditorStore.getState().customPresets).toHaveLength(2);
    expect(useEditorStore.getState().deleteCustomPreset(presetId)).toBe(true);
    expect(useEditorStore.getState().customPresets).toHaveLength(1);
  });
});
