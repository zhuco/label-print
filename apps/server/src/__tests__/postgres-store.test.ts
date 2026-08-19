import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";
import { DataType, newDb } from "pg-mem";
import { describe, expect, it } from "vitest";
import { LabelCloudServer } from "../app.js";
import { PostgresStore } from "../postgres-store.js";

const content = () => ({
  format: "label-print-cloud-document", version: 1, unit: "mm",
  canvas: { widthMm: 60, heightMm: 40 }, elements: [],
});

function createStore() {
  const database = newDb({ autoCreateForeignKeyIndices: true });
  database.public.registerFunction({ name: "btrim", args: [DataType.text], returns: DataType.text, implementation: (value) => value.trim() });
  database.public.registerFunction({ name: "char_length", args: [DataType.text], returns: DataType.integer, implementation: (value) => value.length });
  const migration = ["0001_personal_cloud.sql", "0002_add_billing_webhook_events.sql", "0003_add_account_deletion.sql"]
    .map((name) => readFileSync(resolve(import.meta.dirname, `../../migrations/${name}`), "utf8"))
    .join("\n")
    .replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "")
    // pg-mem does not implement PostgreSQL's regex operator; the production migration retains it.
    .replace(/\s*CHECK \(sha256 ~ '\^\[0-9a-f\]\{64\}\$'\),/, "");
  database.public.none(migration);
  const { Pool } = database.adapters.createPg();
  const pool = new Pool();
  return { store: new PostgresStore({ pool }), pool };
}

const authorization = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

