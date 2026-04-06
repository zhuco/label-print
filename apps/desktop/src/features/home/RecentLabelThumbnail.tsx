import type { CSSProperties } from "react";

import { BarcodePreview } from "../editor/BarcodePreview";
import { QrcodePreview } from "../editor/QrcodePreview";
import { resolveBindingValue } from "../editor/core/binding";
import { buildTextDecoration } from "../editor/core/text-style";
import type { TemplateSnapshot } from "../editor/core/template-snapshot";
import { PresetGlyph, readIconPresetIdFromBinding, readShapePresetIdFromBinding } from "../editor/core/visual-presets";

type RecentLabelThumbnailProps = {
  snapshot: TemplateSnapshot;
};

function toPercent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (value / total) * 100));
}

export function RecentLabelThumbnail({ snapshot }: RecentLabelThumbnailProps) {
  const widthMm = Math.max(10, snapshot.labelSize.widthMm);
  const heightMm = Math.max(10, snapshot.labelSize.heightMm);

  return (
    <div
      className="home-recent-thumbnail"
      style={
        {
          "--thumb-ratio": `${widthMm} / ${heightMm}`,
        } as CSSProperties
      }
    >
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
            return (
              <div key={element.id} className="home-thumb-element home-thumb-text" style={style}>
                <span
                  style={{
                    color: element.textStyle.color,
                    fontFamily: element.textStyle.fontFamily,
                    fontSize: `${Math.max(8, element.textStyle.fontSize * 1.2)}px`,
                    fontWeight: element.textStyle.fontWeight,
                    fontStyle: element.textStyle.italic ? "italic" : "normal",
                    textDecoration: buildTextDecoration(element.textStyle),
                    textAlign: element.textStyle.align,
                    letterSpacing: `${Math.max(0, element.textStyle.letterSpacing)}px`,
                    lineHeight: element.textStyle.lineHeight,
                  }}
                >
                  {value || "文本"}
                </span>
              </div>
            );
          }

          if (element.type === "barcode") {
            return (
              <div key={element.id} className="home-thumb-element home-thumb-barcode" style={style}>
                <BarcodePreview
                  value={value || "123456789"}
                  symbology={element.barcode.symbology}
                  className="home-thumb-barcode-svg"
                  showText={false}
                />
              </div>
            );
          }

          if (element.type === "qrcode") {
            return (
              <div key={element.id} className="home-thumb-element home-thumb-qrcode" style={style}>
                <QrcodePreview value={value || "https://label.local"} className="home-thumb-qrcode-svg" />
              </div>
            );
          }

          if (element.type === "image") {
            return value.startsWith("data:image/") ? (
              <div key={element.id} className="home-thumb-element home-thumb-image" style={style}>
                <img src={value} alt={element.name} draggable={false} />
              </div>
            ) : (
              <div key={element.id} className="home-thumb-element home-thumb-image-mark" style={style}>
                <span>{value || "IMG"}</span>
              </div>
            );
          }

          if (element.type === "shape") {
            const presetId =
              element.binding.mode === "fixed" ? readShapePresetIdFromBinding(element.binding.fixedValue) : null;
            if (presetId) {
              return (
                <div
                  key={element.id}
                  className="home-thumb-element home-thumb-shape home-thumb-shape-preset"
                  style={{
                    ...style,
                    borderColor: element.textStyle.color,
                    color: element.textStyle.color,
                  }}
                >
                  <PresetGlyph kind="shape" presetId={presetId} className="home-thumb-preset-svg" />
                </div>
              );
            }
            if (value.startsWith("data:image/")) {
              return (
                <div key={element.id} className="home-thumb-element home-thumb-image" style={style}>
                  <img src={value} alt={element.name} draggable={false} />
                </div>
              );
            }
            return (
              <div
                key={element.id}
                className="home-thumb-element home-thumb-shape"
                style={{
                  ...style,
                  borderColor: element.textStyle.color,
                }}
              >
                <span>{value || "形状"}</span>
              </div>
            );
          }

          const iconPresetId =
            element.binding.mode === "fixed" ? readIconPresetIdFromBinding(element.binding.fixedValue) : null;
          if (iconPresetId) {
            return (
              <div
                key={element.id}
                className="home-thumb-element home-thumb-icon home-thumb-icon-preset"
                style={{
                  ...style,
                  color: element.textStyle.color,
                }}
              >
                <PresetGlyph kind="icon" presetId={iconPresetId} className="home-thumb-preset-svg" />
              </div>
            );
          }
          if (value.startsWith("data:image/")) {
            return (
              <div key={element.id} className="home-thumb-element home-thumb-image" style={style}>
                <img src={value} alt={element.name} draggable={false} />
              </div>
            );
          }

          return (
            <div key={element.id} className="home-thumb-element home-thumb-icon" style={style}>
              <span
                style={{
                  color: element.textStyle.color,
                  fontFamily: element.textStyle.fontFamily,
                  fontWeight: element.textStyle.fontWeight,
                }}
              >
                {value || "@"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
