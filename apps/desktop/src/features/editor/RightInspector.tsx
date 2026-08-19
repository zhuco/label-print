import { useRef, type ChangeEvent, type KeyboardEvent } from "react";

import { useDataImportStore } from "../data-import/data-import.store";
import { BARCODE_SYMBOLOGY_OPTIONS, getDefaultBarcodeValue } from "./core/barcode";
import { DEFAULT_DATE_TIME_FORMAT, resolveBindingValue } from "./core/binding";
import { DEFAULT_FONT_OPTIONS, type FontOption, withCurrentFont } from "./core/font-options";
import type { BarcodeSymbology, ContentBinding } from "./core/types";
import {
  DEFAULT_VISUAL_ADVANCED_STYLE_PATCH,
  MAX_VISUAL_MITER_LIMIT,
  DEFAULT_VISUAL_OPACITY,
  MIN_VISUAL_MITER_LIMIT,
  MAX_VISUAL_OPACITY,
  MAX_VISUAL_STROKE_WIDTH,
  MIN_VISUAL_OPACITY,
  MIN_VISUAL_STROKE_WIDTH,
  VISUAL_STYLE_PRESETS,
  VISUAL_FILL_RULE_OPTIONS,
  VISUAL_LINE_CAP_OPTIONS,
  VISUAL_LINE_JOIN_OPTIONS,
  VISUAL_STROKE_NUDGE_STEP,
  formatVisualDashArray,
  normalizeVisualDashArray,
  normalizeVisualDashOffset,
  normalizeVisualFillRule,
  normalizeVisualLineCap,
  normalizeVisualLineJoin,
  normalizeVisualMiterLimit,
  normalizeVisualOpacity,
  normalizeVisualStrokeWidth,
  nudgeVisualStrokeWidth,
  getVisualStylePreset,
  type VisualFillRule,
  type VisualLineCap,
  type VisualLineJoin,
} from "./core/visual-style";
import { TextStyleIcon } from "./TextStyleIcon";
import { selectActiveDocument, useEditorStore } from "./editor.store";

