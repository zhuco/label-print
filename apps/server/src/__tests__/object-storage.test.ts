import { describe, expect, it, vi } from "vitest";
import { LabelCloudServer } from "../app.js";
import type { ObjectStorage } from "../object-storage.js";
import type { LabelAsset } from "../types.js";

const hash = "a".repeat(64);

async function register(server: LabelCloudServer) {
  const response = await server.inject({ method: "POST", url: "/api/v1/auth/register", body: { email: "assets@example.test", password: "correct-horse-battery-staple" } });
  return response.json<{ accessToken: string }>();
}

describe("signed object-storage integration", () => {
  it("issues signed URLs and verifies an uploaded object before completion", async () => {
    const assertUploaded = vi.fn(async (_asset: LabelAsset) => undefined);
    const deleteObject = vi.fn(async (_asset: LabelAsset) => undefined);
    const storage: ObjectStorage = {
      createUploadUrl: async () => ({ url: "https://object.example.test/upload", expiresAt: "2027-01-01T00:00:00.000Z", headers: { "content-type": "image/png" } }),
      createDownloadUrl: async () => ({ url: "https://object.example.test/download", expiresAt: "2027-01-01T00:00:00.000Z" }),
      assertUploaded,
      delete: deleteObject,
    };
    const server = new LabelCloudServer({ objectStorage: storage });
    const account = await register(server);
    const headers = { authorization: `Bearer ${account.accessToken}` };
    const initiated = await server.inject({ method: "POST", url: "/api/v1/assets/initiate", headers, body: { mimeType: "image/png", kind: "image", sha256: hash, byteSize: 12 } });
    expect(initiated.status).toBe(201);
    const body = initiated.json<{ asset: { id: string }; uploadUrl: string; expiresAt: string }>();
    expect(body.uploadUrl).toBe("https://object.example.test/upload");
    expect(body.expiresAt).toBe("2027-01-01T00:00:00.000Z");
    expect((await server.inject({ method: "POST", url: `/api/v1/assets/${body.asset.id}/complete`, headers })).status).toBe(200);
    expect(assertUploaded).toHaveBeenCalledTimes(1);
    const downloaded = await server.inject({ method: "GET", url: `/api/v1/assets/${body.asset.id}`, headers });
    expect(downloaded.json<{ downloadUrl: string }>().downloadUrl).toBe("https://object.example.test/download");
    expect((await server.inject({ method: "DELETE", url: `/api/v1/assets/${body.asset.id}`, headers })).status).toBe(204);
    expect(deleteObject).toHaveBeenCalledTimes(1);
  });
});
