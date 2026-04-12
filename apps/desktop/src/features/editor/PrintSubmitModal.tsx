import { toPng } from "html-to-image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { BarcodePreview } from "./BarcodePreview";
import { QrcodePreview } from "./QrcodePreview";
import { resolveBindingValue } from "./core/binding";
import { buildBarcodeTextStyle } from "./core/barcode-text-style";
import { buildTextDecoration, computeSingleLineScaleX } from "./core/text-style";
import type { EditorElement, LabelSize, TextStyle } from "./core/types";
import { PresetGlyph, readIconPresetIdFromBinding, readShapePresetIdFromBinding } from "./core/visual-presets";

export type DirectPrintSubmitInput = {
  printerId: string;
  copies: number;
  widthMm: number;
  heightMm: number;
  previewPngBase64: string;
};

type PrintSubmitModalProps = {
  open: boolean;
  title: string;
  labelSize: LabelSize;
  printers: string[];
  printerHint?: string;
  printerId: string;
  copies: number;
  elements: EditorElement[];
  previewRecord: Record<string, string>;
  submitStatus: string;
  submitting: boolean;
  loadingPrinters: boolean;
  onClose: () => void;
  onRefreshPrinters: () => void;
  onPrinterChange: (value: string) => void;
  onCopiesChange: (value: number) => void;
  onConfirm: (payload: DirectPrintSubmitInput) => boolean | Promise<boolean>;
};

