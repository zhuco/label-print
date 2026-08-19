import { describe, expect, it, vi } from "vitest";

import { CloudApiClient } from "../api-client";
import { MemoryCredentialStore } from "../credentials";

describe("CloudApiClient", () => {
  it("binds the default browser fetch to its global receiver", async () => {
    const receivers: unknown[] = [];
    const fetcher = function (this: unknown): Promise<Response> {
      receivers.push(this);
      return Promise.resolve(new Response(JSON.stringify({ accessToken: "access", refreshToken: "refresh" }), { status: 200 }));
    } as typeof fetch;
    vi.stubGlobal("fetch", fetcher);

    try {
      const client = new CloudApiClient({ baseUrl: "https://cloud.example.test" });
      await client.login({ email: "user@example.test", password: "password" });

      expect(receivers).toEqual([globalThis]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sends a bearer token and retries one unauthorized request after refresh", async () => {
    let token = "expired-access";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "AUTH_REQUIRED" } }), { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "user-1",
            displayName: "测试用户",
            plan: "free",
            planExpiresAt: null,
            labelUsage: { used: 0, limit: 50, canCreate: true },
          }),
          { status: 200 }
        )
      );
    const refresh = vi.fn(async () => {
      token = "fresh-access";
      return true;
    });
    const client = new CloudApiClient({
      baseUrl: "https://cloud.example.test",
      fetcher,
      getAccessToken: () => token,
      onUnauthorized: refresh,
    });

    const user = await client.me();

    expect(user.id).toBe("user-1");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]?.headers).toEqual(expect.any(Headers));
    expect((fetcher.mock.calls[1][1]?.headers as Headers).get("Authorization")).toBe("Bearer fresh-access");
  });

  it("keeps the browser credential fallback in memory instead of localStorage", async () => {
    const store = new MemoryCredentialStore();
    localStorage.clear();
    await store.save({ accessToken: "access-token", refreshToken: "refresh-token" });

    expect(await store.load()).toEqual({ accessToken: "access-token", refreshToken: "refresh-token" });
    expect(localStorage.length).toBe(0);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("requests account deletion with the current bearer token", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ scheduledFor: "2026-08-19T00:00:00.000Z" }), { status: 202 }));
    const client = new CloudApiClient({ baseUrl: "https://cloud.example.test", fetcher, getAccessToken: () => "access-token" });

    await expect(client.requestAccountDeletion()).resolves.toEqual({ scheduledFor: "2026-08-19T00:00:00.000Z" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://cloud.example.test/api/v1/me/account-deletion",
      expect.objectContaining({ method: "POST" }),
    );
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("does not forward the API bearer token to a cross-origin signed download URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const client = new CloudApiClient({ baseUrl: "https://cloud.example.test", fetcher, getAccessToken: () => "access-token" });

    await client.downloadAsset("https://objects.example.test/get/asset-1");

    expect(fetcher).toHaveBeenCalledWith(
      "https://objects.example.test/get/asset-1",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get("Authorization")).toBeNull();
  });
});
