import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

import { normalizeBarcodeValue } from "./core/barcode";
import type { BarcodeSymbology } from "./core/types";

type BarcodePreviewProps = {
  value: string;
  symbology?: BarcodeSymbology;
  className?: string;
  showText?: boolean;
  mmToPx?: number;
  moduleWidthMm?: number;
  quietZoneMm?: number;
  heightMm?: number;
};

export function BarcodePreview({
  value,
  symbology = "CODE128A",
  className,
  showText = true,
  mmToPx = 8,
  moduleWidthMm = 0.33,
  quietZoneMm = 1,
  heightMm = 8,
}: BarcodePreviewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const barcodeValue = normalizeBarcodeValue(value || "", symbology);
    const safeMmToPx = Number.isFinite(mmToPx) && mmToPx > 0 ? mmToPx : 8;
    const safeModuleWidthMm = Number.isFinite(moduleWidthMm) && moduleWidthMm > 0 ? moduleWidthMm : 0.33;
    const safeQuietZoneMm = Number.isFinite(quietZoneMm) && quietZoneMm >= 0 ? quietZoneMm : 1;
    const safeHeightMm = Number.isFinite(heightMm) && heightMm > 0 ? heightMm : 8;
    const barcodeHeightPx = Math.max(6, safeHeightMm * safeMmToPx);
    const moduleWidthPx = Math.max(0.5, safeModuleWidthMm * safeMmToPx);
    const quietZonePx = Math.max(0, safeQuietZoneMm * safeMmToPx);

    svg.setAttribute("preserveAspectRatio", "none");
    if (!supportsCanvasContext()) {
      renderFallback(svg, barcodeValue, showText);
      return;
    }

    try {
      JsBarcode(svg, barcodeValue, {
        format: symbology,
        displayValue: showText,
        margin: quietZonePx,
        fontSize: 10,
        height: barcodeHeightPx,
        width: moduleWidthPx,
        textMargin: 2,
      });
    } catch {
      renderFallback(svg, barcodeValue, showText);
    }
  }, [heightMm, mmToPx, moduleWidthMm, quietZoneMm, showText, value, symbology]);

  return <svg ref={svgRef} className={className} />;
}

function supportsCanvasContext(): boolean {
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    return Boolean(context);
  } catch {
    return false;
  }
}

function renderFallback(svg: SVGSVGElement, text: string, showText: boolean) {
  const safe = text.replace(/[^0-9A-Za-z]/g, "").slice(0, 16) || "000000";
  const pattern = safe
    .split("")
    .map((char) => char.charCodeAt(0).toString(2).padStart(8, "0"))
    .join("");

  svg.setAttribute("viewBox", "0 0 240 56");
  svg.innerHTML = "";

  let x = 0;
  for (const bit of pattern) {
    const width = bit === "1" ? 2 : 1;
    if (bit === "1") {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", "0");
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", "40");
      rect.setAttribute("fill", "#111");
      svg.appendChild(rect);
    }
    x += width;
    if (x > 220) {
      break;
    }
  }

  if (showText) {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", "120");
    label.setAttribute("y", "52");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "10");
    label.textContent = safe;
    svg.appendChild(label);
  }
}
