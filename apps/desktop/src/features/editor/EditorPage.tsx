import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { DataImportDrawer } from "../data-import/DataImportDrawer";
import { CanvasStage } from "./CanvasStage";
import type { FontOption } from "./core/font-options";
import { LeftPalette } from "./LeftPalette";
import { RightInspector } from "./RightInspector";
import { useEditorStore } from "./editor.store";

type EditorPageProps = {
  systemFonts?: FontOption[];
};

export function EditorPage({ systemFonts = [] }: EditorPageProps) {
  const addTextElement = useEditorStore((state) => state.addTextElement);
  const addBarcodeElement = useEditorStore((state) => state.addBarcodeElement);
  const addImageElement = useEditorStore((state) => state.addImageElement);
  const addQrcodeElement = useEditorStore((state) => state.addQrcodeElement);
  const addShapeElement = useEditorStore((state) => state.addShapeElement);
  const addIconElement = useEditorStore((state) => state.addIconElement);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);

  const [importOpen, setImportOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (target?.isContentEditable) {
        return;
      }
      deleteSelection();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelection]);

  const onAddImageFromDisk = () => {
    imageInputRef.current?.click();
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

  return (
    <section className="editor-page">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={onImageFileChange}
        style={{ display: "none" }}
      />
      <div className="workspace editor-workspace">
        <aside className="panel left toolbar-panel">
          <LeftPalette
            onAddText={addTextElement}
            onAddBarcode={addBarcodeElement}
            onAddImage={onAddImageFromDisk}
            onAddQrcode={addQrcodeElement}
            onAddShape={(presetId) => addShapeElement({ presetId })}
            onAddIcon={(presetId) => addIconElement({ presetId })}
          />
        </aside>

        <CanvasStage systemFonts={systemFonts} />

        <aside className="panel right">
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

function getImageNameFromFile(fileName: string): string {
  const normalized = fileName.trim().replace(/\.[^/.]+$/, "");
  return normalized || "图片";
}
