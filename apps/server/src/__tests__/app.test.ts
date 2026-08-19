import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LabelCloudServer, type CloudLabelContentV1, type DesktopRelease, type OfficialTemplate } from "../index.js";

const element = (id: string, type: "text" | "image" = "text") => ({
  id, type, name: id, xMm: 1, yMm: 1, widthMm: 10, heightMm: 5, rotation: 0,
  binding: { mode: "fixed" as const, fixedValue: "value" },
  textStyle: { fontFamily: "Arial", fontSize: 4, fontWeight: 400, italic: false, underline: false, align: "left" as const, color: "#000000", letterSpacing: 0, lineHeight: 1.2 },
});

const content = (elements: CloudLabelContentV1["elements"] = []): CloudLabelContentV1 => ({
  format: "label-print-cloud-document", version: 1, unit: "mm", canvas: { widthMm: 60, heightMm: 40 }, elements,
});

const email = (suffix: string) => `person-${suffix}@example.test`;

async function register(server: LabelCloudServer, suffix = "one") {
  const response = await server.inject({ method: "POST", url: "/api/v1/auth/register", body: { email: email(suffix), password: "correct-horse-battery-staple", displayName: "Person" } });
  expect(response.status).toBe(201);
  return response.json<{ accessToken: string; refreshToken: string; user: { id: string } }>();
}

const authorization = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

