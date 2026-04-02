import { useMemo, useState } from "react";

import { DataImportDrawer } from "../data-import/DataImportDrawer";
import { PrintPanel } from "../print/PrintPanel";
import { CanvasStage } from "./CanvasStage";
import { LeftPalette } from "./LeftPalette";
import { RightInspector } from "./RightInspector";
import { useEditorStore } from "./editor.store";

const SMALL_BREAKPOINT = 1440;

export function EditorPage() {
  const elements = useEditorStore((state) => state.elements);
  const addElement = useEditorStore((state) => state.addElement);

  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const isCompact = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth <= SMALL_BREAKPOINT;
  }, []);

  const addText = () => {
    addElement({
      id: `text-${Date.now()}`,
      type: "text",
      label: "文本元素",
    });
  };

  const addBarcode = () => {
    addElement({
      id: `barcode-${Date.now()}`,
      type: "barcode",
      label: "条码元素",
    });
  };

  return (
    <section>
      {isCompact && (
        <div className="toolbar">
          <button type="button" onClick={() => setLeftOpen((v) => !v)} aria-label="展开元素面板">
            {leftOpen ? "收起元素面板" : "展开元素面板"}
          </button>
          <button type="button" onClick={() => setRightOpen((v) => !v)} aria-label="展开属性面板">
            {rightOpen ? "收起属性面板" : "展开属性面板"}
          </button>
        </div>
      )}

      <div className="workspace">
        <aside className={`panel left ${leftOpen ? "open" : ""}`}>
          <LeftPalette onAddText={addText} onAddBarcode={addBarcode} />
        </aside>

        <CanvasStage elements={elements} />

        <aside className={`panel right ${rightOpen ? "open" : ""}`}>
          <RightInspector selected={elements[0] ?? null} />
        </aside>
      </div>

      <DataImportDrawer requiredFields={["sku", "price"]} />
      <PrintPanel
        jobs={[{ id: 1, status: "running", totalItems: 20 }]}
        onPause={() => undefined}
        onResume={() => undefined}
        onCancel={() => undefined}
      />
    </section>
  );
}