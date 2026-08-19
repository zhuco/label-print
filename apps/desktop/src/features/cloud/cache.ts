import { invoke } from "@tauri-apps/api/core";

import type { CachedCloudLabel, PendingSyncOperation } from "./types";

export interface CloudCacheStore {
  listLabels(userId: string): Promise<CachedCloudLabel[]>;
  getLabel(userId: string, labelId: string): Promise<CachedCloudLabel | null>;
  putLabel(userId: string, label: CachedCloudLabel): Promise<void>;
  removeLabel(userId: string, labelId: string): Promise<void>;
  replaceLabelId(userId: string, previousId: string, label: CachedCloudLabel): Promise<void>;
  clearUser(userId: string): Promise<void>;
  enqueue(operation: PendingSyncOperation): Promise<void>;
  listQueue(userId: string): Promise<PendingSyncOperation[]>;
  updateQueue(operation: PendingSyncOperation): Promise<void>;
  removeQueue(userId: string, operationId: string): Promise<void>;
}

function cloneLabel(label: CachedCloudLabel): CachedCloudLabel {
  return {
    ...label,
    content: structuredClone(label.content),
  };
}

function cloneOperation(operation: PendingSyncOperation): PendingSyncOperation {
  return structuredClone(operation);
}

/** In-memory web fallback. Data is isolated by cloud user ID and is never localStorage-backed. */
export class MemoryCloudCacheStore implements CloudCacheStore {
  private readonly labels = new Map<string, Map<string, CachedCloudLabel>>();
  private readonly queue = new Map<string, PendingSyncOperation[]>();

  async listLabels(userId: string): Promise<CachedCloudLabel[]> {
    return Array.from(this.labels.get(userId)?.values() ?? []).map(cloneLabel);
  }

  async getLabel(userId: string, labelId: string): Promise<CachedCloudLabel | null> {
    const label = this.labels.get(userId)?.get(labelId);
    return label ? cloneLabel(label) : null;
  }

  async putLabel(userId: string, label: CachedCloudLabel): Promise<void> {
    const userLabels = this.labels.get(userId) ?? new Map<string, CachedCloudLabel>();
    userLabels.set(label.id, cloneLabel(label));
    this.labels.set(userId, userLabels);
  }

  async removeLabel(userId: string, labelId: string): Promise<void> {
    this.labels.get(userId)?.delete(labelId);
  }

  async replaceLabelId(userId: string, previousId: string, label: CachedCloudLabel): Promise<void> {
    const userLabels = this.labels.get(userId) ?? new Map<string, CachedCloudLabel>();
    userLabels.delete(previousId);
    userLabels.set(label.id, cloneLabel(label));
    this.labels.set(userId, userLabels);
  }

  async clearUser(userId: string): Promise<void> {
    this.labels.delete(userId);
    this.queue.delete(userId);
  }

  async enqueue(operation: PendingSyncOperation): Promise<void> {
    const queue = this.queue.get(operation.userId) ?? [];
    queue.push(cloneOperation(operation));
    this.queue.set(operation.userId, queue);
  }

  async listQueue(userId: string): Promise<PendingSyncOperation[]> {
    return (this.queue.get(userId) ?? []).map(cloneOperation);
  }

  async updateQueue(operation: PendingSyncOperation): Promise<void> {
    const queue = this.queue.get(operation.userId) ?? [];
    const index = queue.findIndex((item) => item.id === operation.id);
    if (index >= 0) queue[index] = cloneOperation(operation);
    this.queue.set(operation.userId, queue);
  }

  async removeQueue(userId: string, operationId: string): Promise<void> {
    this.queue.set(
      userId,
      (this.queue.get(userId) ?? []).filter((item) => item.id !== operationId)
    );
  }
}

/**
 * A narrow Tauri/SQLite port. Native commands can be added without changing
 * repository semantics; browser and unsupported native builds safely stay in memory.
 */
export class TauriCloudCacheStore implements CloudCacheStore {
  constructor(private readonly fallback: CloudCacheStore = new MemoryCloudCacheStore()) {}

  async listLabels(userId: string): Promise<CachedCloudLabel[]> {
    return this.callOrFallback("cloud_cache_list_labels", { userId }, () => this.fallback.listLabels(userId));
  }

  async getLabel(userId: string, labelId: string): Promise<CachedCloudLabel | null> {
    return this.callOrFallback("cloud_cache_get_label", { userId, labelId }, () => this.fallback.getLabel(userId, labelId));
  }

  async putLabel(userId: string, label: CachedCloudLabel): Promise<void> {
    await this.callOrFallback("cloud_cache_put_label", { userId, label }, () => this.fallback.putLabel(userId, label));
  }

  async removeLabel(userId: string, labelId: string): Promise<void> {
    await this.callOrFallback("cloud_cache_remove_label", { userId, labelId }, () => this.fallback.removeLabel(userId, labelId));
  }

  async replaceLabelId(userId: string, previousId: string, label: CachedCloudLabel): Promise<void> {
    await this.callOrFallback("cloud_cache_replace_label_id", { userId, previousId, label }, () =>
      this.fallback.replaceLabelId(userId, previousId, label)
    );
  }

  async clearUser(userId: string): Promise<void> {
    await this.callOrFallback("cloud_cache_clear_user", { userId }, () => this.fallback.clearUser(userId));
  }

  async enqueue(operation: PendingSyncOperation): Promise<void> {
    await this.callOrFallback("cloud_sync_enqueue", { operation }, () => this.fallback.enqueue(operation));
  }

  async listQueue(userId: string): Promise<PendingSyncOperation[]> {
    return this.callOrFallback("cloud_sync_list", { userId }, () => this.fallback.listQueue(userId));
  }

  async updateQueue(operation: PendingSyncOperation): Promise<void> {
    await this.callOrFallback("cloud_sync_update", { operation }, () => this.fallback.updateQueue(operation));
  }

  async removeQueue(userId: string, operationId: string): Promise<void> {
    await this.callOrFallback("cloud_sync_remove", { userId, operationId }, () =>
      this.fallback.removeQueue(userId, operationId)
    );
  }

  private async callOrFallback<T>(
    command: string,
    args: Record<string, unknown>,
    fallback: () => Promise<T>
  ): Promise<T> {
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

export function createCloudCacheStore(): CloudCacheStore {
  return isTauriRuntime() ? new TauriCloudCacheStore() : new MemoryCloudCacheStore();
}
