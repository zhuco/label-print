import { useRef, type ChangeEvent } from "react";

import { useDataImportStore } from "../data-import/data-import.store";
import { BARCODE_SYMBOLOGY_OPTIONS, getDefaultBarcodeValue } from "./core/barcode";
import { resolveBindingValue } from "./core/binding";
import { DEFAULT_FONT_OPTIONS, type FontOption, withCurrentFont } from "./core/font-options";
import type { BarcodeSymbology, ContentBinding, EditorElement } from "./core/types";
import { selectActiveDocument, useEditorStore } from "./editor.store";

type RightInspectorProps = {
  systemFonts: FontOption[];
};

export function RightInspector({ systemFonts }: RightInspectorProps) {
  const activeDocument = useEditorStore(selectActiveDocument);
  const elements = activeDocument.elements;
  const selectedIds = activeDocument.selectedIds;
  const updateElementRect = useEditorStore((state) => state.updateElementRect);
  const updateSelectedBinding = useEditorStore((state) => state.updateSelectedBinding);
  const updateSelectedTextStyle = useEditorStore((state) => state.updateSelectedTextStyle);
  const updateSelectedBarcode = useEditorStore((state) => state.updateSelectedBarcode);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const columns = useDataImportStore((state) => state.columns);
  const rows = useDataImportStore((state) => state.rows);

  const selectedElement =
    selectedIds.length === 1
      ? elements.find((element) => element.id === selectedIds[0]) ?? null
      : null;
  const selectedCount = selectedIds.length;
  const fontOptions = withCurrentFont(
    systemFonts.length > 0 ? systemFonts : DEFAULT_FONT_OPTIONS,
    selectedElement?.textStyle.fontFamily ?? ""
  );

  if (selectedCount === 0) {
    return <p className="muted">请选择对象后编辑参数。</p>;
  }

  if (!selectedElement) {
    return <p className="muted">已选中 {selectedCount} 项，可使用左侧工具栏进行对齐。</p>;
  }

  const previewRow = rows[0] ?? {};
  const previewValue = resolveBindingValue(selectedElement.binding, previewRow);
  const hasEmbeddedImage =
    selectedElement.type === "image" &&
    selectedElement.binding.mode === "fixed" &&
    typeof selectedElement.binding.fixedValue === "string" &&
    selectedElement.binding.fixedValue.startsWith("data:image/");

  const onSymbologyChange = (nextSymbology: BarcodeSymbology) => {
    if (selectedElement.type !== "barcode") {
      return;
    }

    const currentSymbology = selectedElement.barcode.symbology;
    updateSelectedBarcode({ symbology: nextSymbology });

    if (selectedElement.binding.mode !== "fixed") {
      return;
    }

    const currentValue = selectedElement.binding.fixedValue ?? "";
    const currentDefault = getDefaultBarcodeValue(currentSymbology);
    if (!currentValue || currentValue === currentDefault) {
      updateSelectedBinding({
        mode: "fixed",
        fixedValue: getDefaultBarcodeValue(nextSymbology),
      });
    }
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
      if (typeof reader.result !== "string" || !reader.result) {
        return;
      }
      updateSelectedBinding({
        mode: "fixed",
        fixedValue: reader.result,
      });
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return (
    <div className="inspector">
      <p className="muted">当前对象: {selectedElement.name}</p>

      <section>
        <h3>基础参数</h3>
        <div className="form-grid">
          <NumericInput
            label="水平(mm)"
            value={selectedElement.xMm}
            onChange={(value) => updateElementRect(selectedElement.id, { xMm: value })}
          />
          <NumericInput
            label="垂直(mm)"
            value={selectedElement.yMm}
            onChange={(value) => updateElementRect(selectedElement.id, { yMm: value })}
          />
          <NumericInput
            label="宽(mm)"
            value={selectedElement.widthMm}
            min={1}
            onChange={(value) => updateElementRect(selectedElement.id, { widthMm: value })}
          />
          <NumericInput
            label="高(mm)"
            value={selectedElement.heightMm}
            min={1}
            onChange={(value) => updateElementRect(selectedElement.id, { heightMm: value })}
          />
          <NumericInput
            label="旋转(°)"
            value={selectedElement.rotation}
            onChange={(value) => updateElementRect(selectedElement.id, { rotation: value })}
          />
        </div>
      </section>

      <section>
        <h3>内容绑定</h3>
        <label>
          模式
          <select
            value={selectedElement.binding.mode}
            onChange={(event) =>
              updateSelectedBinding({
                mode: event.target.value as ContentBinding["mode"],
              })
            }
          >
            <option value="fixed">固定值</option>
            <option value="column">数据列</option>
            <option value="expression">表达式</option>
          </select>
        </label>

        {selectedElement.binding.mode === "fixed" ? (
          <label>
            固定值
            <textarea
              rows={3}
              value={selectedElement.binding.fixedValue ?? ""}
              onChange={(event) => updateSelectedBinding({ fixedValue: event.target.value })}
            />
          </label>
        ) : null}

        {selectedElement.binding.mode === "column" ? (
          <label>
            数据列
            <select
              value={selectedElement.binding.column ?? ""}
              onChange={(event) => updateSelectedBinding({ column: event.target.value })}
            >
              <option value="">请选择列</option>
              {columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {selectedElement.binding.mode === "expression" ? (
          <label>
            表达式
            <input
              value={selectedElement.binding.expression ?? ""}
              onChange={(event) => updateSelectedBinding({ expression: event.target.value })}
              placeholder="例如: ${sku}-${price}"
            />
          </label>
        ) : null}

        <p className="preview-value">预览值: {previewValue || "(空)"}</p>
      </section>

      <section>
        <h3>高级参数</h3>
        <div className="form-grid">
          <label>
            字体
            <select
              value={selectedElement.textStyle.fontFamily}
              onChange={(event) => updateSelectedTextStyle({ fontFamily: event.target.value })}
            >
              {fontOptions.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <NumericInput
            label="字号"
            value={selectedElement.textStyle.fontSize}
            min={1}
            onChange={(value) => updateSelectedTextStyle({ fontSize: value })}
          />
          <NumericInput
            label="字重"
            value={selectedElement.textStyle.fontWeight}
            min={100}
            max={900}
            step={100}
            onChange={(value) => updateSelectedTextStyle({ fontWeight: value })}
          />
          <NumericInput
            label="字距"
            value={selectedElement.textStyle.letterSpacing}
            step={0.1}
            onChange={(value) => updateSelectedTextStyle({ letterSpacing: value })}
          />
          <NumericInput
            label="行高"
            value={selectedElement.textStyle.lineHeight}
            min={0.5}
            step={0.1}
            onChange={(value) => updateSelectedTextStyle({ lineHeight: value })}
          />
          <label>
            对齐
            <select
              value={selectedElement.textStyle.align}
              onChange={(event) =>
                updateSelectedTextStyle({
                  align: event.target.value as EditorElement["textStyle"]["align"],
                })
              }
            >
              <option value="left">左对齐</option>
              <option value="center">居中</option>
              <option value="right">右对齐</option>
            </select>
          </label>
          <label>
            颜色
            <input
              type="color"
              value={selectedElement.textStyle.color}
              onChange={(event) => updateSelectedTextStyle({ color: event.target.value })}
            />
          </label>
        </div>

        <div className="inline-actions">
          <label className="check-item">
            <input
              type="checkbox"
              checked={selectedElement.textStyle.italic}
              onChange={(event) => updateSelectedTextStyle({ italic: event.target.checked })}
            />
            斜体
          </label>
          <label className="check-item">
            <input
              type="checkbox"
              checked={selectedElement.textStyle.underline}
              onChange={(event) => updateSelectedTextStyle({ underline: event.target.checked })}
            />
            下划线
          </label>
        </div>
      </section>

      {selectedElement.type === "image" ? (
        <section>
          <h3>Image Asset</h3>
          <div className="inline-actions">
            <button type="button" className="tool-ghost" onClick={() => imageInputRef.current?.click()}>
              Select image
            </button>
            <button
              type="button"
              className="tool-ghost"
              onClick={() =>
                updateSelectedBinding({
                  mode: "fixed",
                  fixedValue: "",
                })
              }
            >
              Clear
            </button>
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={onImageFileChange}
            style={{ display: "none" }}
          />
          <p className="muted">{hasEmbeddedImage ? "Embedded image ready." : "No embedded image."}</p>
        </section>
      ) : null}

      {selectedElement.type === "barcode" ? (
        <section>
          <h3>条码参数</h3>
          <div className="form-grid">
            <label>
              码制
              <select
                value={selectedElement.barcode.symbology}
                onChange={(event) => onSymbologyChange(event.target.value as BarcodeSymbology)}
              >
                {BARCODE_SYMBOLOGY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <NumericInput
              label="条宽(mil)"
              value={selectedElement.barcode.moduleWidth}
              min={0.1}
              step={0.01}
              onChange={(value) => updateSelectedBarcode({ moduleWidth: value })}
            />
            <NumericInput
              label="文字间隔"
              value={selectedElement.barcode.textGap}
              step={0.1}
              onChange={(value) => updateSelectedBarcode({ textGap: value })}
            />
            <NumericInput
              label="静区"
              value={selectedElement.barcode.quietZone}
              step={0.1}
              onChange={(value) => updateSelectedBarcode({ quietZone: value })}
            />
            <NumericInput
              label="最小高(mm)"
              value={selectedElement.barcode.minHeight}
              min={1}
              step={0.1}
              onChange={(value) => updateSelectedBarcode({ minHeight: value })}
            />
            <label>
              文字位置
              <select
                value={selectedElement.barcode.textPosition}
                onChange={(event) =>
                  updateSelectedBarcode({
                    textPosition: event.target.value as "none" | "top" | "bottom",
                  })
                }
              >
                <option value="none">不显示</option>
                <option value="top">上方</option>
                <option value="bottom">下方</option>
              </select>
            </label>
          </div>
        </section>
      ) : null}
    </div>
  );
}

type NumericInputProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
};

function NumericInput({ label, value, min, max, step = 0.1, onChange }: NumericInputProps) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
      />
    </label>
  );
}
