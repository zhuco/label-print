import { describe, expect, it, vi } from "vitest";

import { CloudAuthSession } from "../auth-session";
import type { CredentialStore } from "../credentials";
import type { CloudCredentials } from "../types";

const credentials: CloudCredentials = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

function user(used: number) {
  return {
    id: "user-1",
    displayName: "测试用户",
    plan: "free" as const,
    planExpiresAt: null,
    labelUsage: { used, limit: 50, canCreate: used < 50 },
  };
}

function credentialStore(): CredentialStore {
  return {
    load: vi.fn().mockResolvedValue(credentials),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

describe("CloudAuthSession", () => {
  it("reloads the server-authoritative label usage after a quota-changing action", async () => {
    const client = {
      me: vi.fn()
        .mockResolvedValueOnce(user(49))
        .mockResolvedValueOnce(user(50)),
    };
    const session = new CloudAuthSession(client as never, credentialStore());

    await session.restore();
    await expect(session.refreshProfile()).resolves.toMatchObject({ labelUsage: { used: 50, canCreate: false } });

    expect(session.user?.labelUsage).toEqual({ used: 50, limit: 50, canCreate: false });
    expect(client.me).toHaveBeenCalledTimes(2);
  });

  it("keeps persisted credentials through a temporary network outage and restores them on retry", async () => {
    const store = credentialStore();
    const client = {
      me: vi.fn()
        .mockRejectedValueOnce(new Error("network unavailable"))
        .mockResolvedValueOnce(user(12)),
      refresh: vi.fn().mockRejectedValueOnce(new Error("network unavailable")),
    };
    const session = new CloudAuthSession(client as never, store);

    await session.restore();
    expect(store.clear).not.toHaveBeenCalled();
    expect(session.state.status).toBe("loading");

    await expect(session.restore()).resolves.toMatchObject({ status: "authenticated" });
    expect(session.user?.displayName).toBe("测试用户");
  });
});