describe("account sessions", () => {
  it("allows the local browser smoke-test origin by default", async () => {
    const server = new LabelCloudServer();

    const response = await server.inject({
      method: "OPTIONS",
      url: "/api/v1/auth/login",
      headers: { origin: "http://127.0.0.1:4173" },
    });

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:4173");
  });

  it("exposes liveness and protected low-cardinality monitoring counters", async () => {
    const server = new LabelCloudServer({ metricsToken: "metrics-secret" });
    expect((await server.inject({ method: "GET", url: "/healthz" })).json<{ status: string }>().status).toBe("ok");
    const missing = await server.inject({ method: "POST", url: "/api/v1/auth/login", body: { email: "missing@example.test", password: "correct-horse-battery-staple" } });
    expect(missing.status).toBe(404);
    expect(missing.json<{ error: { code: string } }>().error.code).toBe("ACCOUNT_NOT_FOUND");
    expect((await server.inject({ method: "GET", url: "/metrics" })).status).toBe(404);
    const metrics = await server.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer metrics-secret" } });
    expect(metrics.status).toBe(200);
    expect(String(metrics.body)).toContain('operation="auth_login",status="404"');
  });

  it("returns an actionable code when an existing account has the wrong password", async () => {
    const server = new LabelCloudServer();
    await register(server, "wrong-password");

    const response = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      body: { email: email("wrong-password"), password: "not-the-right-password" },
    });

    expect(response.status).toBe(401);
    expect(response.json<{ error: { code: string } }>().error.code).toBe("LOGIN_PASSWORD_INCORRECT");
  });

  it("allows only configured origins to call the API", async () => {
    const server = new LabelCloudServer({ allowedOrigins: ["tauri://localhost"] });
    const allowed = await server.inject({ method: "OPTIONS", url: "/api/v1/labels", headers: { origin: "tauri://localhost" } });
    expect(allowed.status).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("tauri://localhost");
    const rejected = await server.inject({ method: "OPTIONS", url: "/api/v1/labels", headers: { origin: "https://untrusted.example" } });
    expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("uses forwarded client IPs only from an explicitly trusted proxy", async () => {
    const server = new LabelCloudServer({ rateLimit: { maxRequests: 1, windowMs: 60_000 }, trustedProxyIps: ["172.30.0.1"] });
    const throughCaddy = (client: string) => server.inject({
      method: "GET", url: "/api/v1/desktop-updates/windows/x86_64/0.1.3",
      remoteAddress: "172.30.0.1", headers: { "x-forwarded-for": `198.51.100.9, ${client}` },
    });
    expect((await throughCaddy("203.0.113.10")).status).toBe(204);
    expect((await throughCaddy("203.0.113.11")).status).toBe(204);
    expect((await throughCaddy("203.0.113.10")).status).toBe(429);

    const direct = new LabelCloudServer({ rateLimit: { maxRequests: 1, windowMs: 60_000 } });
    const directRequest = (forwarded: string) => direct.inject({
      method: "GET", url: "/api/v1/desktop-updates/windows/x86_64/0.1.3",
      remoteAddress: "198.51.100.30", headers: { "x-forwarded-for": forwarded },
    });
    expect((await directRequest("203.0.113.20")).status).toBe(204);
    expect((await directRequest("203.0.113.21")).status).toBe(429);
  });

  it("hashes passwords, rotates refresh tokens, and revokes them on logout", async () => {
    const server = new LabelCloudServer({ accessTokenSecret: "test-secret" });
    const account = await register(server);
    expect(account.refreshToken).not.toContain("correct-horse");

    const refreshed = await server.inject({ method: "POST", url: "/api/v1/auth/refresh", body: { refreshToken: account.refreshToken } });
    expect(refreshed.status).toBe(200);
    const rotated = refreshed.json<{ refreshToken: string; accessToken: string }>();
    expect(rotated.refreshToken).not.toBe(account.refreshToken);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/refresh", body: { refreshToken: account.refreshToken } })).status).toBe(401);

    expect((await server.inject({ method: "POST", url: "/api/v1/auth/logout", body: { refreshToken: rotated.refreshToken } })).status).toBe(204);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/refresh", body: { refreshToken: rotated.refreshToken } })).status).toBe(401);
    expect((await server.inject({ method: "GET", url: "/api/v1/me", headers: authorization(rotated.accessToken) })).status).toBe(200);
  });

  it("keeps independent sessions active when the same account signs in on multiple devices", async () => {
    const server = new LabelCloudServer({ accessTokenSecret: "test-secret" });
    const firstDevice = await register(server, "multiple-devices");

    const secondLogin = await server.inject({
      method: "POST", url: "/api/v1/auth/login",
      body: { email: email("multiple-devices"), password: "correct-horse-battery-staple" },
    });
    expect(secondLogin.status).toBe(200);
    const secondDevice = secondLogin.json<{ accessToken: string; refreshToken: string }>();
    expect(secondDevice.refreshToken).not.toBe(firstDevice.refreshToken);

    const firstRefresh = await server.inject({ method: "POST", url: "/api/v1/auth/refresh", body: { refreshToken: firstDevice.refreshToken } });
    expect(firstRefresh.status).toBe(200);
    const secondRefresh = await server.inject({ method: "POST", url: "/api/v1/auth/refresh", body: { refreshToken: secondDevice.refreshToken } });
    expect(secondRefresh.status).toBe(200);

    const firstRefreshedToken = firstRefresh.json<{ refreshToken: string }>().refreshToken;
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/logout", body: { refreshToken: firstRefreshedToken } })).status).toBe(204);
    const secondRefreshedToken = secondRefresh.json<{ refreshToken: string }>().refreshToken;
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/refresh", body: { refreshToken: secondRefreshedToken } })).status).toBe(200);
  });

  it("does not disclose account existence during password reset and invalidates old sessions after reset", async () => {
    const deliveredTokens: string[] = [];
    const server = new LabelCloudServer({ passwordResetMailer: ({ token }) => { deliveredTokens.push(token); } });
    const account = await register(server, "reset");
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/password/forgot", body: { email: email("missing") } })).status).toBe(202);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/password/forgot", body: { email: email("reset") } })).status).toBe(202);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/password/forgot", body: { email: email("reset") } })).status).toBe(202);
    expect(deliveredTokens).toHaveLength(2);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/password/reset", body: { token: deliveredTokens[0], password: "new-correct-horse-battery" } })).status).toBe(204);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/password/reset", body: { token: deliveredTokens[1], password: "another-correct-horse-battery" } })).status).toBe(403);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/refresh", body: { refreshToken: account.refreshToken } })).status).toBe(401);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/login", body: { email: email("reset"), password: "new-correct-horse-battery" } })).status).toBe(200);
  });

  it("freezes an account, revokes every session, and returns its delayed-deletion date", async () => {
    const server = new LabelCloudServer({ accessTokenSecret: "test-secret" });
    const account = await register(server, "deletion");
    const response = await server.inject({ method: "POST", url: "/api/v1/me/account-deletion", headers: authorization(account.accessToken) });

    expect(response.status).toBe(202);
    const scheduledFor = response.json<{ scheduledFor: string }>().scheduledFor;
    expect(Date.parse(scheduledFor) - Date.now()).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    expect(Date.parse(scheduledFor) - Date.now()).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000 + 1_000);
    expect((await server.inject({ method: "GET", url: "/api/v1/me", headers: authorization(account.accessToken) })).status).toBe(401);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/refresh", body: { refreshToken: account.refreshToken } })).status).toBe(401);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/login", body: { email: email("deletion"), password: "correct-horse-battery-staple" } })).status).toBe(401);
  });

  it("physically purges only a due frozen account from the maintenance task", async () => {
    const server = new LabelCloudServer({ accessTokenSecret: "test-secret" });
    const account = await register(server, "due-deletion");
    expect((await server.inject({ method: "POST", url: "/api/v1/me/account-deletion", headers: authorization(account.accessToken) })).status).toBe(202);
    const frozen = await server.store.getUserForLogin(email("due-deletion"));
    expect(frozen).toBeDefined();
    frozen!.deletionScheduledFor = new Date(Date.now() - 1_000).toISOString();

    await expect(server.purgeDueAccountDeletions()).resolves.toEqual({ purged: 1, failed: 0 });
    expect(await server.store.getUserForLogin(email("due-deletion"))).toBeUndefined();
  });

  it("records account deletion as its own low-cardinality monitoring operation", async () => {
    const server = new LabelCloudServer({ accessTokenSecret: "test-secret", metricsToken: "metrics-secret" });
    const account = await register(server, "deletion-metrics");

    expect((await server.inject({ method: "POST", url: "/api/v1/me/account-deletion", headers: authorization(account.accessToken) })).status).toBe(202);
    const metrics = await server.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer metrics-secret" } });
    expect(String(metrics.body)).toContain('operation="account_deletion",status="202"');
  });
});

