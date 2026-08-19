import { invoke } from "@tauri-apps/api/core";

/** User-scoped asset data cache. This is deliberately separate from tokens and labels. */
export interface CloudAssetCache {
  get(userId: string, assetId: string): Promise<string | null>;
  put(userId: string, assetId: string, dataUrl: string): Promise<void>;
  clearUser(userId: string): Promise<void>;
}

export class MemoryCloudAssetCache implements CloudAssetCache {
  private readonly entries = new Map<string, string>();

  async get(userId: string, assetId: string): Promise<string | null> {
    return this.entries.get(`${userId}:${assetId}`) ?? null;
  }

  async put(userId: string, assetId: string, dataUrl: string): Promise<void> {
    this.entries.set(`${userId}:${assetId}`, dataUrl);
  }

  async clearUser(userId: string): Promise<void> {
    const prefix = `${userId}:`;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }
}

/** SQLite-backed cache in Tauri, with an in-memory fallback for browser tests and previews. */
export class TauriCloudAssetCache implements CloudAssetCache {
  constructor(private readonly fallback: CloudAssetCache = new MemoryCloudAssetCache()) {}

  async get(userId: string, assetId: string): Promise<string | null> {
    return this.callOrFallback("cloud_asset_cache_get", { userId, assetId }, () => this.fallback.get(userId, assetId));
  }

  async put(userId: string, assetId: string, dataUrl: string): Promise<void> {
    await this.callOrFallback("cloud_asset_cache_put", { userId, assetId, dataUrl }, () => this.fallback.put(userId, assetId, dataUrl));
  }

  async clearUser(userId: string): Promise<void> {
    await this.callOrFallback("cloud_asset_cache_clear_user", { userId }, () => this.fallback.clearUser(userId));
  }

  private async callOrFallback<T>(command: string, args: Record<string, unknown>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await invoke<T>(command, args);
    } catch {
      return fallback();
    }
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createCloudAssetCache(): CloudAssetCache {
  return isTauriRuntime() ? new TauriCloudAssetCache() : new MemoryCloudAssetCache();
}
