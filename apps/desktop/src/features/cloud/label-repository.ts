import type { LabelDocument, LabelSummary, MeResponse } from "@label/api-contract";
import type { CloudLabelContentV1 } from "@label/template-schema";

import { AuthenticationRequiredError, CloudApiClient, CloudApiError, isNetworkOrServiceError } from "./api-client";
import type { CloudCacheStore } from "./cache";
import type {
  CachedCloudLabel,
  CloudConflictResolution,
  CreateLabelInput,
  LabelListResult,
  LabelRepository,
  ListLabelsInput,
  PendingSyncOperation,
  SyncResult,
  UpdateLabelInput,
} from "./types";

type CurrentUser = () => MeResponse | null;
type LabelIdChangedListener = (previousId: string, next: CachedCloudLabel) => void;
type PrepareContentForSync = (content: CloudLabelContentV1) => Promise<CloudLabelContentV1>;

function toCached(
  label: LabelSummary | LabelDocument,
  syncStatus: CachedCloudLabel["syncStatus"] = "synced"
): CachedCloudLabel {
  return {
    ...label,
    content: "content" in label ? label.content : null,
    syncStatus,
    lastSyncedAt: syncStatus === "synced" ? new Date().toISOString() : null,
  };
}

function createOperationId(): string {
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const SYNC_RETRY_BASE_DELAY_MS = 15_000;
const SYNC_RETRY_MAX_DELAY_MS = 30 * 60_000;

function nextSyncAttemptAt(attempts: number, now = Date.now()): string {
  const exponent = Math.min(Math.max(attempts, 0), 7);
  const delay = Math.min(SYNC_RETRY_BASE_DELAY_MS * 2 ** exponent, SYNC_RETRY_MAX_DELAY_MS);
  return new Date(now + delay).toISOString();
}

function createOfflineLabel(input: CreateLabelInput): CachedCloudLabel {
  const now = new Date().toISOString();
  return {
    id: `local-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    name: input.name,
    categoryId: null,
    content: input.content,
    schemaVersion: input.content.version,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    lastOpenedAt: null,
    syncStatus: "pending",
    lastSyncedAt: null,
  };
}

function hasStatus(label: CachedCloudLabel, requested: ListLabelsInput["status"]): boolean {
  if (!requested || requested === "active") return !label.deletedAt;
  return Boolean(label.deletedAt);
}

function sortCached(labels: CachedCloudLabel[], sort: ListLabelsInput["sort"]): CachedCloudLabel[] {
  return [...labels].sort((left, right) => {
    if (sort === "name_asc") return left.name.localeCompare(right.name, "zh-CN");
    if (sort === "name_desc") return right.name.localeCompare(left.name, "zh-CN");
    const order = left.updatedAt.localeCompare(right.updatedAt);
    return sort === "updated_asc" ? order : -order;
  });
}

/**
 * Cloud is authoritative whenever it is reachable. Cache writes happen before
 * an offline queue entry is exposed, so a completed editor save always has a
 * recoverable local representation.
 */
export class CloudLabelRepository implements LabelRepository {
  private readonly idChangedListeners = new Set<LabelIdChangedListener>();

  constructor(
    private readonly api: CloudApiClient,
    private readonly cache: CloudCacheStore,
    private readonly currentUser: CurrentUser,
    private readonly prepareContentForSync: PrepareContentForSync = async (content) => content
  ) {}

  onLabelIdChanged(listener: LabelIdChangedListener): () => void {
    this.idChangedListeners.add(listener);
    return () => this.idChangedListeners.delete(listener);
  }

  async list(input: ListLabelsInput): Promise<LabelListResult> {
    const user = this.requireUser();
    try {
      // A fresh device has no cached documents. Ask the authenticated list endpoint for
      // content so thumbnails can be rendered immediately without opening every label.
      const result = await this.api.listLabels({
        status: "active",
        sort: "updated_desc",
        limit: 50,
        ...input,
        includeContent: true,
      });
      const summaries = result.items.map((item) => toCached(item));
      const items = await Promise.all(
        summaries.map(async (item) => {
          const cached = await this.cache.getLabel(user.id, item.id);
          // A pending local edit must remain visible until it has been synced or
          // resolved. Otherwise prefer the freshly listed cloud document: using
          // an older synchronized cache here leaves the thumbnail stale after a
          // save (or after another device changes the label).
          if (cached?.content && cached.syncStatus !== "synced") {
            return { ...item, content: cached.content, syncStatus: cached.syncStatus, lastSyncedAt: cached.lastSyncedAt };
          }
          return item.content ? item : cached?.content
            ? { ...item, content: cached.content, syncStatus: cached.syncStatus, lastSyncedAt: cached.lastSyncedAt }
            : item;
        })
      );
      await Promise.all(items.map((item) => this.cache.putLabel(user.id, item)));
      return { items, nextCursor: result.nextCursor ?? null, source: "cloud" };
    } catch (error) {
      if (!isNetworkOrServiceError(error)) throw error;
      const query = input.query?.trim().toLocaleLowerCase("zh-CN") ?? "";
      const cached = (await this.cache.listLabels(user.id)).filter(
        (item) => hasStatus(item, input.status) && (!query || item.name.toLocaleLowerCase("zh-CN").includes(query))
      );
      return { items: sortCached(cached, input.sort), nextCursor: null, source: "cache" };
    }
  }

  async get(id: string): Promise<CachedCloudLabel> {
    const user = this.requireUser();
    try {
      const label = toCached(await this.api.getLabel(id));
      await this.cache.putLabel(user.id, label);
      return label;
    } catch (error) {
      if (!isNetworkOrServiceError(error)) throw error;
      const cached = await this.cache.getLabel(user.id, id);
      if (cached) return cached;
      throw new Error("此标签尚未缓存，需要联网后打开。");
    }
  }

  async create(input: CreateLabelInput): Promise<CachedCloudLabel> {
    const user = this.requireUser();
    try {
      const label = toCached(await this.api.createLabel(input));
      await this.cache.putLabel(user.id, label);
      return label;
    } catch (error) {
      if (!isNetworkOrServiceError(error)) throw error;
      const local = createOfflineLabel(input);
      await this.cache.putLabel(user.id, local);
      await this.cache.enqueue({
        id: createOperationId(),
        userId: user.id,
        labelId: local.id,
        kind: "create",
        payload: input,
        expectedRevision: null,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      return local;
    }
  }

  async update(id: string, input: UpdateLabelInput): Promise<CachedCloudLabel> {
    const user = this.requireUser();
    if (id.startsWith("local-")) {
      const existing = await this.cache.getLabel(user.id, id);
      if (!existing) throw new Error("离线标签缓存不存在。");
      const pending: CachedCloudLabel = {
        ...existing,
        content: input.content,
        schemaVersion: input.content.version,
        updatedAt: new Date().toISOString(),
        syncStatus: "pending",
        lastSyncedAt: null,
      };
      await this.cache.putLabel(user.id, pending);
      const queuedCreate = (await this.cache.listQueue(user.id)).find(
        (operation): operation is Extract<PendingSyncOperation, { kind: "create" }> =>
          operation.kind === "create" && operation.labelId === id
      );
      if (queuedCreate) {
        await this.cache.updateQueue({ ...queuedCreate, payload: { ...queuedCreate.payload, content: input.content } });
      }
      return pending;
    }
    try {
      const label = toCached(await this.api.updateLabel(id, input));
      await this.cache.putLabel(user.id, label);
      return label;
    } catch (error) {
      if (!isNetworkOrServiceError(error)) throw error;
      const existing = await this.cache.getLabel(user.id, id);
      if (!existing) throw error;
      const pending: CachedCloudLabel = {
        ...existing,
        content: input.content,
        schemaVersion: input.content.version,
        updatedAt: new Date().toISOString(),
        syncStatus: "pending",
        lastSyncedAt: null,
      };
      await this.cache.putLabel(user.id, pending);
      await this.cache.enqueue({
        id: createOperationId(),
        userId: user.id,
        labelId: id,
        kind: "update",
        payload: input,
        expectedRevision: input.expectedRevision,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      return pending;
    }
  }

  async rename(id: string, name: string, expectedRevision?: number): Promise<CachedCloudLabel> {
    const user = this.requireUser();
    const existing = await this.cache.getLabel(user.id, id);
    if (id.startsWith("local-")) {
      if (!existing) throw new Error("离线标签缓存不存在。");
      const pending = { ...existing, name: name.trim(), syncStatus: "pending" as const, lastSyncedAt: null };
      await this.cache.putLabel(user.id, pending);
      const queuedCreate = (await this.cache.listQueue(user.id)).find(
        (operation): operation is Extract<PendingSyncOperation, { kind: "create" }> =>
          operation.kind === "create" && operation.labelId === id
      );
      if (queuedCreate) {
        await this.cache.updateQueue({ ...queuedCreate, payload: { ...queuedCreate.payload, name: pending.name } });
      }
      return pending;
    }
    const revision = expectedRevision ?? existing?.revision;
    if (revision === undefined) throw new Error("缺少云标签修订号，无法安全重命名。");
    const input = { name: name.trim(), expectedRevision: revision };
    try {
      const renamed = await this.api.renameLabel(id, input);
      const label = { ...toCached(renamed), content: existing?.content ?? null };
      await this.cache.putLabel(user.id, label);
      return label;
    } catch (error) {
      if (!isNetworkOrServiceError(error)) throw error;
      if (!existing) throw error;
      const pending = { ...existing, name: input.name, syncStatus: "pending" as const, lastSyncedAt: null };
      await this.cache.putLabel(user.id, pending);
      await this.cache.enqueue({
        id: createOperationId(), userId: user.id, labelId: id, kind: "rename", payload: input,
        expectedRevision: revision, createdAt: new Date().toISOString(), attempts: 0,
      });
      return pending;
    }
  }

  async duplicate(id: string, name: string): Promise<CachedCloudLabel> {
    const user = this.requireUser();
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error("复制标签必须提供名称。");
    try {
      const duplicated = toCached(await this.api.duplicateLabel(id, normalizedName));
      await this.cache.putLabel(user.id, duplicated);
      return duplicated;
    } catch (error) {
      if (!isNetworkOrServiceError(error)) throw error;
      const source = await this.cache.getLabel(user.id, id);
      if (!source?.content) throw error;
      return this.create({ name: normalizedName, content: source.content });
    }
  }

  async moveToTrash(id: string, expectedRevision?: number): Promise<void> {
    await this.applyVoidOperation(id, "trash", expectedRevision);
  }

  async restore(id: string): Promise<void> {
    await this.applyVoidOperation(id, "restore");
  }

  async permanentlyDelete(id: string): Promise<void> {
    await this.applyVoidOperation(id, "permanent-delete");
  }

  async createFromOfficialTemplate(templateId: string, name?: string): Promise<CachedCloudLabel> {
    const user = this.requireUser();
    const label = toCached(await this.api.createLabelFromOfficialTemplate(templateId, name));
    await this.cache.putLabel(user.id, label);
    return label;
  }

  /** Resolves an explicitly surfaced revision conflict; it never runs automatically. */
  async resolveConflict(id: string, resolution: CloudConflictResolution): Promise<CachedCloudLabel | null> {
    const user = this.requireUser();
    const local = await this.cache.getLabel(user.id, id);
    if (!local || local.syncStatus !== "conflict") throw new Error("该标签当前没有待处理的云端冲突。");

    const cloud = toCached(await this.api.getLabel(id));
    if (resolution === "discard-local") {
      await this.cache.putLabel(user.id, cloud);
      return cloud;
    }
    if (!local.content) throw new Error("本地冲突副本缺少标签内容，无法继续处理。");

    if (resolution === "overwrite") {
      const updated = toCached(await this.api.updateLabel(id, { expectedRevision: cloud.revision, content: local.content }));
      const renamed = local.name === updated.name
        ? updated
        : { ...toCached(await this.api.renameLabel(id, { name: local.name, expectedRevision: updated.revision })), content: updated.content };
      await this.cache.putLabel(user.id, renamed);
      return renamed;
    }

    const created = toCached(await this.api.createLabel({
      name: `${local.name}（冲突副本）`,
      content: local.content,
    }));
    await this.cache.putLabel(user.id, cloud);
    await this.cache.putLabel(user.id, created);
    return created;
  }

  async syncPending(): Promise<SyncResult> {
    const user = this.requireUser();
    const operations = await this.cache.listQueue(user.id);
    const result: SyncResult = { synced: 0, conflicts: 0, deferred: 0 };

    for (const operation of operations) {
      if (operation.nextAttemptAt && Date.parse(operation.nextAttemptAt) > Date.now()) {
        result.deferred += 1;
        break;
      }
      const marked = await this.cache.getLabel(user.id, operation.labelId);
      if (marked) await this.cache.putLabel(user.id, { ...marked, syncStatus: "syncing" });
      try {
        await this.syncOperation(operation);
        await this.cache.removeQueue(user.id, operation.id);
        result.synced += 1;
      } catch (error) {
        if (error instanceof CloudApiError && error.code === "REVISION_CONFLICT") {
          if (marked) await this.cache.putLabel(user.id, { ...marked, syncStatus: "conflict" });
          await this.cache.removeQueue(user.id, operation.id);
          result.conflicts += 1;
          continue;
        }
        if (isNetworkOrServiceError(error)) {
          if (marked) await this.cache.putLabel(user.id, { ...marked, syncStatus: "pending" });
          const attempts = operation.attempts + 1;
          await this.cache.updateQueue({ ...operation, attempts, nextAttemptAt: nextSyncAttemptAt(attempts) });
          result.deferred += 1;
          break;
        }
        if (marked) await this.cache.putLabel(user.id, { ...marked, syncStatus: "failed" });
        const attempts = operation.attempts + 1;
        await this.cache.updateQueue({ ...operation, attempts, nextAttemptAt: nextSyncAttemptAt(attempts) });
        result.deferred += 1;
      }
    }
    return result;
  }

  private async applyVoidOperation(
    id: string,
    kind: "trash" | "restore" | "permanent-delete",
    expectedRevision?: number
  ): Promise<void> {
    const user = this.requireUser();
    try {
      if (kind === "trash") await this.api.moveToTrash(id);
      if (kind === "restore") await this.api.restoreLabel(id);
      if (kind === "permanent-delete") await this.api.permanentlyDeleteLabel(id);
      if (kind === "permanent-delete") await this.cache.removeLabel(user.id, id);
      else {
        const existing = await this.cache.getLabel(user.id, id);
        if (existing) {
          await this.cache.putLabel(user.id, {
            ...existing,
            deletedAt: kind === "trash" ? new Date().toISOString() : null,
            syncStatus: "synced",
            lastSyncedAt: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      if (!isNetworkOrServiceError(error)) throw error;
      const existing = await this.cache.getLabel(user.id, id);
      if (kind === "permanent-delete") await this.cache.removeLabel(user.id, id);
      else if (existing) {
        await this.cache.putLabel(user.id, {
          ...existing,
          deletedAt: kind === "trash" ? new Date().toISOString() : null,
          syncStatus: "pending",
          lastSyncedAt: null,
        });
      }
      await this.cache.enqueue({
        id: createOperationId(), userId: user.id, labelId: id, kind, payload: {}, expectedRevision: expectedRevision ?? null,
        createdAt: new Date().toISOString(), attempts: 0,
      });
    }
  }

  private async syncOperation(operation: PendingSyncOperation): Promise<void> {
    const user = this.requireUser();
    if (operation.kind === "create") {
      const created = toCached(await this.api.createLabel({ ...operation.payload, content: await this.prepareContentForSync(operation.payload.content) }));
      await this.cache.replaceLabelId(user.id, operation.labelId, created);
      this.idChangedListeners.forEach((listener) => listener(operation.labelId, created));
      return;
    }
    if (operation.kind === "update") {
      const updated = toCached(await this.api.updateLabel(operation.labelId, { ...operation.payload, content: await this.prepareContentForSync(operation.payload.content) }));
      await this.cache.putLabel(user.id, updated);
      return;
    }
    if (operation.kind === "rename") {
      const current = await this.cache.getLabel(user.id, operation.labelId);
      const renamed = { ...toCached(await this.api.renameLabel(operation.labelId, operation.payload)), content: current?.content ?? null };
      await this.cache.putLabel(user.id, renamed);
      return;
    }
    if (operation.kind === "trash") return this.api.moveToTrash(operation.labelId);
    if (operation.kind === "restore") return this.api.restoreLabel(operation.labelId);
    return this.api.permanentlyDeleteLabel(operation.labelId);
  }

  private requireUser(): MeResponse {
    const user = this.currentUser();
    if (!user) throw new AuthenticationRequiredError();
    return user;
  }
}
