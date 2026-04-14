export const DEFAULT_VISUAL_STROKE_WIDTH = 1.8;
export const MIN_VISUAL_STROKE_WIDTH = 0.2;
export const MAX_VISUAL_STROKE_WIDTH = 12;
export const VISUAL_STROKE_NUDGE_STEP = 0.05;
export const DEFAULT_VISUAL_OPACITY = 1;
export const MIN_VISUAL_OPACITY = 0;
export const MAX_VISUAL_OPACITY = 1;
export const DEFAULT_VISUAL_MITER_LIMIT = 4;
export const MIN_VISUAL_MITER_LIMIT = 1;
export const MAX_VISUAL_MITER_LIMIT = 20;
export const DEFAULT_VISUAL_FILL_RULE = "nonzero" as const;

export const VISUAL_LINE_CAP_OPTIONS = ["butt", "round", "square"] as const;
export type VisualLineCap = (typeof VISUAL_LINE_CAP_OPTIONS)[number];
export const VISUAL_LINE_JOIN_OPTIONS = ["miter", "round", "bevel"] as const;
export type VisualLineJoin = (typeof VISUAL_LINE_JOIN_OPTIONS)[number];
export const VISUAL_FILL_RULE_OPTIONS = ["nonzero", "evenodd"] as const;
export type VisualFillRule = (typeof VISUAL_FILL_RULE_OPTIONS)[number];
export const MAX_VISUAL_DASH_SEGMENTS = 12;

export type VisualStylePresetPatch = {
  strokeWidth?: number;
  strokeOpacity?: number;
  fillOpacity?: number;
  strokeLineCap?: VisualLineCap;
  strokeLineJoin?: VisualLineJoin;
  strokeDashArray?: number[] | string;
  strokeDashOffset?: number;
  strokeMiterLimit?: number;
  fillRule?: VisualFillRule;
};

export type VisualStylePreset = {
  id: string;
  label: string;
  description: string;
  patch: VisualStylePresetPatch;
};

const VISUAL_LINE_CAP_SET = new Set<string>(VISUAL_LINE_CAP_OPTIONS);
const VISUAL_LINE_JOIN_SET = new Set<string>(VISUAL_LINE_JOIN_OPTIONS);
const VISUAL_FILL_RULE_SET = new Set<string>(VISUAL_FILL_RULE_OPTIONS);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeVisualStrokeWidth(value: number | undefined, fallback = DEFAULT_VISUAL_STROKE_WIDTH): number {
  const base = Number.isFinite(fallback) ? fallback : DEFAULT_VISUAL_STROKE_WIDTH;
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : base;
  return round2(Math.min(Math.max(numeric, MIN_VISUAL_STROKE_WIDTH), MAX_VISUAL_STROKE_WIDTH));
}

export function nudgeVisualStrokeWidth(current: number | undefined, delta: number): number {
  return normalizeVisualStrokeWidth(normalizeVisualStrokeWidth(current) + delta);
}

export function normalizeVisualOpacity(value: number | undefined, fallback = DEFAULT_VISUAL_OPACITY): number {
  const base = Number.isFinite(fallback) ? fallback : DEFAULT_VISUAL_OPACITY;
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : base;
  return round2(Math.min(Math.max(numeric, MIN_VISUAL_OPACITY), MAX_VISUAL_OPACITY));
}

export function normalizeVisualLineCap(value: string | undefined, fallback: VisualLineCap = "round"): VisualLineCap {
  if (typeof value === "string" && VISUAL_LINE_CAP_SET.has(value)) {
    return value as VisualLineCap;
  }
  return fallback;
}

export function normalizeVisualLineJoin(value: string | undefined, fallback: VisualLineJoin = "round"): VisualLineJoin {
  if (typeof value === "string" && VISUAL_LINE_JOIN_SET.has(value)) {
    return value as VisualLineJoin;
  }
  return fallback;
}

