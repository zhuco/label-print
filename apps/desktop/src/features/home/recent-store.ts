import { invoke } from "@tauri-apps/api/core";

import type { TemplateSnapshot } from "../editor/core/template-snapshot";

export type RecentTemplateSource = "local" | "cloud";

export type RecentTemplateItem = {
  id: string;
  fileName: string;
  source: RecentTemplateSource;
  filePath?: string | null;
  cloudLabelId?: string | null;
  saved: true;
  openedAt: number;
  snapshot: TemplateSnapshot;
};

export interface RecentTemplateStore {
  list(): Promise<RecentTemplateItem[]>;
  replaceAll(items: RecentTemplateItem[]): Promise<void>;
}

/** Browser/preview fallback deliberately has no durable storage for complete label snapshots. */
export class MemoryRecentTemplateStore implements RecentTemplateStore {
  private items: RecentTemplateItem[] = [];

  async list(): Promise<RecentTemplateItem[]> {
    return structuredClone(this.items);
  }

  async replaceAll(items: RecentTemplateItem[]): Promise<void> {
    this.items = structuredClone(items);
  }
}

/** Production desktop storage path backed by the app's SQLite database. */
export class TauriRecentTemplateStore implements RecentTemplateStore {
  constructor(private readonly fallback: RecentTemplateStore = new MemoryRecentTemplateStore()) {}

  async list(): Promise<RecentTemplateItem[]> {
    return this.callOrFallback("recent_templates_list", {}, () => this.fallback.list());
  }

  async replaceAll(items: RecentTemplateItem[]): Promise<void> {
    await this.callOrFallback("recent_templates_replace_all", { items }, () => this.fallback.replaceAll(items));
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

export function createRecentTemplateStore(): RecentTemplateStore {
  return isTauriRuntime() ? new TauriRecentTemplateStore() : new MemoryRecentTemplateStore();
}
