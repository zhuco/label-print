import type { CloudLabelContentV1 } from "@label/template-schema";
import { describe, expect, it, vi } from "vitest";

import { CloudApiClient } from "../api-client";
import { MemoryCloudCacheStore } from "../cache";
import { CloudLabelRepository } from "../label-repository";

const content: CloudLabelContentV1 = {
  format: "label-print-cloud-document",
  version: 1,
  unit: "mm",
  canvas: { widthMm: 40, heightMm: 30 },
  elements: [],
};

const user = {
  id: "user-a",
  displayName: "甲",
  plan: "free" as const,
  planExpiresAt: null,
  labelUsage: { used: 0, limit: 50, canCreate: true },
};

describe("CloudLabelRepository", () => {
  it("loads document content with the cloud list so a fresh device can render thumbnails", async () => {
    const remote = {
      id: "label-preview", name: "浜戠缂╃暐鍥?", content, schemaVersion: 1, revision: 1,
      createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z", deletedAt: null, lastOpenedAt: null,
    };
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toContain("includeContent=true");
      return new Response(JSON.stringify({ items: [remote], nextCursor: null }), { status: 200 });
    });
    const cache = new MemoryCloudCacheStore();
    const repository = new CloudLabelRepository(
      new CloudApiClient({ baseUrl: "https://cloud.example.test", fetcher, getAccessToken: () => "token" }),
      cache,
      () => user
    );

    const result = await repository.list({ status: "active" });

    expect(result.items[0]?.content).toEqual(content);
    expect((await cache.getLabel("user-a", "label-preview"))?.content).toEqual(content);
  });

  it("replaces synchronized cached content with the latest list document for refreshed thumbnails", async () => {
    const staleContent = { ...content, canvas: { widthMm: 30, heightMm: 20 } };
    const freshContent = { ...content, canvas: { widthMm: 60, heightMm: 40 } };
    const remote = {
      id: "label-preview", name: "Updated", content: freshContent, schemaVersion: 1, revision: 2,
      createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z", deletedAt: null, lastOpenedAt: null,
    };
    const cache = new MemoryCloudCacheStore();
    await cache.putLabel("user-a", {
      ...remote, content: staleContent, revision: 1, syncStatus: "synced", lastSyncedAt: "2026-08-04T00:00:00.000Z",
    });
    const client = new CloudApiClient({
      baseUrl: "https://cloud.example.test",
      fetcher: async () => new Response(JSON.stringify({ items: [remote], nextCursor: null }), { status: 200 }),
      getAccessToken: () => "token",
    });
    const repository = new CloudLabelRepository(client, cache, () => user);

    const result = await repository.list({ status: "active" });

    expect(result.items[0]?.content).toEqual(freshContent);
    expect((await cache.getLabel("user-a", "label-preview"))?.content).toEqual(freshContent);
  });

  it("writes an offline create to the user-isolated cache and sync queue", async () => {
    const client = new CloudApiClient({
      baseUrl: "https://cloud.example.test",
      fetcher: async () => {
        throw new TypeError("network unavailable");
      },
      getAccessToken: () => "token",
    });
    const cache = new MemoryCloudCacheStore();
    const repository = new CloudLabelRepository(client, cache, () => user);

    const label = await repository.create({ name: "离线标签", content });

    expect(label.id).toMatch(/^local-/);
    expect(label.syncStatus).toBe("pending");
    expect((await cache.listLabels("user-a"))[0]?.name).toBe("离线标签");
    expect(await cache.listLabels("user-b")).toEqual([]);
    expect((await cache.listQueue("user-a"))[0]?.kind).toBe("create");
  });

  it("persists an exponential retry deadline and does not hammer an unavailable API", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network unavailable");
    });
    const client = new CloudApiClient({
      baseUrl: "https://cloud.example.test",
      fetcher,
      getAccessToken: () => "token",
    });
    const cache = new MemoryCloudCacheStore();
    const repository = new CloudLabelRepository(client, cache, () => user);
    await repository.create({ name: "等待重试", content });

    expect(await repository.syncPending()).toMatchObject({ synced: 0, deferred: 1 });
    const queued = (await cache.listQueue("user-a"))[0];
    expect(queued).toMatchObject({ attempts: 1 });
    expect(Date.parse(queued?.nextAttemptAt ?? "")).toBeGreaterThan(Date.now());

    await repository.syncPending();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("marks revision conflicts without silently overwriting cached content", async () => {
    const cache = new MemoryCloudCacheStore();
    const client = new CloudApiClient({
      baseUrl: "https://cloud.example.test",
      fetcher: async () => new Response(JSON.stringify({ error: { code: "REVISION_CONFLICT" } }), { status: 409 }),
      getAccessToken: () => "token",
    });
    const repository = new CloudLabelRepository(client, cache, () => user);
    await cache.putLabel("user-a", {
      id: "label-a",
      name: "冲突标签",
      content,
      schemaVersion: 1,
      revision: 2,
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z",
      deletedAt: null,
      lastOpenedAt: null,
      syncStatus: "pending",
      lastSyncedAt: null,
    });
    await cache.enqueue({
      id: "operation-a",
      userId: "user-a",
      labelId: "label-a",
      kind: "update",
      payload: { expectedRevision: 2, content },
      expectedRevision: 2,
      createdAt: "2026-08-04T00:00:00.000Z",
      attempts: 0,
    });

    const result = await repository.syncPending();

    expect(result.conflicts).toBe(1);
    expect((await cache.getLabel("user-a", "label-a"))?.syncStatus).toBe("conflict");
    expect(await cache.listQueue("user-a")).toEqual([]);
  });

  it("duplicates an online label and stores the returned document in the local cache", async () => {
    const duplicated = {
      id: "label-copy", name: "副本", content, schemaVersion: 1, revision: 1,
      createdAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z", deletedAt: null, lastOpenedAt: null,
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toContain("/labels/label-a/duplicate");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ name: "副本" }));
      return new Response(JSON.stringify(duplicated), { status: 201 });
    });
    const cache = new MemoryCloudCacheStore();
    const repository = new CloudLabelRepository(new CloudApiClient({ baseUrl: "https://cloud.example.test", fetcher, getAccessToken: () => "token" }), cache, () => user);

    await expect(repository.duplicate("label-a", "副本")).resolves.toMatchObject({ id: "label-copy", syncStatus: "synced" });
    expect((await cache.getLabel("user-a", "label-copy"))?.content).toEqual(content);
  });

  it("resolves an explicit conflict by retaining cloud, overwriting it, or saving a copy", async () => {
    const remoteContent = { ...content, canvas: { widthMm: 50, heightMm: 30 } };
    const localContent = { ...content, canvas: { widthMm: 40, heightMm: 40 } };
    const remote = {
      id: "label-a", name: "冲突标签", content: remoteContent, schemaVersion: 1, revision: 3,
      createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T01:00:00.000Z", deletedAt: null, lastOpenedAt: null,
    };
    const update = { ...remote, content: localContent, revision: 4 };
    const copied = { ...remote, id: "label-copy", name: "冲突标签（冲突副本）", content: localContent, revision: 1 };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/labels/label-a") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify(remote), { status: 200 });
      if (url.endsWith("/labels/label-a") && init?.method === "PUT") return new Response(JSON.stringify(update), { status: 200 });
      if (url.endsWith("/labels") && init?.method === "POST") return new Response(JSON.stringify(copied), { status: 201 });
      throw new Error(`Unexpected request ${init?.method ?? "GET"} ${url}`);
    });
    const client = new CloudApiClient({ baseUrl: "https://cloud.example.test", fetcher, getAccessToken: () => "token" });

    const setup = async () => {
      const cache = new MemoryCloudCacheStore();
      await cache.putLabel("user-a", { ...remote, content: localContent, syncStatus: "conflict", lastSyncedAt: null });
      return { cache, repository: new CloudLabelRepository(client, cache, () => user) };
    };

    const discard = await setup();
    expect((await discard.repository.resolveConflict("label-a", "discard-local"))?.content).toEqual(remoteContent);
    expect((await discard.cache.getLabel("user-a", "label-a"))?.syncStatus).toBe("synced");

    const overwrite = await setup();
    expect((await overwrite.repository.resolveConflict("label-a", "overwrite"))?.revision).toBe(4);
    expect((await overwrite.cache.getLabel("user-a", "label-a"))?.content).toEqual(localContent);

    const saveCopy = await setup();
    expect((await saveCopy.repository.resolveConflict("label-a", "save-copy"))?.id).toBe("label-copy");
    expect((await saveCopy.cache.getLabel("user-a", "label-a"))?.content).toEqual(remoteContent);
    expect((await saveCopy.cache.getLabel("user-a", "label-copy"))?.content).toEqual(localContent);
  });

  it("converts deferred image content before replaying an offline label operation", async () => {
    const offlineContent: CloudLabelContentV1 = {
      ...content,
      elements: [{
        id: "image-1", type: "image", name: "本地图片", xMm: 1, yMm: 1, widthMm: 10, heightMm: 10, rotation: 0,
        binding: { mode: "fixed", fixedValue: "data:image/png;base64,AA==" },
        textStyle: { fontFamily: "Arial", fontSize: 3, fontWeight: 400, italic: false, underline: false, align: "left", color: "#000000", letterSpacing: 0, lineHeight: 1.2 },
      }],
    };
    const prepared = {
      ...offlineContent,
      elements: [{ ...offlineContent.elements[0], binding: { mode: "fixed" as const, fixedValue: "asset://asset-1" } }],
    };
    const cache = new MemoryCloudCacheStore();
    await cache.putLabel("user-a", {
      id: "local-image", name: "离线图片标签", content: offlineContent, schemaVersion: 1, revision: 0,
      createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z", deletedAt: null, lastOpenedAt: null, syncStatus: "pending", lastSyncedAt: null,
    });
    await cache.enqueue({
      id: "create-image", userId: "user-a", labelId: "local-image", kind: "create",
      payload: { name: "离线图片标签", content: offlineContent }, expectedRevision: null, createdAt: "2026-08-04T00:00:00.000Z", attempts: 0,
    });
    const prepare = vi.fn(async () => prepared);
    const client = new CloudApiClient({
      baseUrl: "https://cloud.example.test",
      fetcher: async (_input, init) => {
        const request = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          id: "cloud-image", name: request.name, content: request.content, schemaVersion: 1, revision: 1,
          createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z", deletedAt: null, lastOpenedAt: null,
        }), { status: 201 });
      },
      getAccessToken: () => "token",
    });
    const repository = new CloudLabelRepository(client, cache, () => user, prepare);

    expect(await repository.syncPending()).toMatchObject({ synced: 1, conflicts: 0, deferred: 0 });
    expect(prepare).toHaveBeenCalledWith(offlineContent);
    expect((await cache.getLabel("user-a", "cloud-image"))?.content).toEqual(prepared);
  });
});
