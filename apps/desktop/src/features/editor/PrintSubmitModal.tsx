import { getFontEmbedCSS, toPng } from "html-to-image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";

import { BarcodePreview } from "./BarcodePreview";
import { QrcodePreview } from "./QrcodePreview";
import { resolveBindingValue } from "./core/binding";
import { buildBarcodeTextStyle } from "./core/barcode-text-style";
import { buildTextDecoration, computeTextFitScale } from "./core/text-style";
import type { EditorElement, LabelSize, TextStyle } from "./core/types";
import { normalizeVisualDashArray, normalizeVisualStrokeWidth, toAlphaColor, toShapeBorderWidthPx } from "./core/visual-style";
import { PresetGlyph, readIconPresetIdFromBinding, readShapePresetIdFromBinding } from "./core/visual-presets";

// Use a stable, high-resolution intermediate independent of the display DPI.
// The native print stage converts this image once into the printer's actual
// dot grid and thresholds it before submitting the page.
const PRINT_RENDER_DPI = 300;

export type DirectPrintSubmitInput = {
  printerId: string;
  copies: number;
  widthMm: number;
  heightMm: number;
  previewPngBase64s: string[];
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
  printRecords: Record<string, string>[];
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
  printRecords,
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
  const [captureRecordIndex, setCaptureRecordIndex] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [printTimestamp, setPrintTimestamp] = useState<Date | null>(null);
  const previewWidthMm = Math.max(10, labelSize.widthMm);
  const previewHeightMm = Math.max(10, labelSize.heightMm);
  const records = printRecords.length > 0 ? printRecords : [{}];
  const previewRecord = records[captureRecordIndex] ?? {};
  const statusClass = submitStatus.includes("失败") ? "warning" : "muted";

  const capturePreviewPngBase64 = useCallback(async (fontEmbedCSS: string | undefined): Promise<string> => {
    const target = previewSurfaceRef.current;
    if (!target) {
      throw new Error("预览区域不存在。");
    }

    const captureClassName = "print-preview-capture-mode";
    target.classList.add(captureClassName);
    let dataUrl = "";
    try {
      dataUrl = await toPng(target, {
        cacheBust: false,
        backgroundColor: "#ffffff",
        // The visible preview is responsive. Capturing its native size makes
        // the same label print differently after a window resize, so retain
        // its layout while rasterizing to a fixed physical label resolution.
        canvasWidth: mmToPrintPixels(previewWidthMm),
        canvasHeight: mmToPrintPixels(previewHeightMm),
        fontEmbedCSS,
        pixelRatio: 1,
      });
    } finally {
      target.classList.remove(captureClassName);
    }
    const marker = "base64,";
    const markerIndex = dataUrl.indexOf(marker);
    if (markerIndex < 0) {
      throw new Error("预览图生成失败。");
    }
    return dataUrl.slice(markerIndex + marker.length);
  }, [previewHeightMm, previewWidthMm]);

  const captureRecordPreview = useCallback(async (
    recordIndex: number,
    fontEmbedCSS: string | undefined
  ): Promise<string> => {
    // A synchronous commit guarantees that html-to-image captures the bindings for this
    // exact record, rather than the previous preview frame.
    flushSync(() => setCaptureRecordIndex(recordIndex));
    return capturePreviewPngBase64(fontEmbedCSS);
  }, [capturePreviewPngBase64]);

  const handleSubmit = useCallback(async () => {
    if (submitting || capturing) {
      return;
    }
    // Commit the busy state before html-to-image begins its CPU-heavy DOM walk,
    // so the print click always receives immediate visual feedback.
    flushSync(() => setCapturing(true));
    try {
      // Freeze this once so every label in the submitted batch has the exact same print time.
      const timestamp = new Date();
      flushSync(() => setPrintTimestamp(timestamp));
      const fontEmbedCSS = await resolvePrintFontEmbedCSS(previewSurfaceRef.current);
      const previewPngBase64s: string[] = [];
      for (let index = 0; index < records.length; index += 1) {
        previewPngBase64s.push(await captureRecordPreview(index, fontEmbedCSS));
      }
      const submitted = await onConfirm({
        printerId,
        copies: Math.max(1, Math.trunc(copies)),
        widthMm: previewWidthMm,
        heightMm: previewHeightMm,
        previewPngBase64s,
      });
      if (submitted) {
        onClose();
      }
    } finally {
      flushSync(() => setCaptureRecordIndex(0));
      setPrintTimestamp(null);
      setCapturing(false);
    }
  }, [captureRecordPreview, capturing, copies, onConfirm, previewHeightMm, previewWidthMm, printerId, records, submitting]);

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

      if (event.key === "Enter" && !event.isComposing && !submitting && !capturing) {
        event.preventDefault();
        void handleSubmit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [capturing, handleSubmit, onClose, open, submitting]);

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
                  disabled={submitting || capturing || loadingPrinters}
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
                  disabled={submitting || capturing}
                >
                  {capturing ? `生成第 ${captureRecordIndex + 1}/${records.length} 条打印图...` : submitting ? "打印中..." : "打印"}
                </button>
                <button type="button" className="tool-ghost print-cancel-btn" onClick={onClose} disabled={submitting || capturing}>
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
                {records.length > 1 ? ` · 数据 ${captureRecordIndex + 1}/${records.length}` : ""}
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
                    const previewValue = resolveBindingValue(element.binding, previewRecord, {
                      now: printTimestamp ?? new Date(),
                    });
                    const elementStyle: CSSProperties = {
                      left: `${toPercent(element.xMm, previewWidthMm)}%`,
                      top: `${toPercent(element.yMm, previewHeightMm)}%`,
                      width: `${toPercent(element.widthMm, previewWidthMm)}%`,
                      height: `${toPercent(element.heightMm, previewHeightMm)}%`,
                      transform: `rotate(${element.rotation}deg)`,
                    };

                    if (element.type === "text") {
                      const wrapMode = element.textStyle.wrapMode ?? "auto";
                      const textFitScale = computeTextFitScale({
                        text: previewValue,
                        textStyle: element.textStyle,
                        widthMm: element.widthMm,
                        heightMm: element.heightMm,
                        mmToPx: previewMmToPx,
                      });
                      // Preserve glyph proportions. Independent scaleX/scaleY transforms
                      // turn small CJK strokes into sub-pixel lines before the thermal
                      // raster pass, which makes them look broken even when barcodes stay
                      // sharp. A uniform font-size reduction keeps the same fit without
                      // distorting the typeface.
                      const uniformTextFitScale = Math.min(textFitScale.scaleX, textFitScale.scaleY);
                      return (
                        <div key={element.id} className="print-preview-element print-preview-text" style={elementStyle}>
                          <div
                            className="element-content"
                            style={{
                              fontFamily: element.textStyle.fontFamily,
                              fontSize: `${Math.max(1, element.textStyle.fontSize * previewMmToPx * uniformTextFitScale)}px`,
                              fontWeight: element.textStyle.fontWeight,
                              fontStyle: element.textStyle.italic ? "italic" : "normal",
                              textDecoration: buildTextDecoration(element.textStyle),
                              textAlign: element.textStyle.align,
                              color: element.textStyle.color,
                              letterSpacing: `${Math.max(
                                0,
                                element.textStyle.letterSpacing * previewMmToPx * uniformTextFitScale
                              )}px`,
                              lineHeight: element.textStyle.lineHeight,
                              whiteSpace: wrapMode === "singleLine" ? "nowrap" : "pre-wrap",
                              overflowWrap: wrapMode === "singleLine" ? "normal" : "anywhere",
                              wordBreak: wrapMode === "singleLine" ? "normal" : "break-word",
                              textOverflow: "clip",
                              justifyContent:
                                element.textStyle.align === "center"
                                  ? "center"
                                  : element.textStyle.align === "right"
                                    ? "flex-end"
                                    : "flex-start",
                            }}
                          >
                            <span
                              className={`element-content-text ${
                                wrapMode === "singleLine" ? "is-single-line" : "is-auto-wrap"
                              }`}
                              style={{ transformOrigin: `${getAlignTransformOrigin(element.textStyle.align)} center` }}
                            >
                              {previewValue}
                            </span>
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
                      const strokeWidth = normalizeVisualStrokeWidth(element.textStyle.strokeWidth);
                      const strokeDashArray = normalizeVisualDashArray(element.textStyle.strokeDashArray);
                      const strokeColor = toAlphaColor(
                        element.textStyle.strokeColor || element.textStyle.color,
                        element.textStyle.strokeOpacity,
                        element.textStyle.color
                      );
                      const fillColor = toAlphaColor(
                        element.textStyle.fillColor || element.textStyle.color,
                        element.textStyle.fillOpacity,
                        element.textStyle.color
                      );
                      const shapeStyle = {
                        ...elementStyle,
                        color: strokeColor,
                        borderColor: strokeColor,
                        borderWidth: `${toShapeBorderWidthPx(strokeWidth)}px`,
                        borderStyle: strokeDashArray.length > 0 ? "dashed" : "solid",
                        backgroundColor: fillColor,
                      };
                      const shapePresetId =
                        element.binding.mode === "fixed" ? readShapePresetIdFromBinding(element.binding.fixedValue) : null;

                      // html-to-image does not consistently preserve SVG's
                      // non-scaling-stroke rule. Its exported rectangles can
                      // therefore gain a wide outline that covers nearby
                      // text. Render the common label-frame shapes as CSS so
                      // their border width matches the on-screen preview.
                      if (shapePresetId === "rectangle" || shapePresetId === "rounded-rectangle") {
                        const borderWidthPx = toShapeBorderWidthPx(strokeWidth);
                        return (
                          <div
                            key={element.id}
                            className="print-preview-element print-preview-shape print-preview-preset print-preview-css-shape"
                            style={{
                              ...shapeStyle,
                              // The matching SVG presets have fill="none". Keep that
                              // transparent interior when exporting with CSS borders;
                              // otherwise the generic shape fill turns table frames blue.
                              backgroundColor: "transparent",
                              borderRadius: shapePresetId === "rounded-rectangle" ? "4px" : "0",
                              ...(strokeDashArray.length > 0
                                ? {}
                                : {
                                    borderStyle: "none",
                                    borderWidth: 0,
                                    // Draw inward so no edge lands outside the capture box or
                                    // vanishes because of percentage/sub-pixel rounding.
                                    boxShadow: `inset 0 0 0 ${borderWidthPx}px ${strokeColor}`,
                                  }),
                            }}
                          />
                        );
                      }

                      if (shapePresetId) {
                        return (
                          <div
                            key={element.id}
                            className="print-preview-element print-preview-shape print-preview-preset"
                            style={{
                              ...elementStyle,
                              color: strokeColor,
                              borderWidth: 0,
                              padding: 0,
                              background: "transparent",
                            }}
                          >
                            <PresetGlyph
                              kind="shape"
                              presetId={shapePresetId}
                              className="print-preview-preset-svg"
                              strokeColor={strokeColor}
                              fillColor={element.textStyle.fillColor}
                              strokeWidth={strokeWidth}
                              strokeOpacity={element.textStyle.strokeOpacity}
                              fillOpacity={element.textStyle.fillOpacity}
                              strokeLineCap={element.textStyle.strokeLineCap}
                              strokeLineJoin={element.textStyle.strokeLineJoin}
                              strokeDashArray={strokeDashArray}
                              strokeDashOffset={element.textStyle.strokeDashOffset}
                              strokeMiterLimit={element.textStyle.strokeMiterLimit}
                              fillRule={element.textStyle.fillRule}
                            />
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
                          style={shapeStyle}
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
                          style={{ ...elementStyle, color: element.textStyle.strokeColor || element.textStyle.color }}
                        >
                          <PresetGlyph
                            kind="icon"
                            presetId={iconPresetId}
                            className="print-preview-preset-svg"
                            strokeColor={element.textStyle.strokeColor || element.textStyle.color}
                            fillColor={element.textStyle.fillColor}
                            strokeWidth={element.textStyle.strokeWidth}
                            strokeOpacity={element.textStyle.strokeOpacity}
                            fillOpacity={element.textStyle.fillOpacity}
                            strokeLineCap={element.textStyle.strokeLineCap}
                            strokeLineJoin={element.textStyle.strokeLineJoin}
                            strokeDashArray={element.textStyle.strokeDashArray}
                            strokeDashOffset={element.textStyle.strokeDashOffset}
                            strokeMiterLimit={element.textStyle.strokeMiterLimit}
                            fillRule={element.textStyle.fillRule}
                          />
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
                            color: toAlphaColor(
                              element.textStyle.strokeColor || element.textStyle.color,
                              element.textStyle.strokeOpacity,
                              element.textStyle.color
                            ),
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

function mmToPrintPixels(mm: number): number {
  return Math.max(1, Math.round((Math.max(1, mm) / 25.4) * PRINT_RENDER_DPI));
}

async function resolvePrintFontEmbedCSS(target: HTMLElement | null): Promise<string | undefined> {
  if (!target) {
    return undefined;
  }
  try {
    // Font CSS is invariant across the data rows of one job. Supplying it to
    // every capture avoids re-scanning and re-embedding fonts 1,000 times.
    return await getFontEmbedCSS(target, { cacheBust: false });
  } catch {
    // html-to-image will use its standard path if a browser cannot expose font
    // rules (for example, a protected system font).
    return undefined;
  }
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
