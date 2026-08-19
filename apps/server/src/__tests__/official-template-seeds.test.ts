import { describe, expect, it } from "vitest";
import { LabelCloudServer } from "../app.js";
import { seedBuiltInOfficialTemplates } from "../official-template-seeds.js";
import { InMemoryStore } from "../store.js";

describe("built-in official template catalog", () => {
  it("seeds a server-only catalog once and preserves plan enforcement", async () => {
    const store = new InMemoryStore();
    await seedBuiltInOfficialTemplates(store);
    await seedBuiltInOfficialTemplates(store);
    expect(store.listOfficialTemplates()).toHaveLength(7);

    const server = new LabelCloudServer({ store });
    const registered = await server.inject({
      method: "POST", url: "/api/v1/auth/register",
      body: { email: "catalog@example.test", password: "correct-horse-battery-staple" },
    });
    const { accessToken } = registered.json<{ accessToken: string }>();
    const headers = { authorization: `Bearer ${accessToken}` };
    expect((await server.inject({ method: "GET", url: "/api/v1/official-templates", headers })).json<{ items: unknown[] }>().items).toHaveLength(7);
    expect((await server.inject({ method: "POST", url: "/api/v1/official-templates/a3e5c310-7ca6-48a0-949a-000000000001/create-label", headers, body: { name: "食品副本" } })).status).toBe(201);
    expect((await server.inject({ method: "GET", url: "/api/v1/official-templates/a3e5c310-7ca6-48a0-949a-000000000006", headers })).status).toBe(403);
  });
});
