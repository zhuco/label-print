import type { SystemFontDto } from "../../../services/ipc/fonts";

export type FontOption = {
  value: string;
  label: string;
};

type FontCandidate = {
  family?: string | null;
  fullName?: string | null;
  postscriptName?: string | null;
  aliases?: string[];
};

const DEFAULT_FONT_FAMILIES = [
  "Microsoft YaHei",
  "SimHei",
  "SimSun",
  "KaiTi",
  "FangSong",
  "Arial",
  "Consolas",
];

const CHINESE_NAME_REGEX = /[\u3400-\u9fff]/u;

export const DEFAULT_FONT_OPTIONS: FontOption[] = DEFAULT_FONT_FAMILIES.map((family) => ({
  value: family,
  label: family,
}));

export function buildFontOptions(
  systemFonts: SystemFontDto[],
  localFonts: Array<{ family?: string; fullName?: string; postscriptName?: string }>
): FontOption[] {
  const candidates: FontCandidate[] = [
    ...systemFonts.map((font) => ({
      family: font.family,
      aliases: font.aliases,
      postscriptName: font.postscriptName ?? undefined,
    })),
    ...localFonts.map((font) => ({
      family: font.family,
      fullName: font.fullName,
      postscriptName: font.postscriptName,
    })),
    ...DEFAULT_FONT_OPTIONS.map((font) => ({ family: font.value })),
  ];

  const map = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    const names = uniqueNames([
      candidate.family,
      candidate.fullName,
      candidate.postscriptName,
      ...(candidate.aliases ?? []),
    ]);
    if (names.length === 0) {
      continue;
    }

    const preferredFamily = normalizeName(candidate.family);
    const value = preferredFamily ?? pickPreferredValue(names);
    const key = value.toLocaleLowerCase("en-US");
    const merged = map.get(key) ?? new Set<string>();

    merged.add(value);
    for (const name of names) {
      merged.add(name);
    }
    map.set(key, merged);
  }

  const rows = Array.from(map.values())
    .map((names) => {
      const allNames = Array.from(names);
      const value = pickPreferredValue(allNames);
      const label = pickDisplayName(allNames);
      return { value, label };
    })
    .filter((font) => font.value.trim().length > 0)
    .sort((left, right) => {
      const labelCompare = left.label.localeCompare(right.label, "zh-CN", { sensitivity: "base" });
      if (labelCompare !== 0) {
        return labelCompare;
      }
      const leftAscii = isAscii(left.value);
      const rightAscii = isAscii(right.value);
      if (leftAscii !== rightAscii) {
        return leftAscii ? -1 : 1;
      }
      return left.value.localeCompare(right.value, "en-US", { sensitivity: "base" });
    });

  const deduped = dedupeByLabel(rows);
  return deduped.length > 0 ? deduped : DEFAULT_FONT_OPTIONS;
}

export function withCurrentFont(fonts: FontOption[], currentValue: string): FontOption[] {
  const normalized = normalizeName(currentValue);
  if (!normalized) {
    return fonts;
  }

  if (fonts.some((font) => font.value === normalized)) {
    return fonts;
  }
  return [{ value: normalized, label: normalized }, ...fonts];
}

function uniqueNames(values: Array<string | null | undefined>): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const raw of values) {
    const normalized = normalizeName(raw);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLocaleLowerCase("en-US");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function pickPreferredValue(names: string[]): string {
  const familyLike = names.find((name) => !/[- ](regular|bold|italic|light)$/i.test(name));
  if (familyLike) {
    return familyLike;
  }
  return names[0] ?? DEFAULT_FONT_OPTIONS[0].value;
}

function pickDisplayName(names: string[]): string {
  const chinese = names.find((name) => CHINESE_NAME_REGEX.test(name));
  if (chinese) {
    return chinese;
  }
  return names[0] ?? DEFAULT_FONT_OPTIONS[0].label;
}

function dedupeByLabel(fonts: FontOption[]): FontOption[] {
  const output: FontOption[] = [];
  const seen = new Set<string>();

  for (const font of fonts) {
    const key = font.label.toLocaleLowerCase("zh-CN");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(font);
  }
  return output;
}

function isAscii(value: string): boolean {
  return /^[\x00-\x7f]+$/.test(value);
}

function normalizeName(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}