describe("signed billing relay", () => {
  it("applies a verified event once, rejects forged requests, and ignores stale events", async () => {
    const webhookSecret = "billing-relay-test-secret";
    const server = new LabelCloudServer({ billingWebhookSecret: webhookSecret });
    const account = await register(server, "billing");
    const occurredAt = new Date(Date.now() + 10_000).toISOString();
    const event = {
      provider: "payment-adapter", eventId: "evt-100", type: "subscription_activated",
      userId: account.user.id, plan: "pro", planExpiresAt: "2027-08-05T15:59:59.000Z", occurredAt,
    };
    const timestamp = String(Date.now());
    const body = JSON.stringify(event);
    const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${body}`).digest("hex");
    const headers = { "x-billing-timestamp": timestamp, "x-billing-signature": signature };

    expect((await server.inject({ method: "POST", url: "/api/v1/internal/billing/events", body, headers })).json<{ status: string }>().status).toBe("applied");
    expect((await server.inject({ method: "GET", url: "/api/v1/me", headers: authorization(account.accessToken) })).json<{ plan: string }>().plan).toBe("pro");
    expect((await server.inject({ method: "POST", url: "/api/v1/internal/billing/events", body, headers })).json<{ status: string }>().status).toBe("duplicate");
    expect((await server.inject({ method: "POST", url: "/api/v1/internal/billing/events", body, headers: { ...headers, "x-billing-signature": "0".repeat(64) } })).status).toBe(401);

    const stale = { ...event, eventId: "evt-099", type: "subscription_refunded", plan: "free", planExpiresAt: null, occurredAt: new Date(Date.parse(occurredAt) - 1_000).toISOString() };
    const staleBody = JSON.stringify(stale);
    const staleSignature = createHmac("sha256", webhookSecret).update(`${timestamp}.${staleBody}`).digest("hex");
    expect((await server.inject({ method: "POST", url: "/api/v1/internal/billing/events", body: staleBody, headers: { ...headers, "x-billing-signature": staleSignature } })).json<{ status: string }>().status).toBe("stale");
    expect((await server.inject({ method: "GET", url: "/api/v1/me", headers: authorization(account.accessToken) })).json<{ plan: string }>().plan).toBe("pro");
  });

  it("does not expose the billing route when a relay secret is not configured", async () => {
    const server = new LabelCloudServer();
    expect((await server.inject({ method: "POST", url: "/api/v1/internal/billing/events", body: {} })).status).toBe(404);
  });
});

describe("labels", () => {
  it("includes label content in authenticated lists only when previews request it", async () => {
    const server = new LabelCloudServer();
    const owner = await register(server, "preview-list");
    await server.inject({
      method: "POST",
      url: "/api/v1/labels",
      headers: authorization(owner.accessToken),
      body: { name: "Preview", content: content() },
    });

    const summaryList = await server.inject({
      method: "GET",
      url: "/api/v1/labels",
      headers: authorization(owner.accessToken),
    });
    const previewList = await server.inject({
      method: "GET",
      url: "/api/v1/labels?includeContent=true",
      headers: authorization(owner.accessToken),
    });

    expect(summaryList.json<{ items: Array<{ content?: unknown }> }>().items[0]?.content).toBeUndefined();
    expect(previewList.json<{ items: Array<{ content?: unknown }> }>().items[0]?.content).toEqual(content());
  });

  it("keeps categories private and moves labels to uncategorized when a category is deleted", async () => {
    const server = new LabelCloudServer();
    const owner = await register(server, "category-owner");
    const other = await register(server, "category-other");
    const created = await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(owner.accessToken), body: { name: "Uncategorized", content: content() } });
    expect(created.status).toBe(201);
    expect(created.json<{ categoryId: string | null }>().categoryId).toBeNull();

    const category = await server.inject({ method: "POST", url: "/api/v1/label-categories", headers: authorization(owner.accessToken), body: { name: "订单" } });
    expect(category.status).toBe(201);
    const categoryId = category.json<{ id: string }>().id;
    expect((await server.inject({ method: "GET", url: "/api/v1/label-categories", headers: authorization(other.accessToken) })).json<{ items: unknown[] }>().items).toEqual([]);

    const moved = await server.inject({ method: "PATCH", url: `/api/v1/labels/${created.json<{ id: string }>().id}/category`, headers: authorization(owner.accessToken), body: { categoryId, expectedRevision: 1 } });
    expect(moved.status).toBe(200);
    expect(moved.json<{ categoryId: string | null }>().categoryId).toBe(categoryId);
    expect((await server.inject({ method: "DELETE", url: `/api/v1/label-categories/${categoryId}`, headers: authorization(owner.accessToken) })).status).toBe(204);
    expect((await server.inject({ method: "GET", url: `/api/v1/labels/${created.json<{ id: string }>().id}`, headers: authorization(owner.accessToken) })).json<{ categoryId: string | null }>().categoryId).toBeNull();
  });

  it("enforces user isolation and optimistic revision conflicts", async () => {
    const server = new LabelCloudServer();
    const owner = await register(server, "owner");
    const other = await register(server, "other");
    const created = await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(owner.accessToken), body: { name: "Private", content: content() } });
    expect(created.status).toBe(201);
    const label = created.json<{ id: string; revision: number }>();
    expect((await server.inject({ method: "GET", url: `/api/v1/labels/${label.id}`, headers: authorization(other.accessToken) })).status).toBe(404);
    expect((await server.inject({ method: "PUT", url: `/api/v1/labels/${label.id}`, headers: authorization(other.accessToken), body: { expectedRevision: 1, content: content() } })).status).toBe(404);

    const updated = await server.inject({ method: "PUT", url: `/api/v1/labels/${label.id}`, headers: authorization(owner.accessToken), body: { expectedRevision: 1, content: content([element("text-1")]) } });
    expect(updated.status).toBe(200);
    expect(updated.json<{ revision: number }>().revision).toBe(2);
    const conflict = await server.inject({ method: "PUT", url: `/api/v1/labels/${label.id}`, headers: authorization(owner.accessToken), body: { expectedRevision: 1, content: content() } });
    expect(conflict.status).toBe(409);
    expect(conflict.json<{ error: { code: string } }>().error.code).toBe("REVISION_CONFLICT");
    const renamed = await server.inject({ method: "PATCH", url: `/api/v1/labels/${label.id}/name`, headers: authorization(owner.accessToken), body: { name: "Renamed", expectedRevision: 2 } });
    expect(renamed.status).toBe(200);
    expect(renamed.json<{ name: string; content?: unknown }>().name).toBe("Renamed");
    expect(renamed.json<{ content?: unknown }>().content).toBeUndefined();
  });

  it("counts trashed labels until permanent deletion frees a free-plan slot", async () => {
    const server = new LabelCloudServer({ rateLimit: { maxRequests: 500, windowMs: 60_000 } });
    const account = await register(server, "quota");
    let firstId = "";
    for (let index = 0; index < 50; index += 1) {
      const result = await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(account.accessToken), body: { name: `Label ${index}`, content: content() } });
      expect(result.status).toBe(201);
      if (index === 0) firstId = result.json<{ id: string }>().id;
    }
    const blocked = await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(account.accessToken), body: { name: "51", content: content() } });
    expect(blocked.status).toBe(409);
    expect(blocked.json<{ error: { code: string } }>().error.code).toBe("LABEL_LIMIT_REACHED");
    expect((await server.inject({ method: "DELETE", url: `/api/v1/labels/${firstId}`, headers: authorization(account.accessToken) })).status).toBe(204);
    expect((await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(account.accessToken), body: { name: "Still blocked", content: content() } })).status).toBe(409);
    expect((await server.inject({ method: "DELETE", url: `/api/v1/labels/${firstId}/permanent`, headers: authorization(account.accessToken) })).status).toBe(204);
    expect((await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(account.accessToken), body: { name: "Slot freed", content: content() } })).status).toBe(201);
  });

  it("rejects invalid content and never accepts device-local print state", async () => {
    const server = new LabelCloudServer();
    const account = await register(server, "content");
    const invalid = await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(account.accessToken), body: { name: "Bad", content: { ...content(), printerName: "Office printer" } } });
    expect(invalid.status).toBe(400);
    expect(invalid.json<{ error: { code: string } }>().error.code).toBe("INVALID_LABEL_CONTENT");
    const newer = await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(account.accessToken), body: { name: "New", content: { ...content(), version: 2 } } });
    expect(newer.status).toBe(422);
    expect(newer.json<{ error: { code: string } }>().error.code).toBe("UNSUPPORTED_DOCUMENT_VERSION");
  });

  it("enforces the 200-label pro limit", async () => {
    const server = new LabelCloudServer({ rateLimit: { maxRequests: 500, windowMs: 60_000 } });
    const account = await register(server, "pro-quota");
    server.store.setPlanFromSubscription(account.user.id, "pro");
    for (let index = 0; index < 200; index += 1) {
      expect((await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(account.accessToken), body: { name: `Pro ${index}`, content: content() } })).status).toBe(201);
    }
    const overLimit = await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(account.accessToken), body: { name: "Pro 201", content: content() } });
    expect(overLimit.status).toBe(409);
    expect((await server.inject({ method: "GET", url: "/api/v1/me", headers: authorization(account.accessToken) })).json<{ labelUsage: { used: number; limit: number; canCreate: boolean } }>().labelUsage).toEqual({ used: 200, limit: 200, canCreate: false });
  });

  it("downgrades an expired pro subscription before applying quota or template permissions", async () => {
    const server = new LabelCloudServer();
    const account = await register(server, "expired-pro");
    server.store.setPlanFromSubscription(account.user.id, "pro", "2000-01-01T00:00:00.000Z");
    const me = await server.inject({ method: "GET", url: "/api/v1/me", headers: authorization(account.accessToken) });
    expect(me.json<{ plan: string; labelUsage: { limit: number } }>()).toMatchObject({ plan: "free", labelUsage: { limit: 50 } });
  });
});

describe("assets and official templates", () => {
  it("restricts image MIME types, ownership, and deletion while a label refers to an asset", async () => {
    const server = new LabelCloudServer();
    const owner = await register(server, "asset-owner");
    const other = await register(server, "asset-other");
    const bytes = Buffer.from("local image");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const unsafe = await server.inject({ method: "POST", url: "/api/v1/assets/initiate", headers: authorization(owner.accessToken), body: { mimeType: "image/svg+xml", kind: "image", sha256: hash, byteSize: 12 } });
    expect(unsafe.status).toBe(400);
    const tooLarge = await server.inject({ method: "POST", url: "/api/v1/assets/initiate", headers: authorization(owner.accessToken), body: { mimeType: "image/png", kind: "image", sha256: hash, byteSize: 10 * 1024 * 1024 + 1 } });
    expect(tooLarge.status).toBe(413);
    const initiated = await server.inject({ method: "POST", url: "/api/v1/assets/initiate", headers: authorization(owner.accessToken), body: { mimeType: "image/png", kind: "image", sha256: hash, byteSize: bytes.byteLength } });
    expect(initiated.status).toBe(201);
    const asset = initiated.json<{ asset: { id: string; state: string; objectKey?: string }; uploadUrl: string }>();
    expect(asset.uploadUrl).toContain(`/assets/${asset.asset.id}/upload`);
    expect(asset.asset).toMatchObject({ state: "initiated" });
    expect(asset.asset).not.toHaveProperty("objectKey");
    expect((await server.inject({ method: "POST", url: `/api/v1/assets/${asset.asset.id}/complete`, headers: authorization(owner.accessToken) })).status).toBe(400);
    expect((await server.inject({ method: "PUT", url: `/api/v1/assets/${asset.asset.id}/upload`, headers: { ...authorization(owner.accessToken), "content-type": "image/png" }, body: bytes })).status).toBe(204);
    const completed = await server.inject({ method: "POST", url: `/api/v1/assets/${asset.asset.id}/complete`, headers: authorization(owner.accessToken) });
    expect(completed.status).toBe(200);
    expect(completed.json<{ asset: { state: string; completedAt: string | null; objectKey?: string } }>().asset).toMatchObject({ state: "completed" });
    expect(completed.json<{ asset: { completedAt: string | null } }>().asset.completedAt).not.toBeNull();
    expect(completed.json<{ asset: { objectKey?: string } }>().asset).not.toHaveProperty("objectKey");
    const downloaded = await server.inject({ method: "GET", url: `/api/v1/assets/${asset.asset.id}/download`, headers: authorization(owner.accessToken) });
    expect(downloaded.status).toBe(200);
    expect(Buffer.isBuffer(downloaded.body) && downloaded.body.equals(bytes)).toBe(true);
    expect((await server.inject({ method: "GET", url: `/api/v1/assets/${asset.asset.id}`, headers: authorization(other.accessToken) })).status).toBe(404);
    const created = await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(owner.accessToken), body: { name: "Uses asset", content: content([{ ...element("image", "image"), binding: { mode: "fixed", fixedValue: `asset://${asset.asset.id}` } }]) } });
    expect(created.status).toBe(201);
    expect((await server.inject({ method: "DELETE", url: `/api/v1/assets/${asset.asset.id}`, headers: authorization(owner.accessToken) })).status).toBe(409);
    const labelId = created.json<{ id: string }>().id;
    await server.inject({ method: "DELETE", url: `/api/v1/labels/${labelId}`, headers: authorization(owner.accessToken) });
    expect((await server.inject({ method: "DELETE", url: `/api/v1/assets/${asset.asset.id}`, headers: authorization(owner.accessToken) })).status).toBe(409);
    await server.inject({ method: "DELETE", url: `/api/v1/labels/${labelId}/permanent`, headers: authorization(owner.accessToken) });
    expect((await server.inject({ method: "DELETE", url: `/api/v1/assets/${asset.asset.id}`, headers: authorization(owner.accessToken) })).status).toBe(204);
  });

  it("lists paid templates without their content and authorizes their content server-side", async () => {
    const server = new LabelCloudServer();
    const account = await register(server, "template");
    const now = new Date().toISOString();
    const template: OfficialTemplate = { id: "template-pro", code: "pro-label", name: "Pro Label", description: "Paid", category: "retail", requiredPlan: "pro", schemaVersion: 1, content: content(), previewUrl: "https://cdn.example.test/preview.png", enabled: true, sortOrder: 1, createdAt: now, updatedAt: now };
    server.store.addOfficialTemplate(template);
    const list = await server.inject({ method: "GET", url: "/api/v1/official-templates", headers: authorization(account.accessToken) });
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain("label-print-cloud-document");
    expect((await server.inject({ method: "GET", url: "/api/v1/official-templates/template-pro", headers: authorization(account.accessToken) })).status).toBe(403);
    server.store.setPlanFromSubscription(account.user.id, "pro");
    expect((await server.inject({ method: "GET", url: "/api/v1/official-templates/template-pro", headers: authorization(account.accessToken) })).status).toBe(200);
    expect((await server.inject({ method: "POST", url: "/api/v1/official-templates/template-pro/create-label", headers: authorization(account.accessToken), body: { name: "My paid copy" } })).status).toBe(201);
  });
});

