import { useEffect, useState } from "react";

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

  return (
    <section className="editor-page">
      <div className="workspace editor-workspace">
        <aside className="panel left toolbar-panel">
          <LeftPalette
            onAddText={addTextElement}
            onAddBarcode={addBarcodeElement}
            onAddImage={addImageElement}
            onAddQrcode={addQrcodeElement}
            onAddShape={addShapeElement}
            onAddIcon={addIconElement}
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
