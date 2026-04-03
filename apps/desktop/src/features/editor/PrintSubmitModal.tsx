import { useEffect } from "react";

import { resolveBindingValue } from "./core/binding";
import type { EditorElement, LabelSize, TextStyle } from "./core/types";
import { BarcodePreview } from "./BarcodePreview";

type PrintSubmitModalProps = {
  open: boolean;
  title: string;
  labelSize: LabelSize;
  printers: string[];
  printerId: string;
  copies: number;
  elements: EditorElement[];
  previewRecord: Record<string, string>;
  submitStatus: string;
  submitting: boolean;
  onClose: () => void;
  onPrinterChange: (value: string) => void;
  onCopiesChange: (value: number) => void;
  onConfirm: (copies?: number) => void;
};

const QUICK_SUBMIT_VALUES = [50, 100, 200, 300, 500, 1000];

export function PrintSubmitModal({
  open,
  title,
  labelSize,
  printers,
  printerId,
  copies,
  elements,
  previewRecord,
  submitStatus,
  submitting,
  onClose,
  onPrinterChange,
  onCopiesChange,
  onConfirm,
}: PrintSubmitModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Enter" && !event.isComposing && !submitting) {
        event.preventDefault();
        onConfirm();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onConfirm, open, submitting]);

  if (!open) {
    return null;
  }

  const textElement = elements.find((item) => item.type === "text");
  const barcodeElement = elements.find((item) => item.type === "barcode");
  const textPreviewValue = textElement ? resolveBindingValue(textElement.binding, previewRecord) : "";
  const textWrapMode = textElement?.textStyle.wrapMode ?? "auto";
  const textScaleX =
    textElement && textWrapMode === "singleLine"
      ? computeSingleLineScaleXByLabel(textElement.textStyle, textPreviewValue, textElement.widthMm, labelSize.widthMm)
      : 1;
  const handleQuickSubmit = (value: number) => {
    if (submitting) {
      return;
    }
    onCopiesChange(value);
    onConfirm(value);
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <section className="modal-card print-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h3>提交打印任务</h3>
          <button type="button" onClick={onClose} aria-label="关闭打印弹窗">
            ×
          </button>
        </header>

        <div className="print-modal-body">
          <aside className="print-settings">
            <h4>打印设置</h4>
            <label>
              打印机
              <select value={printerId} onChange={(event) => onPrinterChange(event.target.value)}>
                {printers.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              打印数量
              <input
                type="number"
                min={1}
                value={copies}
                onChange={(event) => onCopiesChange(Number(event.target.value))}
              />
            </label>
            <div className="quick-submit-row">
              {QUICK_SUBMIT_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="quick-submit-btn"
                  onClick={() => handleQuickSubmit(value)}
                  disabled={submitting}
                >
                  提交{value}
                </button>
              ))}
            </div>

            <button type="button" className="primary" onClick={() => onConfirm()} disabled={submitting}>
              {submitting ? "提交中..." : `提交打印(${copies})`}
            </button>
            <p className={submitStatus.startsWith("提交失败") ? "warning" : "muted"}>{submitStatus}</p>
          </aside>

          <section className="print-preview-panel">
            <h4>标签信息</h4>
            <p className="muted">名称: {title}</p>
            <p className="muted">
              尺寸: {labelSize.widthMm}×{labelSize.heightMm} mm
            </p>

            <div className="print-label-card">
              {textElement ? (
                <div
                  className="print-label-text"
                  style={{
                    whiteSpace: textWrapMode === "singleLine" ? "nowrap" : "pre-wrap",
                    overflowWrap: textWrapMode === "singleLine" ? "normal" : "anywhere",
                    wordBreak: textWrapMode === "singleLine" ? "normal" : "break-word",
                    textOverflow: textWrapMode === "singleLine" ? "ellipsis" : "clip",
                    transform: textWrapMode === "singleLine" ? `scaleX(${textScaleX})` : undefined,
                    transformOrigin:
                      textWrapMode === "singleLine"
                        ? `${getAlignTransformOrigin(textElement.textStyle.align)} center`
                        : undefined,
                  }}
                >
                  {textPreviewValue}
                </div>
              ) : null}
              {barcodeElement ? (
                <BarcodePreview
                  className="print-label-barcode"
                  value={resolveBindingValue(barcodeElement.binding, previewRecord) || "123456789"}
                  symbology={barcodeElement.barcode.symbology}
                />
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function estimateSingleLineUnits(value: string): number {
  const text = value.replace(/\r?\n/g, " ").trim();
  if (!text) {
    return 0;
  }
  let units = 0;
  for (const char of text) {
    if (char === " ") {
      units += 0.35;
      continue;
    }
    units += char.charCodeAt(0) <= 0x7f ? 0.55 : 1;
  }
  return units;
}

function computeSingleLineScaleXByLabel(
  textStyle: TextStyle,
  value: string,
  widthMm: number,
  labelWidthMm: number
): number {
  const declaredScale = clamp(textStyle.widthScale ?? 1, 0.2, 2);
  const units = estimateSingleLineUnits(value);
  if (units <= 0 || labelWidthMm <= 0) {
    return declaredScale;
  }

  const declaredWidthMm = units * textStyle.fontSize * 0.62 + Math.max(0, units - 1) * textStyle.letterSpacing;
  const fitScale = declaredWidthMm > widthMm ? widthMm / declaredWidthMm : 1;
  const labelScale = clamp(widthMm / labelWidthMm, 0.2, 1);

  return clamp(declaredScale * fitScale * (0.6 + labelScale * 0.4), 0.2, 2);
}

function getAlignTransformOrigin(align: TextStyle["align"]): "left" | "center" | "right" {
  if (align === "center") {
    return "center";
  }
  if (align === "right") {
    return "right";
  }
  return "left";
}
