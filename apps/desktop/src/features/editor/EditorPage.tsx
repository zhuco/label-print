import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { DataImportDrawer } from "../data-import/DataImportDrawer";
import { CanvasStage } from "./CanvasStage";
import type { FontOption } from "./core/font-options";
import { recognizeImageFile } from "./core/image-recognition";
import { buildElementsFromRecognition } from "./core/recognition-import";
import { readCustomPresets } from "./core/custom-presets";
import { LeftPalette } from "./LeftPalette";
import { RightInspector } from "./RightInspector";
import { selectActiveDocument, useEditorStore } from "./editor.store";
import { loadOrMigrateDesktopCustomPresets, replaceDesktopCustomPresets } from "../../services/ipc/custom-presets";

type EditorPageProps = {
  systemFonts?: FontOption[];
};

const LEFT_PANEL_VISIBILITY_KEY = "label-print.editor.left-panel-visible";
const RIGHT_PANEL_VISIBILITY_KEY = "label-print.editor.right-panel-visible";

export function EditorPage({ systemFonts = [] }: EditorPageProps) {
  const addTextElement = useEditorStore((state) => state.addTextElement);
  const addDateTimeElement = useEditorStore((state) => state.addDateTimeElement);
  const addBarcodeElement = useEditorStore((state) => state.addBarcodeElement);
  const addImageElement = useEditorStore((state) => state.addImageElement);
  const addQrcodeElement = useEditorStore((state) => state.addQrcodeElement);
  const addShapeElement = useEditorStore((state) => state.addShapeElement);
  const addIconElement = useEditorStore((state) => state.addIconElement);
  const applyIndustryTemplate = useEditorStore((state) => state.applyIndustryTemplate);
  const applyCustomPreset = useEditorStore((state) => state.applyCustomPreset);
  const customPresets = useEditorStore((state) => state.customPresets);
  const hydrateCustomPresets = useEditorStore((state) => state.hydrateCustomPresets);
  const updateCustomPresetMeta = useEditorStore((state) => state.updateCustomPresetMeta);
  const duplicateCustomPreset = useEditorStore((state) => state.duplicateCustomPreset);
  const deleteCustomPreset = useEditorStore((state) => state.deleteCustomPreset);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
  const groupSelection = useEditorStore((state) => state.groupSelection);
  const ungroupSelection = useEditorStore((state) => state.ungroupSelection);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const replaceElements = useEditorStore((state) => state.replaceElements);
  const setSelection = useEditorStore((state) => state.setSelection);

  const [importOpen, setImportOpen] = useState(false);
  const [recognizingImage, setRecognizingImage] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(isCompactViewport);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [leftPanelVisible, setLeftPanelVisible] = useState(() => readPanelVisibility(LEFT_PANEL_VISIBILITY_KEY));
  const [rightPanelVisible, setRightPanelVisible] = useState(() => readPanelVisibility(RIGHT_PANEL_VISIBILITY_KEY));
  const [desktopPresetLibraryReady, setDesktopPresetLibraryReady] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageRecognitionInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOrMigrateDesktopCustomPresets(readCustomPresets()).then((presets) => {
      if (cancelled || presets === null) return;
      hydrateCustomPresets(presets);
      setDesktopPresetLibraryReady(true);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [hydrateCustomPresets]);

  useEffect(() => {
    if (!desktopPresetLibraryReady) return;
    void replaceDesktopCustomPresets(customPresets).catch(() => undefined);
  }, [customPresets, desktopPresetLibraryReady]);

  useEffect(() => {
    if (!importOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setImportOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [importOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (target?.isContentEditable) {
        return;
      }
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) {
          ungroupSelection();
        } else {
          groupSelection();
        }
        return;
      }
      if (command && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelection(selectActiveDocument(useEditorStore.getState()).elements.map((element) => element.id));
        return;
      }
      if (event.key === "Escape") {
        clearSelection();
        return;
      }
      if (event.key === "Delete") {
        deleteSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelection, deleteSelection, groupSelection, setSelection, ungroupSelection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key !== "b" && key !== "i" && key !== "u") {
        return;
      }

      const document = selectActiveDocument(useEditorStore.getState());
      const selectedIds = new Set(document.selectedIds);
      const selectedTextElements = document.elements.filter(
        (element) => selectedIds.has(element.id) && (element.type === "text" || element.type === "barcode")
      );
      if (selectedTextElements.length === 0) {
        return;
      }

      event.preventDefault();
      const patch = key === "b"
        ? { fontWeight: selectedTextElements.every((element) => element.textStyle.fontWeight >= 700) ? 400 : 700 }
        : key === "i"
          ? { italic: !selectedTextElements.every((element) => element.textStyle.italic) }
          : { underline: !selectedTextElements.every((element) => element.textStyle.underline) };
      replaceElements(
        document.elements.map((element) =>
          selectedIds.has(element.id) && (element.type === "text" || element.type === "barcode")
            ? { ...element, textStyle: { ...element.textStyle, ...patch } }
            : element
        ),
        document.snapGuides,
        true
      );
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [replaceElements]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia("(max-width: 900px)");
    const onChange = () => {
      setIsCompactLayout(media.matches);
      setLeftPanelOpen(false);
      setRightPanelOpen(false);
    };
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const changeLeftPanelVisibility = (visible: boolean) => {
    setLeftPanelVisible(visible);
    writePanelVisibility(LEFT_PANEL_VISIBILITY_KEY, visible);
  };

  const changeRightPanelVisibility = (visible: boolean) => {
    setRightPanelVisible(visible);
    writePanelVisibility(RIGHT_PANEL_VISIBILITY_KEY, visible);
  };

  const onAddImageFromDisk = () => {
    imageInputRef.current?.click();
  };

  const onOpenImageRecognition = () => {
    if (recognizingImage) {
      return;
    }
    imageRecognitionInputRef.current?.click();
  };

  const onImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) {
        return;
      }
      addImageElement({
        name: getImageNameFromFile(file.name),
        dataUrl: reader.result,
      });
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const onImageRecognitionFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      return;
    }

    setRecognizingImage(true);
    try {
      const recognized = await recognizeImageFile(file);
      const active = selectActiveDocument(useEditorStore.getState());
      const importedElements = buildElementsFromRecognition(recognized, active.labelSize);
      if (importedElements.length > 0) {
        replaceElements([...active.elements, ...importedElements], [], true);
        setSelection(importedElements.map((item) => item.id));
      } else {
        const dataUrl = await readImageAsDataUrl(file);
        addImageElement({
          name: getImageNameFromFile(file.name),
          dataUrl,
        });
      }
    } catch {
      const dataUrl = await readImageAsDataUrl(file);
      addImageElement({
        name: getImageNameFromFile(file.name),
        dataUrl,
      });
    } finally {
      setRecognizingImage(false);
      event.target.value = "";
    }
  };

  return (
    <section className="editor-page">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={onImageFileChange}
        style={{ display: "none" }}
      />
      <input
        ref={imageRecognitionInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => void onImageRecognitionFileChange(event)}
        style={{ display: "none" }}
      />
      {isCompactLayout || !leftPanelVisible || !rightPanelVisible ? (
        <div className="editor-panel-toggles" aria-label="编辑器侧栏">
          {isCompactLayout || !leftPanelVisible ? (
            <button
              type="button"
              onClick={() => isCompactLayout ? setLeftPanelOpen(true) : changeLeftPanelVisibility(true)}
              aria-label="显示元素面板"
            >
              元素
            </button>
          ) : null}
          {isCompactLayout || !rightPanelVisible ? (
            <button
              type="button"
              onClick={() => isCompactLayout ? setRightPanelOpen(true) : changeRightPanelVisibility(true)}
              aria-label="显示属性面板"
            >
              属性
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={`workspace editor-workspace${isCompactLayout ? " compact" : ""}${!isCompactLayout && !leftPanelVisible ? " left-collapsed" : ""}${!isCompactLayout && !rightPanelVisible ? " right-collapsed" : ""}`}>
        <aside className={`panel left toolbar-panel${isCompactLayout ? " compact-panel" : ""}${leftPanelOpen ? " open" : ""}${!isCompactLayout && !leftPanelVisible ? " panel-hidden" : ""}`}>
          <header className="editor-panel-heading">
            <h2>元素</h2>
            <button
              type="button"
              className="editor-panel-close"
              onClick={() => isCompactLayout ? setLeftPanelOpen(false) : changeLeftPanelVisibility(false)}
              aria-label="隐藏元素面板"
              title="隐藏元素面板"
            >
              ×
            </button>
          </header>
          <LeftPalette
            onAddText={addTextElement}
            onAddDateTime={addDateTimeElement}
            onAddBarcode={addBarcodeElement}
            onAddImage={onAddImageFromDisk}
            onRecognizeImage={onOpenImageRecognition}
            onAddQrcode={addQrcodeElement}
            onAddShape={(presetId) => addShapeElement({ presetId })}
            onAddIcon={(presetId) => addIconElement({ presetId })}
            onApplyIndustryTemplate={applyIndustryTemplate}
            onApplyCustomPreset={applyCustomPreset}
            onUpdateCustomPresetMeta={updateCustomPresetMeta}
            onDuplicateCustomPreset={duplicateCustomPreset}
            onDeleteCustomPreset={deleteCustomPreset}
            customPresets={customPresets}
          />
        </aside>

        <CanvasStage systemFonts={systemFonts} />

        <aside className={`panel right${isCompactLayout ? " compact-panel" : ""}${rightPanelOpen ? " open" : ""}${!isCompactLayout && !rightPanelVisible ? " panel-hidden" : ""}`}>
          <header className="editor-panel-heading">
            <h2>属性</h2>
            <button
              type="button"
              className="editor-panel-close"
              onClick={() => isCompactLayout ? setRightPanelOpen(false) : changeRightPanelVisibility(false)}
              aria-label="隐藏属性面板"
              title="隐藏属性面板"
            >
              ×
            </button>
          </header>
          <RightInspector systemFonts={systemFonts} />
        </aside>
      </div>

      {importOpen ? (
        <div className="modal-mask" onClick={() => setImportOpen(false)}>
          <section className="modal-card import-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>导入数据</h3>
              <button type="button" onClick={() => setImportOpen(false)} aria-label="关闭导入弹窗">
                ×
              </button>
            </header>
            <DataImportDrawer requiredFields={["sku", "price", "code"]} />
          </section>
        </div>
      ) : null}
    </section>
  );
}

function isCompactViewport(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 900px)").matches;
}

function readPanelVisibility(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== "false";
  } catch {
    return true;
  }
}

function writePanelVisibility(key: string, visible: boolean) {
  try {
    window.localStorage.setItem(key, String(visible));
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
}

function getImageNameFromFile(fileName: string): string {
  const normalized = fileName.trim().replace(/\.[^/.]+$/, "");
  return normalized || "图片";
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read image failed"));
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.startsWith("data:image/")) {
        resolve(reader.result);
        return;
      }
      reject(new Error("invalid image data"));
    };
    reader.readAsDataURL(file);
  });
}