export function normalizeVisualDashArray(value: number[] | string | undefined): number[] {
  const normalizeNumbers = (source: number[]): number[] =>
    source
      .filter((item) => typeof item === "number" && Number.isFinite(item) && item > 0)
      .map((item) => round2(item))
      .slice(0, MAX_VISUAL_DASH_SEGMENTS);

  if (Array.isArray(value)) {
    return normalizeNumbers(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    return normalizeNumbers(trimmed.split(/[,\s，;；]+/).map((item) => Number(item)));
  }
  return [];
}

export function formatVisualDashArray(value: number[] | undefined): string {
  const normalized = normalizeVisualDashArray(value);
  return normalized.join(",");
}

export function normalizeVisualDashOffset(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return round2(value);
}

export function normalizeVisualMiterLimit(value: number | undefined, fallback = DEFAULT_VISUAL_MITER_LIMIT): number {
  const base = Number.isFinite(fallback) ? fallback : DEFAULT_VISUAL_MITER_LIMIT;
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : base;
  return round2(Math.min(Math.max(numeric, MIN_VISUAL_MITER_LIMIT), MAX_VISUAL_MITER_LIMIT));
}

export function normalizeVisualFillRule(
  value: string | undefined,
  fallback: VisualFillRule = DEFAULT_VISUAL_FILL_RULE
): VisualFillRule {
  if (typeof value === "string" && VISUAL_FILL_RULE_SET.has(value)) {
    return value as VisualFillRule;
  }
  return fallback;
}

export function normalizeVisualStylePresetPatch(patch: VisualStylePresetPatch): VisualStylePresetPatch {
  const normalized: VisualStylePresetPatch = {};
  if (patch.strokeWidth !== undefined) {
    normalized.strokeWidth = normalizeVisualStrokeWidth(patch.strokeWidth);
  }
  if (patch.strokeOpacity !== undefined) {
    normalized.strokeOpacity = normalizeVisualOpacity(patch.strokeOpacity);
  }
  if (patch.fillOpacity !== undefined) {
    normalized.fillOpacity = normalizeVisualOpacity(patch.fillOpacity);
  }
  if (patch.strokeLineCap !== undefined) {
    normalized.strokeLineCap = normalizeVisualLineCap(patch.strokeLineCap);
  }
  if (patch.strokeLineJoin !== undefined) {
    normalized.strokeLineJoin = normalizeVisualLineJoin(patch.strokeLineJoin);
  }
  if (patch.strokeDashArray !== undefined) {
    normalized.strokeDashArray = normalizeVisualDashArray(patch.strokeDashArray);
  }
  if (patch.strokeDashOffset !== undefined) {
    normalized.strokeDashOffset = normalizeVisualDashOffset(patch.strokeDashOffset);
  }
  if (patch.strokeMiterLimit !== undefined) {
    normalized.strokeMiterLimit = normalizeVisualMiterLimit(patch.strokeMiterLimit);
  }
  if (patch.fillRule !== undefined) {
    normalized.fillRule = normalizeVisualFillRule(patch.fillRule);
  }
  return normalized;
}

export const DEFAULT_VISUAL_ADVANCED_STYLE_PATCH: VisualStylePresetPatch = Object.freeze({
  strokeLineCap: "round",
  strokeLineJoin: "round",
  strokeDashArray: [],
  strokeDashOffset: 0,
  strokeMiterLimit: DEFAULT_VISUAL_MITER_LIMIT,
  fillRule: DEFAULT_VISUAL_FILL_RULE,
});

function definePreset(preset: VisualStylePreset): VisualStylePreset {
  return {
    ...preset,
    patch: normalizeVisualStylePresetPatch(preset.patch),
  };
}

export const VISUAL_STYLE_PRESETS: VisualStylePreset[] = [
  definePreset({
    id: "industrial-default",
    label: "工业默认",
    description: "通用稳定，适合大多数标签图形。",
    patch: {
      strokeWidth: DEFAULT_VISUAL_STROKE_WIDTH,
      strokeOpacity: DEFAULT_VISUAL_OPACITY,
      fillOpacity: 0.12,
      ...DEFAULT_VISUAL_ADVANCED_STYLE_PATCH,
    },
  }),
  definePreset({
    id: "warning-dashed",
    label: "警示虚线",
    description: "高辨识虚线轮廓，适合警示和分区边界。",
    patch: {
      strokeWidth: 1.4,
      strokeOpacity: 1,
      fillOpacity: 0.08,
      strokeLineCap: "butt",
      strokeLineJoin: "miter",
      strokeDashArray: [3, 1.5],
      strokeDashOffset: 0,
      strokeMiterLimit: 6,
      fillRule: "nonzero",
    },
  }),
  definePreset({
    id: "process-dotted",
    label: "流程点线",
    description: "圆角点线风格，适合流程节点或弱提示。",
    patch: {
      strokeWidth: 1.1,
      strokeOpacity: 1,
      fillOpacity: 0.06,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      strokeDashArray: [0.4, 1.3],
      strokeDashOffset: 0,
      strokeMiterLimit: 4,
      fillRule: "nonzero",
    },
  }),
  definePreset({
    id: "bold-outline",
    label: "重轮廓",
    description: "厚描边强化轮廓，适合远距离识别。",
    patch: {
      strokeWidth: 3.2,
      strokeOpacity: 1,
      fillOpacity: 0.04,
      strokeLineCap: "square",
      strokeLineJoin: "bevel",
      strokeDashArray: [],
      strokeDashOffset: 0,
      strokeMiterLimit: 2,
      fillRule: "evenodd",
    },
  }),
];

const VISUAL_STYLE_PRESET_MAP = new Map(VISUAL_STYLE_PRESETS.map((item) => [item.id, item]));

export function getVisualStylePreset(id: string | null | undefined): VisualStylePreset | null {
  if (!id) {
    return null;
  }
  return VISUAL_STYLE_PRESET_MAP.get(id) ?? null;
}

type HexRgb = { r: number; g: number; b: number };

function parseHexColor(value: string | undefined): HexRgb | null {
  const input = (value || "").trim();
  const short = /^#([0-9a-fA-F]{3})$/;
  const long = /^#([0-9a-fA-F]{6})$/;
  const shortMatch = short.exec(input);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("").map((item) => Number.parseInt(item + item, 16));
    return { r, g, b };
  }
  const longMatch = long.exec(input);
  if (longMatch) {
    const raw = longMatch[1];
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

export function toAlphaColor(value: string | undefined, opacity: number | undefined, fallback: string): string {
  const normalizedOpacity = normalizeVisualOpacity(opacity);
  if (normalizedOpacity >= 1) {
    const preferred = (value || "").trim();
    return preferred || fallback;
  }
  const base = parseHexColor(value) ?? parseHexColor(fallback);
  if (!base) {
    return fallback;
  }
  return `rgba(${base.r}, ${base.g}, ${base.b}, ${normalizedOpacity})`;
}

export function toShapeBorderWidthPx(strokeWidth: number | undefined): number {
  const normalized = normalizeVisualStrokeWidth(strokeWidth);
  return Math.max(0.8, round2(normalized * 0.72));
}