export function PrintSubmitModal({
  open,
  title,
  labelSize,
  printers,
  printerHint,
  printerId,
  copies,
  elements,
  previewRecord,
  submitStatus,
  submitting,
  loadingPrinters,
  onClose,
  onRefreshPrinters,
  onPrinterChange,
  onCopiesChange,
  onConfirm,
}: PrintSubmitModalProps) {
  const previewSurfaceRef = useRef<HTMLDivElement | null>(null);
  const copiesInputRef = useRef<HTMLInputElement | null>(null);
  const [previewMmToPx, setPreviewMmToPx] = useState(8);
  const previewWidthMm = Math.max(10, labelSize.widthMm);
  const previewHeightMm = Math.max(10, labelSize.heightMm);
  const statusClass = submitStatus.includes("失败") ? "warning" : "muted";

  const capturePreviewPngBase64 = useCallback(async (): Promise<string> => {
    const target = previewSurfaceRef.current;
    if (!target) {
      throw new Error("预览区域不存在。");
    }

    const dataUrl = await toPng(target, {
      cacheBust: true,
      backgroundColor: "#ffffff",
      pixelRatio: 2,
    });
    const marker = "base64,";
    const markerIndex = dataUrl.indexOf(marker);
    if (markerIndex < 0) {
      throw new Error("预览图生成失败。");
    }
    return dataUrl.slice(markerIndex + marker.length);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting) {
      return;
    }
    const previewPngBase64 = await capturePreviewPngBase64();
    await onConfirm({
      printerId,
      copies: Math.max(1, Math.trunc(copies)),
      widthMm: previewWidthMm,
      heightMm: previewHeightMm,
      previewPngBase64,
    });
  }, [capturePreviewPngBase64, copies, onConfirm, previewHeightMm, previewWidthMm, printerId, submitting]);

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
        void handleSubmit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSubmit, onClose, open, submitting]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const input = copiesInputRef.current;
    if (!input) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const target = previewSurfaceRef.current;
    if (!target) {
      return;
    }

    const updateScale = () => {
      const width = target.clientWidth;
      const height = target.clientHeight;
      if (width <= 0 || height <= 0) {
        return;
      }
      setPreviewMmToPx(Math.min(width / previewWidthMm, height / previewHeightMm));
    };

    updateScale();
    let raf = 0;
    const onResize = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
      }
      raf = requestAnimationFrame(updateScale);
    };

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    if (observer) {
      observer.observe(target);
    }
    window.addEventListener("resize", onResize);

    return () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
      }
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [open, previewHeightMm, previewWidthMm]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <section className="modal-card print-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header print-modal-header">
          <div className="print-modal-title-group">
            <h3>提交打印任务</h3>
            <p className="muted">工业任务面板 · 系统打印机直连输出</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭打印窗口">
            ×
          </button>
        </header>

        <div className="print-modal-body">
          <aside className="print-settings">
            <section className="print-panel-block">
              <h4>任务参数</h4>

              <label>
                打印机
                <select value={printerId} onChange={(event) => onPrinterChange(event.target.value)}>
                  {printers.length > 0 ? (
                    printers.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))
                  ) : (
                    <option value={printerId || ""}>{printerId || "未读取到系统打印机"}</option>
                  )}
                </select>
              </label>
              <div className="print-printer-actions">
                <button
                  type="button"
                  className="tool-ghost"
                  onClick={onRefreshPrinters}
                  disabled={submitting || loadingPrinters}
                >
                  {loadingPrinters ? "刷新中..." : "刷新系统打印机"}
                </button>
              </div>
              {printerHint ? <p className="muted">{printerHint}</p> : null}

              <label>
                打印数量
                <input
                  ref={copiesInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={copies}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => {
                    const digitsOnly = event.target.value.replace(/[^\d]/g, "");
                    if (!digitsOnly) {
                      return;
                    }
                    onCopiesChange(Number(digitsOnly));
                  }}
                />
              </label>
            </section>

            <section className="print-panel-block print-actions-block">
              <h4>执行操作</h4>
              <div className="print-main-actions">
                <button
                  type="button"
                  className="primary print-submit-btn"
                  onClick={() => void handleSubmit()}
                  disabled={submitting}
                >
                  {submitting ? "打印中..." : "打印"}
                </button>
                <button type="button" className="tool-ghost print-cancel-btn" onClick={onClose} disabled={submitting}>
                  取消
                </button>
              </div>
              <p className={statusClass}>{submitStatus || "等待提交。请确认打印参数和预览结果。"}</p>
            </section>
          </aside>

          <section className="print-preview-panel">
            <header className="print-preview-header">
              <h4>实时预览</h4>
              <p className="muted">
                模板：{title} · 尺寸：{previewWidthMm} × {previewHeightMm} mm
              </p>
            </header>

            <div className="print-preview-canvas-wrap">
              <div
                ref={previewSurfaceRef}
                className="print-preview-canvas-surface"
                style={
                  {
                    "--preview-ratio": `${previewWidthMm} / ${previewHeightMm}`,
                  } as CSSProperties
                }
              >
                <div className="print-preview-canvas">
                  {elements.map((element) => {
                    const previewValue = resolveBindingValue(element.binding, previewRecord);
                    const elementStyle: CSSProperties = {
                      left: `${toPercent(element.xMm, previewWidthMm)}%`,
                      top: `${toPercent(element.yMm, previewHeightMm)}%`,
                      width: `${toPercent(element.widthMm, previewWidthMm)}%`,
                      height: `${toPercent(element.heightMm, previewHeightMm)}%`,
                      transform: `rotate(${element.rotation}deg)`,
                    };

                    if (element.type === "text") {
                      const wrapMode = element.textStyle.wrapMode ?? "auto";
                      const scaleX =
                        wrapMode === "singleLine"
                          ? computeSingleLineScaleX({
                              text: previewValue,
                              textStyle: element.textStyle,
                              widthMm: element.widthMm,
                              mmToPx: previewMmToPx,
                            })
                          : 1;
                      return (
                        <div key={element.id} className="print-preview-element print-preview-text" style={elementStyle}>
                          <div
                            className="element-content"
                            style={{
                              fontFamily: element.textStyle.fontFamily,
                              fontSize: `${Math.max(1, element.textStyle.fontSize * previewMmToPx)}px`,
                              fontWeight: element.textStyle.fontWeight,
                              fontStyle: element.textStyle.italic ? "italic" : "normal",
                              textDecoration: buildTextDecoration(element.textStyle),
                              textAlign: element.textStyle.align,
                              color: element.textStyle.color,
                              letterSpacing: `${Math.max(0, element.textStyle.letterSpacing * previewMmToPx)}px`,
                              lineHeight: element.textStyle.lineHeight,
                              whiteSpace: wrapMode === "singleLine" ? "nowrap" : "pre-wrap",
                              overflowWrap: wrapMode === "singleLine" ? "normal" : "anywhere",
                              wordBreak: wrapMode === "singleLine" ? "normal" : "break-word",
                              textOverflow: "clip",
                              transform: wrapMode === "singleLine" ? `scaleX(${scaleX})` : undefined,
                              transformOrigin:
                                wrapMode === "singleLine"
                                  ? `${getAlignTransformOrigin(element.textStyle.align)} center`
                                  : undefined,
                            }}
                          >
                            {previewValue}
                          </div>
                        </div>
                      );
                    }

                    if (element.type === "barcode") {
                      const barcodeValue = previewValue || "123456789";
                      const barcodeTextStyle = buildBarcodeTextStyle(
                        element.textStyle,
                        {
                          mmToPx: previewMmToPx,
                          heightMm: element.heightMm,
                          widthMm: element.widthMm,
                          text: barcodeValue,
                          minBarcodeHeightMm: element.barcode.minHeight,
                          textGapMm: element.barcode.textGap,
                        }
                      );
                      return (
                        <div
                          key={element.id}
                          className={`print-preview-element print-preview-barcode ${
                            element.barcode.textPosition === "none" ? "is-text-hidden" : "is-text-visible"
                          }`}
                          style={
                            {
                              ...elementStyle,
                              "--barcode-gap": `${Math.max(1, element.barcode.textGap * previewMmToPx)}px`,
                            } as CSSProperties
                          }
                        >
                          {element.barcode.textPosition === "top" ? (
                            <span className="print-preview-barcode-text" style={barcodeTextStyle}>
                              {barcodeValue}
                            </span>
                          ) : null}
                          <div className="print-preview-barcode-core">
                            <BarcodePreview
                              value={barcodeValue}
                              symbology={element.barcode.symbology}
                              className="print-preview-barcode-svg"
                              showText={false}
                              mmToPx={previewMmToPx}
                              moduleWidthMm={element.barcode.moduleWidth}
                              quietZoneMm={element.barcode.quietZone}
                              heightMm={Math.max(3, element.heightMm)}
                            />
                          </div>
                          {element.barcode.textPosition === "bottom" ? (
                            <span className="print-preview-barcode-text" style={barcodeTextStyle}>
                              {barcodeValue}
                            </span>
                          ) : null}
                        </div>
                      );
                    }

                    if (element.type === "qrcode") {
                      return (
                        <div key={element.id} className="print-preview-element print-preview-qrcode" style={elementStyle}>
                          <QrcodePreview value={previewValue || "https://label.local"} className="print-preview-qrcode-svg" />
                        </div>
                      );
                    }

                    if (element.type === "image") {
                      return previewValue.startsWith("data:image/") ? (
                        <div key={element.id} className="print-preview-element print-preview-image" style={elementStyle}>
                          <img src={previewValue} alt={element.name} draggable={false} />
                        </div>
                      ) : (
                        <div key={element.id} className="print-preview-element print-preview-image-fallback" style={elementStyle}>
                          <span>{previewValue || "IMG"}</span>
                        </div>
                      );
                    }

                    if (element.type === "shape") {
                      const shapePresetId =
                        element.binding.mode === "fixed" ? readShapePresetIdFromBinding(element.binding.fixedValue) : null;

                      if (shapePresetId) {
                        return (
                          <div
                            key={element.id}
                            className="print-preview-element print-preview-shape print-preview-preset"
                            style={{ ...elementStyle, color: element.textStyle.color, borderColor: element.textStyle.color }}
                          >
                            <PresetGlyph kind="shape" presetId={shapePresetId} className="print-preview-preset-svg" />
                          </div>
                        );
                      }

                      if (previewValue.startsWith("data:image/")) {
                        return (
                          <div key={element.id} className="print-preview-element print-preview-image" style={elementStyle}>
                            <img src={previewValue} alt={element.name} draggable={false} />
                          </div>
                        );
                      }

                      return (
                        <div
                          key={element.id}
                          className="print-preview-element print-preview-shape"
                          style={{ ...elementStyle, borderColor: element.textStyle.color }}
                        >
                          <span>{previewValue || "Shape"}</span>
                        </div>
                      );
                    }

                    const iconPresetId =
                      element.binding.mode === "fixed" ? readIconPresetIdFromBinding(element.binding.fixedValue) : null;

                    if (iconPresetId) {
                      return (
                        <div
                          key={element.id}
                          className="print-preview-element print-preview-icon print-preview-preset"
                          style={{ ...elementStyle, color: element.textStyle.color }}
                        >
                          <PresetGlyph kind="icon" presetId={iconPresetId} className="print-preview-preset-svg" />
                        </div>
                      );
                    }

                    if (previewValue.startsWith("data:image/")) {
                      return (
                        <div key={element.id} className="print-preview-element print-preview-image" style={elementStyle}>
                          <img src={previewValue} alt={element.name} draggable={false} />
                        </div>
                      );
                    }

                    return (
                      <div key={element.id} className="print-preview-element print-preview-icon" style={elementStyle}>
                        <span
                          style={{
                            color: element.textStyle.color,
                            fontFamily: element.textStyle.fontFamily,
                            fontWeight: element.textStyle.fontWeight,
                          }}
                        >
                          {previewValue || "@"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function toPercent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (value / total) * 100));
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
