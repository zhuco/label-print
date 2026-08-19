import type { LabelAsset } from "@label/api-contract";
import { describe, expect, it, vi } from "vitest";

import { CloudApiClient } from "../api-client";
import { CloudAssetRepository } from "../asset-repository";

const initiatedAsset: LabelAsset = {
  id: "asset-1", userId: "user-1", mimeType: "image/png", kind: "image",
  sha256: "00".repeat(32), byteSize: 3, state: "initiated",
  createdAt: "2026-08-05T00:00:00.000Z", completedAt: null, deletedAt: null,
};

const completedAsset: LabelAsset = {
  ...initiatedAsset, state: "completed", completedAt: "2026-08-05T00:00:01.000Z",
};

function uploadBlob(bytes: number[]): Blob {
  const data = new Uint8Array(bytes);
  return {
    size: data.byteLength,
    type: "image/png",
    arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  } as unknown as Blob;
}

describe("CloudAssetRepository", () => {
  it("hashes, uploads through the signed URL, and completes a new image asset", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        asset: initiatedAsset,
        uploadUrl: "https://objects.example.test/put/asset-1",
        uploadHeaders: { "content-type": "image/png", "x-amz-checksum-sha256": "checksum" },
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ asset: completedAsset }), { status: 200 }));
    const repository = new CloudAssetRepository(new CloudApiClient({
      baseUrl: "https://cloud.example.test", fetcher, getAccessToken: () => "access-token",
    }));
    const bytes = uploadBlob([1, 2, 3]);

    await expect(repository.upload({ bytes, mimeType: "image/png", kind: "image" })).resolves.toEqual(completedAsset);

    expect(fetcher).toHaveBeenCalledTimes(3);
    const initiateRequest = fetcher.mock.calls[0];
    expect(initiateRequest[0]).toBe("https://cloud.example.test/api/v1/assets/initiate");
    expect(JSON.parse(initiateRequest[1]?.body as string)).toMatchObject({
      mimeType: "image/png", kind: "image", byteSize: 3,
      sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
    });
    const submitted = JSON.parse(initiateRequest[1]?.body as string) as { sha256: string };
    expect(submitted.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect((initiateRequest[1]?.headers as Headers).get("Authorization")).toBe("Bearer access-token");
    expect(fetcher.mock.calls[1][0]).toBe("https://objects.example.test/put/asset-1");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "PUT", body: bytes });
    expect(fetcher.mock.calls[1][1]?.headers).toEqual({ "content-type": "image/png", "x-amz-checksum-sha256": "checksum" });
    expect(fetcher.mock.calls[2][0]).toBe("https://cloud.example.test/api/v1/assets/asset-1/complete");
  });

  it("does not upload again when the server deduplicates an existing asset", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ asset: completedAsset, uploadUrl: null }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ asset: completedAsset }), { status: 200 }));
    const repository = new CloudAssetRepository(new CloudApiClient({
      baseUrl: "https://cloud.example.test", fetcher, getAccessToken: () => "access-token",
    }));

    await expect(repository.upload({ bytes: uploadBlob([111, 108, 100]), mimeType: "image/png", kind: "image" })).resolves.toEqual(completedAsset);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://cloud.example.test/api/v1/assets/initiate",
      "https://cloud.example.test/api/v1/assets/asset-1/complete",
    ]);
  });

  it("converts a downloaded image blob into a data URL", async () => {
    const client = new CloudApiClient({ baseUrl: "https://cloud.example.test", getAccessToken: () => "access-token" });
    vi.spyOn(client, "getAssetDownload").mockResolvedValue({
      asset: completedAsset, downloadUrl: "https://objects.example.test/get/asset-1", expiresAt: "2026-08-05T00:05:00.000Z",
    });
    vi.spyOn(client, "downloadAsset").mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    const repository = new CloudAssetRepository(client);

    await expect(repository.downloadAsDataUrl("asset-1")).resolves.toBe("data:image/png;base64,AQID");
  });
});
