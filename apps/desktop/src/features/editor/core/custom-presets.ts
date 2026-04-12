import type { EditorElement } from "./types";

const CUSTOM_PRESET_STORAGE_KEY = "label-print.custom-presets.v1";
const CUSTOM_PRESET_LIMIT = 200;

export type CustomPreset = {
  id: string;
  name: string;
  category: string;
  elements: EditorElement[];
  elementCount: number;
  createdAt: number;
  updatedAt: number;
};

type CustomPresetRecord = {
  id: string;
  name: string;
  category: string;
  elements: EditorElement[];
  createdAt: number;
  updatedAt: number;
};

export function readCustomPresets(): CustomPreset[] {
  if (typeof localStorage === "undefined") {
    return [];
  }

  const raw = localStorage.getItem(CUSTOM_PRESET_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed
      .map((item) => normalizeCustomPresetRecord(item))
      .filter((item): item is CustomPreset => item !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt);
    return normalized.slice(0, CUSTOM_PRESET_LIMIT);
  } catch {
    return [];
  }
}

export function writeCustomPresets(presets: CustomPreset[]) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    const payload: CustomPresetRecord[] = presets.slice(0, CUSTOM_PRESET_LIMIT).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      elements: item.elements,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
    localStorage.setItem(CUSTOM_PRESET_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Keep editor usable even if persistence fails.
  }
}

function normalizeCustomPresetRecord(input: unknown): CustomPreset | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const row = input as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const category = typeof row.category === "string" ? row.category.trim() : "";
  const elements = Array.isArray(row.elements) ? (row.elements as EditorElement[]) : [];
  const createdAt = Number(row.createdAt);
  const updatedAt = Number(row.updatedAt);
  if (!id || !name || !category || elements.length === 0) {
    return null;
  }
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
    return null;
  }
  return {
    id,
    name,
    category,
    elements,
    elementCount: elements.length,
    createdAt,
    updatedAt,
  };
}