describe("desktop updater endpoint", () => {
  it("publishes and stops a rollout only through the configured internal administration token", async () => {
    const server = new LabelCloudServer({ releaseAdminToken: "release-admin-test-token" });
    const release = {
      id: "a3e5c310-7ca6-48a0-949a-000000000020", version: "0.2.0", channel: "stable", target: "windows", arch: "x86_64",
      artifactUrl: "https://download.example.test/0.2.0.exe", artifactSignature: "tauri-signature", artifactSha256: "a".repeat(64), artifactSize: 42,
      releaseNotes: "Cloud support", minimumSupportedVersion: null, mandatory: false, rolloutPercent: 100,
      publishedAt: "2026-08-05T00:00:00.000Z", createdAt: "2026-08-05T00:00:00.000Z",
    };
    expect((await server.inject({ method: "PUT", url: "/api/v1/internal/desktop-releases", body: release })).status).toBe(401);
    expect((await server.inject({ method: "PUT", url: "/api/v1/internal/desktop-releases", body: { ...release, id: "not-a-uuid" }, headers: { authorization: "Bearer release-admin-test-token" } })).status).toBe(400);
    expect((await server.inject({ method: "PUT", url: "/api/v1/internal/desktop-releases", body: release, headers: { authorization: "Bearer release-admin-test-token" } })).status).toBe(200);
    expect((await server.inject({ method: "GET", url: "/api/v1/desktop-updates/windows/x86_64/0.1.3" })).status).toBe(200);
    expect((await server.inject({ method: "PUT", url: "/api/v1/internal/desktop-releases", body: { ...release, rolloutPercent: 0 }, headers: { authorization: "Bearer release-admin-test-token" } })).status).toBe(200);
    expect((await server.inject({ method: "GET", url: "/api/v1/desktop-updates/windows/x86_64/0.1.3" })).status).toBe(204);
  });

  it("returns a Tauri-compatible release only when a rollout includes the client", async () => {
    const server = new LabelCloudServer();
    const now = new Date().toISOString();
    const release: DesktopRelease = { id: "release-020", version: "0.2.0", channel: "stable", target: "windows", arch: "x86_64", artifactUrl: "https://download.example.test/0.2.0.exe", artifactSignature: "tauri-signature", artifactSha256: "b".repeat(64), artifactSize: 42, releaseNotes: "Cloud support", minimumSupportedVersion: "0.1.4", mandatory: true, rolloutPercent: 100, publishedAt: now, createdAt: now };
    server.store.addDesktopRelease(release);
    const update = await server.inject({ method: "GET", url: "/api/v1/desktop-updates/windows/x86_64/0.1.3" });
    expect(update.status).toBe(200);
    expect(update.json<{ version: string; pub_date: string; url: string; signature: string; artifact_size: number; minimum_supported_version: string | null; mandatory: boolean }>()).toMatchObject({ version: "0.2.0", artifact_size: 42, minimum_supported_version: "0.1.4", mandatory: true });
    expect((await server.inject({ method: "GET", url: "/api/v1/desktop-updates/windows/x86_64/0.2.0" })).status).toBe(204);
    server.store.addDesktopRelease({ ...release, id: "release-021", version: "0.2.1", rolloutPercent: 0 });
    expect((await server.inject({ method: "GET", url: "/api/v1/desktop-updates/windows/x86_64/0.2.0" })).status).toBe(204);
  });
});
