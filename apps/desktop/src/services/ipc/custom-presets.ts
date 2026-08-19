import { invoke as tauriInvoke } from "@tauri-apps/api/core";

import type { CustomPreset } from "../../features/editor/core/custom-presets";

type TauriWindow = {
  __TAURI__?: {
    core?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
  };
};

type CustomPresetDto = Omit<CustomPreset, "elementCount">;

function getInvoke() {
  const maybeWindow = globalThis as typeof globalThis & TauriWindow;
  return maybeWindow.__TAURI__?.core?.invoke ?? tauriInvoke;
}

function isTauriUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tauri|invoke|not available|not found|window.__TAURI__/i.test(message);
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await getInvoke()<T>(command, args);
  } catch (error) {
    if (isTauriUnavailable(error)) return null;
    throw error;
  }
}

function toPreset(input: CustomPresetDto): CustomPreset | null {
  if (!input || typeof input !== "object" || !Array.isArray(input.elements)) return null;
  if (!input.id?.trim() || !input.name?.trim() || !input.category?.trim() || input.schemaVersion !== 1) return null;
  if (!Number.isFinite(input.createdAt) || !Number.isFinite(input.updatedAt) || input.elements.length === 0) return null;
  return {
    ...input,
    elementCount: input.elements.length,
  };
}

export async function listDesktopCustomPresets(): Promise<CustomPreset[] | null> {
  const result = await invokeDesktop<CustomPresetDto[]>("custom_presets_list");
  if (result === null) return null;
  return result.map(toPreset).filter((preset): preset is CustomPreset => preset !== null);
}

export async function replaceDesktopCustomPresets(presets: CustomPreset[]): Promise<boolean> {
  const result = await invokeDesktop<void>("custom_presets_replace_all", {
    presets: presets.map(({ elementCount: _elementCount, ...preset }) => preset),
  });
  return result !== null;
}

/** Migrates the legacy browser store into SQLite once, without losing it as a fallback backup. */
export async function loadOrMigrateDesktopCustomPresets(legacy: CustomPreset[]): Promise<CustomPreset[] | null> {
  const persisted = await listDesktopCustomPresets();
  if (persisted === null || persisted.length > 0 || legacy.length === 0) return persisted;
  const migrated = await replaceDesktopCustomPresets(legacy);
  return migrated ? legacy : persisted;
}
