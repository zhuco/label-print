import type { CSSProperties } from "react";

import { BarcodePreview } from "../editor/BarcodePreview";
import { QrcodePreview } from "../editor/QrcodePreview";
import { resolveBindingValue } from "../editor/core/binding";
import { buildTextDecoration, computeTextFitScale } from "../editor/core/text-style";
import type { TemplateSnapshot } from "../editor/core/template-snapshot";
import {
  normalizeVisualDashArray,
  normalizeVisualStrokeWidth,
  toAlphaColor,
  toShapeBorderWidthPx,
} from "../editor/core/visual-style";
import { PresetGlyph, readIconPresetIdFromBinding, readShapePresetIdFromBinding } from "../editor/core/visual-presets";

type RecentLabelThumbnailProps = {
  snapshot: TemplateSnapshot;
};

function toPercent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

function getAlignTransformOrigin(align: "left" | "center" | "right"): "left" | "center" | "right" {
  return align === "right" ? "right" : align === "center" ? "center" : "left";
}

/** Compact, non-interactive preview used only for recent local labels. */
export function RecentLabelThumbnail({ snapshot }: RecentLabelThumbnailProps) {
  const widthMm = Math.max(10, snapshot.labelSize.widthMm);
  const heightMm = Math.max(10, snapshot.labelSize.heightMm);

  return (
    <div className="home-recent-thumbnail" style={{ "--thumb-ratio": `${widthMm} / ${heightMm}` } as CSSProperties}>
      <div className="home-thumb-stage">
        {snapshot.elements.map((element) => {
          const value = resolveBindingValue(element.binding, {});
          const style: CSSProperties = {
            left: `${toPercent(element.xMm, widthMm)}%`,
            top: `${toPercent(element.yMm, heightMm)}%`,
            width: `${toPercent(element.widthMm, widthMm)}%`,
            height: `${toPercent(element.heightMm, heightMm)}%`,
            transform: `rotate(${element.rotation}deg)`,
          };

          if (element.type === "text") {
            const wrapMode = element.textStyle.wrapMode ?? "auto";
            const isSingleLine = wrapMode === "singleLine";
            // The stage width represents `widthMm`, so cqw maps the editor's
            // millimetre-based text metrics onto the responsive thumbnail.
            const fontSizeCqw = Math.max(0.1, (element.textStyle.fontSize / widthMm) * 100);
            const letterSpacingCqw = Math.max(0, (element.textStyle.letterSpacing / widthMm) * 100);
            const textFitScale = computeTextFitScale({
              text: value,
              textStyle: element.textStyle,
              widthMm: element.widthMm,
              heightMm: element.heightMm,
              mmToPx: 1,
            });
            return (
              <div
                key={element.id}
                className="home-thumb-element home-thumb-text"
                style={{
                  ...style,
                  justifyContent:
                    element.textStyle.align === "center"
                      ? "center"
                      : element.textStyle.align === "right"
                        ? "flex-end"
                        : "flex-start",
                }}
              >
                <span className={isSingleLine ? "is-single-line" : "is-auto-wrap"} style={{
                  color: element.textStyle.color,
                  fontFamily: element.textStyle.fontFamily,
                  fontSize: `${fontSizeCqw}cqw`,
                  fontWeight: element.textStyle.fontWeight,
                  fontStyle: element.textStyle.italic ? "italic" : "normal",
                  textDecoration: buildTextDecoration(element.textStyle),
                  textAlign: element.textStyle.align,
                  letterSpacing: `${letterSpacingCqw}cqw`,
                  lineHeight: element.textStyle.lineHeight,
                  whiteSpace: isSingleLine ? "nowrap" : "pre-wrap",
                  overflowWrap: isSingleLine ? "normal" : "anywhere",
                  wordBreak: isSingleLine ? "normal" : "break-word",
                  textOverflow: "clip",
                  transform: `scale(${textFitScale.scaleX}, ${textFitScale.scaleY})`,
                  transformOrigin: `${getAlignTransformOrigin(element.textStyle.align)} center`,
                }}>
                  {value || "文本"}
                </span>
              </div>
            );
          }

          if (element.type === "barcode") {
            return <div key={element.id} className="home-thumb-element home-thumb-barcode" style={style}>
              <BarcodePreview
                value={value || "123456789"}
                symbology={element.barcode.symbology}
                className="home-thumb-barcode-svg"
                showText={element.barcode.textPosition !== "none"}
              />
            </div>;
          }

          if (element.type === "qrcode") {
            return <div key={element.id} className="home-thumb-element home-thumb-qrcode" style={style}>
              <QrcodePreview value={value || "https://label.local"} className="home-thumb-qrcode-svg" />
            </div>;
          }

          if (element.type === "image") {
            return value.startsWith("data:image/")
              ? <div key={element.id} className="home-thumb-element home-thumb-image" style={style}><img src={value} alt={element.name} draggable={false} /></div>
              : <div key={element.id} className="home-thumb-element home-thumb-image-mark" style={style}><span>{value || "IMG"}</span></div>;
          }

          if (element.type === "shape") {
            const strokeWidth = normalizeVisualStrokeWidth(element.textStyle.strokeWidth);
            const strokeDashArray = normalizeVisualDashArray(element.textStyle.strokeDashArray);
            const strokeColor = toAlphaColor(element.textStyle.strokeColor || element.textStyle.color, element.textStyle.strokeOpacity, element.textStyle.color);
            const fillColor = toAlphaColor(element.textStyle.fillColor || element.textStyle.color, element.textStyle.fillOpacity, element.textStyle.color);
            const shapeStyle = {
              ...style,
              borderColor: strokeColor,
              borderWidth: `${toShapeBorderWidthPx(strokeWidth)}px`,
              borderStyle: strokeDashArray.length > 0 ? "dashed" : "solid",
              backgroundColor: fillColor,
            };
            const presetId = element.binding.mode === "fixed" ? readShapePresetIdFromBinding(element.binding.fixedValue) : null;
            if (presetId) {
              return <div
                key={element.id}
                className="home-thumb-element home-thumb-shape home-thumb-shape-preset"
                style={{
                  ...style,
                  color: strokeColor,
                  borderWidth: 0,
                  background: "transparent",
                }}
              >
                <PresetGlyph kind="shape" presetId={presetId} className="home-thumb-preset-svg" strokeColor={strokeColor} fillColor={element.textStyle.fillColor} strokeWidth={strokeWidth} strokeOpacity={element.textStyle.strokeOpacity} fillOpacity={element.textStyle.fillOpacity} strokeLineCap={element.textStyle.strokeLineCap} strokeLineJoin={element.textStyle.strokeLineJoin} strokeDashArray={strokeDashArray} strokeDashOffset={element.textStyle.strokeDashOffset} strokeMiterLimit={element.textStyle.strokeMiterLimit} fillRule={element.textStyle.fillRule} />
              </div>;
            }
            if (value.startsWith("data:image/")) {
              return <div key={element.id} className="home-thumb-element home-thumb-image" style={style}><img src={value} alt={element.name} draggable={false} /></div>;
            }
            return <div key={element.id} className="home-thumb-element home-thumb-shape" style={shapeStyle}><span>{value || "形状"}</span></div>;
          }

          const iconPresetId = element.binding.mode === "fixed" ? readIconPresetIdFromBinding(element.binding.fixedValue) : null;
          if (iconPresetId) {
            return <div key={element.id} className="home-thumb-element home-thumb-icon home-thumb-icon-preset" style={{ ...style, color: element.textStyle.strokeColor || element.textStyle.color }}>
              <PresetGlyph kind="icon" presetId={iconPresetId} className="home-thumb-preset-svg" strokeColor={element.textStyle.strokeColor || element.textStyle.color} fillColor={element.textStyle.fillColor} strokeWidth={element.textStyle.strokeWidth} strokeOpacity={element.textStyle.strokeOpacity} fillOpacity={element.textStyle.fillOpacity} strokeLineCap={element.textStyle.strokeLineCap} strokeLineJoin={element.textStyle.strokeLineJoin} strokeDashArray={element.textStyle.strokeDashArray} strokeDashOffset={element.textStyle.strokeDashOffset} strokeMiterLimit={element.textStyle.strokeMiterLimit} fillRule={element.textStyle.fillRule} />
            </div>;
          }
          if (value.startsWith("data:image/")) {
            return <div key={element.id} className="home-thumb-element home-thumb-image" style={style}><img src={value} alt={element.name} draggable={false} /></div>;
          }
          return <div key={element.id} className="home-thumb-element home-thumb-icon" style={style}>
            <span style={{ color: element.textStyle.strokeColor || element.textStyle.color, fontFamily: element.textStyle.fontFamily, fontWeight: element.textStyle.fontWeight }}>{value || "@"}</span>
          </div>;
        })}
      </div>
    </div>
  );
}
