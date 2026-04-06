import type { CSSProperties } from "react";

export type VisualPresetKind = "shape" | "icon";

export type VisualPreset = {
  id: string;
  label: string;
  category: string;
  markup: string;
};

const SHAPE_PREFIX = "shape:";
const ICON_PREFIX = "icon:";

export const SHAPE_PRESETS: VisualPreset[] = [
  {
    id: "rectangle",
    label: "Rectangle",
    category: "Basic",
    markup: '<rect x="4" y="6" width="16" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "rounded-rectangle",
    label: "Rounded Rectangle",
    category: "Basic",
    markup: '<rect x="4" y="6" width="16" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "capsule",
    label: "Capsule",
    category: "Basic",
    markup: '<rect x="3" y="7" width="18" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "circle",
    label: "Circle",
    category: "Basic",
    markup: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "ellipse",
    label: "Ellipse",
    category: "Basic",
    markup: '<ellipse cx="12" cy="12" rx="9" ry="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "diamond",
    label: "Diamond",
    category: "Basic",
    markup: '<polygon points="12,4 20,12 12,20 4,12" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "triangle",
    label: "Triangle",
    category: "Basic",
    markup: '<polygon points="12,4 20,19 4,19" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "right-triangle",
    label: "Right Triangle",
    category: "Basic",
    markup: '<polygon points="5,5 19,19 5,19" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "pentagon",
    label: "Pentagon",
    category: "Polygon",
    markup: '<polygon points="12,4 20,10 17,20 7,20 4,10" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "hexagon",
    label: "Hexagon",
    category: "Polygon",
    markup: '<polygon points="7,4 17,4 21,12 17,20 7,20 3,12" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "octagon",
    label: "Octagon",
    category: "Polygon",
    markup:
      '<polygon points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "parallelogram",
    label: "Parallelogram",
    category: "Polygon",
    markup: '<polygon points="7,5 21,5 17,19 3,19" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "trapezoid",
    label: "Trapezoid",
    category: "Polygon",
    markup: '<polygon points="7,6 17,6 21,18 3,18" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "star",
    label: "Star",
    category: "Complex",
    markup:
      '<path d="M12 3.5l2.7 5.4 6 .9-4.3 4.2 1 6.1L12 17.2 6.6 20l1-6.1-4.3-4.2 6-.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "heart",
    label: "Heart",
    category: "Complex",
    markup:
      '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.4A4 4 0 0119 10c0 5.5-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "cloud",
    label: "Cloud",
    category: "Complex",
    markup:
      '<path d="M7 18h10a3 3 0 10-.6-5.9A4.5 4.5 0 007.9 9.8 3.5 3.5 0 007 18z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "ring",
    label: "Ring",
    category: "Complex",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "cross",
    label: "Cross",
    category: "Complex",
    markup:
      '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "speech-bubble",
    label: "Speech Bubble",
    category: "Callout",
    markup:
      '<path d="M5 5h14v10H11l-4 4v-4H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "tag",
    label: "Tag",
    category: "Callout",
    markup:
      '<path d="M3.5 10.5L10.5 3.5h7l3 3v7l-7 7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="14.5" cy="7.5" r="1.2" fill="currentColor"/>',
  },
  {
    id: "flag",
    label: "Flag",
    category: "Callout",
    markup:
      '<path d="M6 3v18M7 4h11l-2.8 4 2.8 4H7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "arrow-right-block",
    label: "Arrow Right",
    category: "Arrows",
    markup:
      '<path d="M4 8h9V5l7 7-7 7v-3H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "arrow-left-block",
    label: "Arrow Left",
    category: "Arrows",
    markup:
      '<path d="M20 8h-9V5l-7 7 7 7v-3h9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "arrow-up-block",
    label: "Arrow Up",
    category: "Arrows",
    markup:
      '<path d="M8 20v-9H5l7-7 7 7h-3v9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "arrow-down-block",
    label: "Arrow Down",
    category: "Arrows",
    markup:
      '<path d="M8 4v9H5l7 7 7-7h-3V4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "chevron-right",
    label: "Chevron Right",
    category: "Arrows",
    markup: '<polyline points="8,5 16,12 8,19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "chevron-left",
    label: "Chevron Left",
    category: "Arrows",
    markup: '<polyline points="16,5 8,12 16,19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
];

export const ICON_PRESETS: VisualPreset[] = [
  {
    id: "home",
    label: "Home",
    category: "Common",
    markup:
      '<path d="M4 11l8-7 8 7M7 10v10h10V10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "user",
    label: "User",
    category: "Common",
    markup:
      '<circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 19c1.7-3 4.1-4.5 7-4.5s5.3 1.5 7 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "users",
    label: "Users",
    category: "Common",
    markup:
      '<circle cx="9" cy="9" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 19c1.2-2.3 2.9-3.4 5-3.4 1.2 0 2.2.3 3.1.9M13.5 19c.7-1.5 1.9-2.2 3.3-2.2 1.2 0 2.3.5 3.2 1.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  },
  {
    id: "phone",
    label: "Phone",
    category: "Common",
    markup:
      '<path d="M8 3h8v18H8zM11 18h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "mail",
    label: "Mail",
    category: "Common",
    markup:
      '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 8l7 5 7-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "calendar",
    label: "Calendar",
    category: "Common",
    markup:
      '<rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M4 9h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "clock",
    label: "Clock",
    category: "Common",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "map-pin",
    label: "Map Pin",
    category: "Common",
    markup:
      '<path d="M12 20s6-5.5 6-10a6 6 0 10-12 0c0 4.5 6 10 6 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "search",
    label: "Search",
    category: "Common",
    markup:
      '<circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "settings",
    label: "Settings",
    category: "Common",
    markup:
      '<circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "bell",
    label: "Bell",
    category: "Common",
    markup:
      '<path d="M6 16h12l-1.2-1.6V10a4.8 4.8 0 10-9.6 0v4.4zM10 18a2 2 0 004 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "shield",
    label: "Shield",
    category: "Status",
    markup:
      '<path d="M12 3l7 3v5c0 4.8-3 7.6-7 10-4-2.4-7-5.2-7-10V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "lock",
    label: "Lock",
    category: "Status",
    markup:
      '<rect x="6" y="11" width="12" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 11V8a3.5 3.5 0 117 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "unlock",
    label: "Unlock",
    category: "Status",
    markup:
      '<rect x="6" y="11" width="12" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 11V8a3.5 3.5 0 016.8-1.2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "check-circle",
    label: "Check Circle",
    category: "Status",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.2 12.4l2.4 2.5 5.2-5.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "x-circle",
    label: "X Circle",
    category: "Status",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "alert-triangle",
    label: "Alert",
    category: "Status",
    markup:
      '<path d="M12 4l8 15H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v4.5M12 16.5h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "info-circle",
    label: "Info",
    category: "Status",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.2v5M12 8h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "plus-circle",
    label: "Plus Circle",
    category: "Status",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "minus-circle",
    label: "Minus Circle",
    category: "Status",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "play-circle",
    label: "Play",
    category: "Status",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 8.8l5.2 3.2-5.2 3.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "pause-circle",
    label: "Pause",
    category: "Status",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 9v6M14 9v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "stop-circle",
    label: "Stop",
    category: "Status",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9.2" y="9.2" width="5.6" height="5.6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "refresh",
    label: "Refresh",
    category: "Actions",
    markup:
      '<path d="M18 8V4l3 3-3 3V6.9A6.2 6.2 0 106 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "download",
    label: "Download",
    category: "Actions",
    markup:
      '<path d="M12 4v10M8.5 10.5L12 14l3.5-3.5M5 19h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "upload",
    label: "Upload",
    category: "Actions",
    markup:
      '<path d="M12 20V10M8.5 13.5L12 10l3.5 3.5M5 5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "power",
    label: "Power",
    category: "Device",
    markup:
      '<path d="M12 4v8M7 6.5A7 7 0 1017 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    category: "Device",
    markup:
      '<path d="M4 9a11 11 0 0116 0M7 12a7 7 0 0110 0M10 15a3 3 0 014 0M12 18h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "battery",
    label: "Battery",
    category: "Device",
    markup:
      '<rect x="4" y="8" width="15" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="19.5" y="10" width="1.8" height="4" rx="1" fill="currentColor"/><rect x="6.5" y="10" width="8" height="4" fill="currentColor"/>',
  },
  {
    id: "printer",
    label: "Printer",
    category: "Device",
    markup:
      '<path d="M7 8V4h10v4M6 15h12v5H6zM4 9h16v6H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="17" cy="12" r="1" fill="currentColor"/>',
  },
  {
    id: "barcode",
    label: "Barcode",
    category: "Device",
    markup:
      '<rect x="4" y="5" width="1.3" height="14" fill="currentColor"/><rect x="6.5" y="5" width="2.2" height="14" fill="currentColor"/><rect x="10.5" y="5" width="1" height="14" fill="currentColor"/><rect x="13" y="5" width="2.8" height="14" fill="currentColor"/><rect x="17.2" y="5" width="1.1" height="14" fill="currentColor"/><rect x="19.5" y="5" width="1.5" height="14" fill="currentColor"/>',
  },
  {
    id: "qrcode",
    label: "QR Code",
    category: "Device",
    markup:
      '<rect x="4" y="4" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="4" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="14" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="14" width="2" height="2" fill="currentColor"/><rect x="18" y="14" width="2" height="2" fill="currentColor"/><rect x="16" y="18" width="4" height="2" fill="currentColor"/>',
  },
  {
    id: "package",
    label: "Package",
    category: "Logistics",
    markup:
      '<path d="M4 8l8-4 8 4-8 4zM4 8v8l8 4 8-4V8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "truck",
    label: "Truck",
    category: "Logistics",
    markup:
      '<path d="M4 8h10v7H4zM14 10h3l3 3v2h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8" cy="17" r="1.7" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="17" r="1.7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "shopping-cart",
    label: "Cart",
    category: "Logistics",
    markup:
      '<path d="M4 6h2l2 9h9l2-6H8M10 18a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm8 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "tag",
    label: "Tag",
    category: "Logistics",
    markup:
      '<path d="M3.5 10.5L10.5 3.5h7l3 3v7l-7 7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="14.5" cy="7.5" r="1.2" fill="currentColor"/>',
  },
  {
    id: "star",
    label: "Star",
    category: "Markers",
    markup:
      '<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.7-5-2.6-5 2.6.9-5.7-4-3.9 5.6-.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "heart",
    label: "Heart",
    category: "Markers",
    markup:
      '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.4A4 4 0 0119 10c0 5.5-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "tool",
    label: "Tool",
    category: "Markers",
    markup:
      '<path d="M14.5 6.5A3.5 3.5 0 1110 10L4.5 15.5a1.4 1.4 0 000 2l2 2a1.4 1.4 0 002 0L14 14a3.5 3.5 0 01.5-7.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "factory",
    label: "Factory",
    category: "Markers",
    markup:
      '<path d="M4 20V9l5 3V9l5 3V6l6 3v11zM7 20v-3M11 20v-4M15 20v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
];

const shapePresetMap = new Map(SHAPE_PRESETS.map((preset) => [preset.id, preset]));
const iconPresetMap = new Map(ICON_PRESETS.map((preset) => [preset.id, preset]));

export const DEFAULT_SHAPE_PRESET_ID = SHAPE_PRESETS[0].id;
export const DEFAULT_ICON_PRESET_ID = ICON_PRESETS[0].id;

export function getShapePreset(id: string): VisualPreset | null {
  return shapePresetMap.get(id) ?? null;
}

export function getIconPreset(id: string): VisualPreset | null {
  return iconPresetMap.get(id) ?? null;
}

export function toShapePresetBindingValue(id: string): string {
  return `${SHAPE_PREFIX}${id}`;
}

export function toIconPresetBindingValue(id: string): string {
  return `${ICON_PREFIX}${id}`;
}

export function readShapePresetIdFromBinding(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const preferred = value.startsWith(SHAPE_PREFIX) ? value.slice(SHAPE_PREFIX.length) : value;
  return shapePresetMap.has(preferred) ? preferred : null;
}

export function readIconPresetIdFromBinding(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const preferred = value.startsWith(ICON_PREFIX) ? value.slice(ICON_PREFIX.length) : value;
  return iconPresetMap.has(preferred) ? preferred : null;
}

type PresetGlyphProps = {
  kind: VisualPresetKind;
  presetId: string;
  className?: string;
  color?: string;
  title?: string;
};

export function PresetGlyph({ kind, presetId, className, color, title }: PresetGlyphProps) {
  const preset = kind === "shape" ? getShapePreset(presetId) : getIconPreset(presetId);
  if (!preset) {
    return null;
  }

  const style: CSSProperties | undefined = color ? { color } : undefined;
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={style}
      role={title ? "img" : "presentation"}
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: preset.markup }}
    />
  );
}