describe("PostgresStore", () => {
  it("persists account, pro membership, token rotation and labels through a new repository instance", async () => {
    const fixture = createStore();
    const { store } = fixture;
    const server = new LabelCloudServer({ store, accessTokenSecret: "postgres-test-secret", rateLimit: { maxRequests: 500, windowMs: 60_000 } });
    const registered = await server.inject({ method: "POST", url: "/api/v1/auth/register", body: { email: "postgres@example.test", password: "correct-horse-battery-staple" } });
    expect(registered.status).toBe(201);
    const account = registered.json<{ accessToken: string; refreshToken: string; user: { id: string } }>();
    await store.setPlanFromSubscription(account.user.id, "pro", "2027-08-05T15:59:59.000Z");

    const created = await server.inject({ method: "POST", url: "/api/v1/labels", headers: authorization(account.accessToken), body: { name: "PostgreSQL label", content: content() } });
    expect(created.status).toBe(201);
    const rotated = await server.inject({ method: "POST", url: "/api/v1/auth/refresh", body: { refreshToken: account.refreshToken } });
    expect(rotated.status).toBe(200);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/refresh", body: { refreshToken: account.refreshToken } })).status).toBe(401);

    const secondStore = new PostgresStore({ pool: fixture.pool });
    const secondServer = new LabelCloudServer({ store: secondStore, accessTokenSecret: "postgres-test-secret" });
    const session = rotated.json<{ accessToken: string }>();
    const me = await secondServer.inject({ method: "GET", url: "/api/v1/me", headers: authorization(session.accessToken) });
    expect(me.status).toBe(200);
    expect(me.json<{ plan: string; planExpiresAt: string; labelUsage: { used: number; limit: number } }>().labelUsage).toEqual({ used: 1, limit: 200, canCreate: true });
    const labels = await secondServer.inject({ method: "GET", url: "/api/v1/labels", headers: authorization(session.accessToken) });
    expect(labels.json<{ items: Array<{ name: string }> }>().items).toEqual([expect.objectContaining({ name: "PostgreSQL label" })]);
  });

  it("uses the free plan once a persisted pro expiry has passed", async () => {
    const fixture = createStore();
    const server = new LabelCloudServer({ store: fixture.store, accessTokenSecret: "postgres-test-secret" });
    const registered = await server.inject({ method: "POST", url: "/api/v1/auth/register", body: { email: "expired@example.test", password: "correct-horse-battery-staple" } });
    const account = registered.json<{ accessToken: string; user: { id: string } }>();
    await fixture.store.setPlanFromSubscription(account.user.id, "pro", "2000-01-01T00:00:00.000Z");
    const me = await server.inject({ method: "GET", url: "/api/v1/me", headers: authorization(account.accessToken) });
    expect(me.json<{ plan: string; labelUsage: { limit: number } }>()).toMatchObject({ plan: "free", labelUsage: { limit: 50 } });
  });

  it("persists idempotent billing relay events in PostgreSQL", async () => {
    const fixture = createStore();
    const webhookSecret = "postgres-billing-secret";
    const server = new LabelCloudServer({ store: fixture.store, accessTokenSecret: "postgres-test-secret", billingWebhookSecret: webhookSecret });
    const registered = await server.inject({ method: "POST", url: "/api/v1/auth/register", body: { email: "billing-postgres@example.test", password: "correct-horse-battery-staple" } });
    const account = registered.json<{ accessToken: string; user: { id: string } }>();
    const event = { provider: "payment-adapter", eventId: "postgres-event-1", type: "subscription_renewed", userId: account.user.id, plan: "pro", planExpiresAt: "2027-08-05T15:59:59.000Z", occurredAt: new Date(Date.now() + 1_000).toISOString() };
    const timestamp = String(Date.now());
    const body = JSON.stringify(event);
    const headers = { "x-billing-timestamp": timestamp, "x-billing-signature": createHmac("sha256", webhookSecret).update(`${timestamp}.${body}`).digest("hex") };

    expect((await server.inject({ method: "POST", url: "/api/v1/internal/billing/events", body, headers })).json<{ status: string }>().status).toBe("applied");
    expect((await server.inject({ method: "POST", url: "/api/v1/internal/billing/events", body, headers })).json<{ status: string }>().status).toBe("duplicate");
    expect((await server.inject({ method: "GET", url: "/api/v1/me", headers: authorization(account.accessToken) })).json<{ plan: string }>().plan).toBe("pro");
  });

  it("persists frozen account deletion state and revokes PostgreSQL refresh sessions", async () => {
    const fixture = createStore();
    const server = new LabelCloudServer({ store: fixture.store, accessTokenSecret: "postgres-test-secret" });
    const registered = await server.inject({ method: "POST", url: "/api/v1/auth/register", body: { email: "deletion-postgres@example.test", password: "correct-horse-battery-staple" } });
    const account = registered.json<{ accessToken: string; refreshToken: string }>();

    const deletion = await server.inject({ method: "POST", url: "/api/v1/me/account-deletion", headers: authorization(account.accessToken) });
    expect(deletion.status).toBe(202);
    expect(Date.parse(deletion.json<{ scheduledFor: string }>().scheduledFor)).toBeGreaterThan(Date.now());
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/refresh", body: { refreshToken: account.refreshToken } })).status).toBe(401);
  });

  it("invalidates every outstanding PostgreSQL password-reset token after one is used", async () => {
    const fixture = createStore();
    const tokens: string[] = [];
    const server = new LabelCloudServer({
      store: fixture.store,
      accessTokenSecret: "postgres-test-secret",
      passwordResetMailer: ({ token }) => { tokens.push(token); },
    });
    await server.inject({ method: "POST", url: "/api/v1/auth/register", body: { email: "reset-postgres@example.test", password: "correct-horse-battery-staple" } });
    await server.inject({ method: "POST", url: "/api/v1/auth/password/forgot", body: { email: "reset-postgres@example.test" } });
    await server.inject({ method: "POST", url: "/api/v1/auth/password/forgot", body: { email: "reset-postgres@example.test" } });
    expect(tokens).toHaveLength(2);

    expect((await server.inject({ method: "POST", url: "/api/v1/auth/password/reset", body: { token: tokens[0], password: "new-correct-horse-battery" } })).status).toBe(204);
    expect((await server.inject({ method: "POST", url: "/api/v1/auth/password/reset", body: { token: tokens[1], password: "another-correct-horse-battery" } })).status).toBe(403);
  });
});