type RightInspectorProps = {
  systemFonts: FontOption[];
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const VISUAL_FINE_STEP = 0.01;
const POSITION_STEP_MM = 0.1;

function normalizeColorForPicker(value: string | undefined, fallback = "#2a6fa8"): string {
  const trimmed = (value || "").trim();
  if (HEX_COLOR_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function normalizePositionMm(value: number): number {
  return Math.round((value + Number.EPSILON) / POSITION_STEP_MM) * POSITION_STEP_MM;
}

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
    return <p className="muted">请先选择对象后再编辑参数。</p>;
  }

  if (!selectedElement) {
    return <p className="muted">已选中 {selectedCount} 个对象，可使用左侧工具栏进行批量对齐。</p>;
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

  const isTextOrBarcode = selectedElement.type === "text" || selectedElement.type === "barcode";
  const isDateTime = selectedElement.binding.mode === "datetime";
  const isVisualElement = selectedElement.type === "shape" || selectedElement.type === "icon";
  const isBold = selectedElement.textStyle.fontWeight >= 700;
  const isItalic = selectedElement.textStyle.italic;
  const isUnderline = selectedElement.textStyle.underline;
  const isStrikeThrough = selectedElement.textStyle.strikeThrough ?? false;

  const visualStrokeWidth = normalizeVisualStrokeWidth(selectedElement.textStyle.strokeWidth);
  const visualStrokeColorText =
    selectedElement.textStyle.strokeColor || selectedElement.textStyle.color || "#2a6fa8";
  const visualStrokeColorPicker = normalizeColorForPicker(visualStrokeColorText, "#2a6fa8");
  const visualFillColorText =
    selectedElement.textStyle.fillColor || selectedElement.textStyle.color || "#2a6fa8";
  const visualFillColorPicker = normalizeColorForPicker(visualFillColorText, "#2a6fa8");
  const visualStrokeOpacity = normalizeVisualOpacity(selectedElement.textStyle.strokeOpacity);
  const visualFillOpacity = normalizeVisualOpacity(selectedElement.textStyle.fillOpacity, DEFAULT_VISUAL_OPACITY);
  const visualLineCap = normalizeVisualLineCap(selectedElement.textStyle.strokeLineCap);
  const visualLineJoin = normalizeVisualLineJoin(selectedElement.textStyle.strokeLineJoin);
  const visualDashArray = normalizeVisualDashArray(selectedElement.textStyle.strokeDashArray);
  const visualDashArrayText = formatVisualDashArray(visualDashArray);
  const visualDashOffset = normalizeVisualDashOffset(selectedElement.textStyle.strokeDashOffset);
  const visualMiterLimit = normalizeVisualMiterLimit(selectedElement.textStyle.strokeMiterLimit);
  const visualFillRule = normalizeVisualFillRule(selectedElement.textStyle.fillRule);

  const commitDashPattern = (value: string) => {
    updateSelectedTextStyle({ strokeDashArray: normalizeVisualDashArray(value) });
  };

  const nudgeDashOffset = (delta: number) => {
    updateSelectedTextStyle({
      strokeDashOffset: normalizeVisualDashOffset(visualDashOffset + delta),
    });
  };

  const nudgeMiterLimit = (delta: number) => {
    updateSelectedTextStyle({
      strokeMiterLimit: normalizeVisualMiterLimit(visualMiterLimit + delta),
    });
  };

  const applyVisualStylePreset = (presetId: string) => {
    const preset = getVisualStylePreset(presetId);
    if (!preset) {
      return;
    }
    updateSelectedTextStyle(preset.patch);
  };

  const resetAdvancedVisualStyle = () => {
    updateSelectedTextStyle(DEFAULT_VISUAL_ADVANCED_STYLE_PATCH);
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
            step={POSITION_STEP_MM}
            onChange={(value) => updateElementRect(selectedElement.id, { xMm: normalizePositionMm(value) })}
          />
          <NumericInput
            label="垂直(mm)"
            value={selectedElement.yMm}
            step={POSITION_STEP_MM}
            onChange={(value) => updateElementRect(selectedElement.id, { yMm: normalizePositionMm(value) })}
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
            <option value="datetime">日期时间</option>
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

        {isDateTime ? (
          <>
            <label>
              日期时间来源
              <select
                value={selectedElement.binding.dateTimeSource ?? "printTime"}
                onChange={(event) =>
                  updateSelectedBinding({
                    dateTimeSource: event.target.value as "fixed" | "printTime",
                  })
                }
              >
                <option value="printTime">打印日期时间</option>
                <option value="fixed">固定值</option>
              </select>
            </label>

            {selectedElement.binding.dateTimeSource === "fixed" ? (
              <label>
                固定日期时间
                <input
                  type="datetime-local"
                  step="1"
                  value={selectedElement.binding.fixedValue ?? ""}
                  onChange={(event) => updateSelectedBinding({ fixedValue: event.target.value })}
                />
              </label>
            ) : null}

            <label>
              日期时间格式
              <select
                value={selectedElement.binding.dateTimeFormat ?? DEFAULT_DATE_TIME_FORMAT}
                onChange={(event) => updateSelectedBinding({ dateTimeFormat: event.target.value })}
              >
                <option value="YYYY-MM-DD HH:mm:ss">2026-08-08 14:30:45</option>
                <option value="YYYY-MM-DD HH:mm">2026-08-08 14:30</option>
                <option value="YYYY-MM-DD">2026-08-08（隐藏时间）</option>
                <option value="YYYY/MM/DD">2026/08/08（隐藏时间）</option>
                <option value="YYYY年MM月DD日">2026年08月08日（隐藏时间）</option>
              </select>
            </label>
          </>
        ) : null}

        <p className="preview-value">预览值：{previewValue || "(空)"}</p>
      </section>

      {isTextOrBarcode ? (
        <section>
          <h3>{selectedElement.type === "barcode" ? "文本参数(条码数字)" : "文本参数"}</h3>
          <div className="form-grid text-param-grid">
            <label className="compact-control">
              <span className="visually-hidden">字体</span>
              <select
                value={selectedElement.textStyle.fontFamily}
                aria-label="字体"
                title="字体"
                onChange={(event) => updateSelectedTextStyle({ fontFamily: event.target.value })}
              >
                {fontOptions.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-control">
              <span className="visually-hidden">字号</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={Number.isFinite(selectedElement.textStyle.fontSize) ? selectedElement.textStyle.fontSize : 1}
                aria-label="字号"
                title="字号"
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed)) {
                    updateSelectedTextStyle({ fontSize: parsed });
                  }
                }}
              />
            </label>
          </div>

          <div className="inline-actions text-style-toggle-row text-align-toggle-row">
            <button
              type="button"
              className={`tool-ghost text-style-toggle icon-square-btn ${
                selectedElement.textStyle.align === "left" ? "active" : ""
              }`}
              title="左对齐"
              aria-label="左对齐"
              onClick={() => updateSelectedTextStyle({ align: "left" })}
            >
              <TextStyleIcon kind="align-left" className="text-style-icon" />
            </button>
            <button
              type="button"
              className={`tool-ghost text-style-toggle icon-square-btn ${
                selectedElement.textStyle.align === "center" ? "active" : ""
              }`}
              title="居中对齐"
              aria-label="居中对齐"
              onClick={() => updateSelectedTextStyle({ align: "center" })}
            >
              <TextStyleIcon kind="align-center" className="text-style-icon" />
            </button>
            <button
              type="button"
              className={`tool-ghost text-style-toggle icon-square-btn ${
                selectedElement.textStyle.align === "right" ? "active" : ""
              }`}
              title="右对齐"
              aria-label="右对齐"
              onClick={() => updateSelectedTextStyle({ align: "right" })}
            >
              <TextStyleIcon kind="align-right" className="text-style-icon" />
            </button>
          </div>

          <div className="inline-actions text-style-toggle-row">
            <button
              type="button"
              className={`tool-ghost text-style-toggle icon-square-btn ${isBold ? "active" : ""}`}
              title="加粗"
              aria-label="加粗"
              onClick={() => updateSelectedTextStyle({ fontWeight: isBold ? 400 : 700 })}
            >
              <TextStyleIcon kind="bold" className="text-style-icon" />
            </button>
            <button
              type="button"
              className={`tool-ghost text-style-toggle icon-square-btn ${isItalic ? "active" : ""}`}
              title="斜体"
              aria-label="斜体"
              onClick={() => updateSelectedTextStyle({ italic: !isItalic })}
            >
              <TextStyleIcon kind="italic" className="text-style-icon" />
            </button>
            <button
              type="button"
              className={`tool-ghost text-style-toggle icon-square-btn ${isUnderline ? "active" : ""}`}
              title="下划线"
              aria-label="下划线"
              onClick={() => updateSelectedTextStyle({ underline: !isUnderline })}
            >
              <TextStyleIcon kind="underline" className="text-style-icon" />
            </button>
            <button
              type="button"
              className={`tool-ghost text-style-toggle icon-square-btn ${isStrikeThrough ? "active" : ""}`}
              title="删除线"
              aria-label="删除线"
              onClick={() => updateSelectedTextStyle({ strikeThrough: !isStrikeThrough })}
            >
              <TextStyleIcon kind="strike-through" className="text-style-icon" />
            </button>
          </div>
        </section>
      ) : null}

      {isVisualElement ? (
        <section>
          <h3>图形样式</h3>
          <div className="inline-actions">
            <label className="compact-control" style={{ minWidth: 0, flex: "1 1 180px" }}>
              <span className="visually-hidden">图形样式预设</span>
              <select
                defaultValue=""
                aria-label="图形样式预设"
                onChange={(event) => {
                  const nextPresetId = event.target.value;
                  if (!nextPresetId) {
                    return;
                  }
                  applyVisualStylePreset(nextPresetId);
                  event.target.value = "";
                }}
              >
                <option value="">应用图形样式预设...</option>
                {VISUAL_STYLE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} · {preset.description}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="tool-ghost" onClick={resetAdvancedVisualStyle}>
              重置高级参数
            </button>
          </div>

          <div className="form-grid">
            <label>
              描边颜色
              <div className="color-field-row">
                <input
                  type="color"
                  value={visualStrokeColorPicker}
                  aria-label="图形描边颜色"
                  onChange={(event) =>
                    updateSelectedTextStyle({ color: event.target.value, strokeColor: event.target.value })
                  }
                />
                <input
                  type="text"
                  className="mono-input"
                  value={visualStrokeColorText}
                  placeholder="#2a6fa8"
                  onChange={(event) =>
                    updateSelectedTextStyle({ color: event.target.value, strokeColor: event.target.value })
                  }
                />
              </div>
            </label>

            <label>
              填充颜色
              <div className="color-field-row">
                <input
                  type="color"
                  value={visualFillColorPicker}
                  aria-label="图形填充颜色"
                  onChange={(event) => updateSelectedTextStyle({ fillColor: event.target.value })}
                />
                <input
                  type="text"
                  className="mono-input"
                  value={visualFillColorText}
                  placeholder="#2a6fa8"
                  onChange={(event) => updateSelectedTextStyle({ fillColor: event.target.value })}
                />
              </div>
            </label>

            <label>
              线宽
              <div className="micro-adjust-row">
                <button
                  type="button"
                  className="tool-ghost"
                  onClick={() =>
                    updateSelectedTextStyle({
                      strokeWidth: nudgeVisualStrokeWidth(
                        selectedElement.textStyle.strokeWidth,
                        -VISUAL_STROKE_NUDGE_STEP
                      ),
                    })
                  }
                >
                  -0.05
                </button>
                <input
                  type="number"
                  min={MIN_VISUAL_STROKE_WIDTH}
                  max={MAX_VISUAL_STROKE_WIDTH}
                  step={VISUAL_STROKE_NUDGE_STEP}
                  value={visualStrokeWidth}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isFinite(parsed)) {
                      updateSelectedTextStyle({ strokeWidth: parsed });
                    }
                  }}
                />
                <button
                  type="button"
                  className="tool-ghost"
                  onClick={() =>
                    updateSelectedTextStyle({
                      strokeWidth: nudgeVisualStrokeWidth(
                        selectedElement.textStyle.strokeWidth,
                        VISUAL_STROKE_NUDGE_STEP
                      ),
                    })
                  }
                >
                  +0.05
                </button>
              </div>
            </label>

            <NumericInput
              label="描边透明度(0-1)"
              value={visualStrokeOpacity}
              min={MIN_VISUAL_OPACITY}
              max={MAX_VISUAL_OPACITY}
              step={0.01}
              onChange={(value) => updateSelectedTextStyle({ strokeOpacity: value })}
            />

            <NumericInput
              label="填充透明度(0-1)"
              value={visualFillOpacity}
              min={MIN_VISUAL_OPACITY}
              max={MAX_VISUAL_OPACITY}
              step={0.01}
              onChange={(value) => updateSelectedTextStyle({ fillOpacity: value })}
            />

            <label>
              线帽
              <select
                value={visualLineCap}
                onChange={(event) =>
                  updateSelectedTextStyle({ strokeLineCap: event.target.value as VisualLineCap })
                }
              >
                {VISUAL_LINE_CAP_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              线角
              <select
                value={visualLineJoin}
                onChange={(event) =>
                  updateSelectedTextStyle({ strokeLineJoin: event.target.value as VisualLineJoin })
                }
              >
                {VISUAL_LINE_JOIN_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              虚线模式
              <input
                key={`${selectedElement.id}-${visualDashArrayText}`}
                type="text"
                className="mono-input"
                defaultValue={visualDashArrayText}
                placeholder="4,2,1.5"
                onBlur={(event) => commitDashPattern(event.target.value)}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitDashPattern(event.currentTarget.value);
                    event.currentTarget.blur();
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.currentTarget.value = visualDashArrayText;
                    event.currentTarget.blur();
                  }
                }}
              />
            </label>
            <label>
              虚线偏移
              <div className="micro-adjust-row">
                <button type="button" className="tool-ghost" onClick={() => nudgeDashOffset(-VISUAL_FINE_STEP)}>
                  -0.01
                </button>
                <input
                  type="number"
                  step={VISUAL_FINE_STEP}
                  value={visualDashOffset}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isFinite(parsed)) {
                      updateSelectedTextStyle({ strokeDashOffset: parsed });
                    }
                  }}
                />
                <button type="button" className="tool-ghost" onClick={() => nudgeDashOffset(VISUAL_FINE_STEP)}>
                  +0.01
                </button>
              </div>
            </label>
            <label>
              尖角限制
              <div className="micro-adjust-row">
                <button type="button" className="tool-ghost" onClick={() => nudgeMiterLimit(-VISUAL_FINE_STEP)}>
                  -0.01
                </button>
                <input
                  type="number"
                  min={MIN_VISUAL_MITER_LIMIT}
                  max={MAX_VISUAL_MITER_LIMIT}
                  step={VISUAL_FINE_STEP}
                  value={visualMiterLimit}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isFinite(parsed)) {
                      updateSelectedTextStyle({ strokeMiterLimit: parsed });
                    }
                  }}
                />
                <button type="button" className="tool-ghost" onClick={() => nudgeMiterLimit(VISUAL_FINE_STEP)}>
                  +0.01
                </button>
              </div>
            </label>

            <label>
              填充规则
              <select
                value={visualFillRule}
                onChange={(event) =>
                  updateSelectedTextStyle({ fillRule: event.target.value as VisualFillRule })
                }
              >
                {VISUAL_FILL_RULE_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="muted">
            支持细微调节：线宽 {MIN_VISUAL_STROKE_WIDTH}~{MAX_VISUAL_STROKE_WIDTH}，步进 {VISUAL_STROKE_NUDGE_STEP}；透明度 {MIN_VISUAL_OPACITY}~{MAX_VISUAL_OPACITY}，步进 0.01。
          </p>
        </section>
      ) : null}

      {selectedElement.type === "image" ? (
        <section>
          <h3>图片资源</h3>
          <div className="inline-actions">
            <button type="button" className="tool-ghost" onClick={() => imageInputRef.current?.click()}>
              选择图片
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
              清空
            </button>
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={onImageFileChange}
            style={{ display: "none" }}
          />
          <p className="muted">{hasEmbeddedImage ? "已嵌入图片。" : "尚未嵌入图片。"}</p>
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
              min={3}
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

