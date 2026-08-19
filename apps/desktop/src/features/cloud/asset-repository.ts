import type { AssetKind, InitiateAssetResponse, LabelAsset } from "@label/api-contract";

import { CloudApiClient } from "./api-client";

export type UploadAssetInput = {
  bytes: Blob;
  mimeType: string;
  kind: AssetKind;
};

/**
 * Asset upload boundary used by future editor image handling. The signed URL is
 * short-lived and is not retained in documents or cache records; cloud content
 * stores only the resulting `asset://<id>` reference.
 */
export class CloudAssetRepository {
  constructor(private readonly api: CloudApiClient) {}

  async upload(input: UploadAssetInput): Promise<LabelAsset> {
    const sha256 = await sha256Hex(input.bytes);
    const initiated = await this.api.initiateAsset({
      mimeType: input.mimeType,
      kind: input.kind,
      sha256,
      byteSize: input.bytes.size,
    });
    await this.uploadIfNeeded(initiated, input.bytes);
    const completed = await this.api.completeAsset(initiated.asset.id);
    return completed.asset;
  }

  async getDownloadUrl(id: string): Promise<string> {
    return (await this.api.getAssetDownload(id)).downloadUrl;
  }

  async downloadAsDataUrl(id: string): Promise<string> {
    return blobToDataUrl(await this.api.downloadAsset(await this.getDownloadUrl(id)));
  }

  async delete(id: string): Promise<void> {
    await this.api.deleteAsset(id);
  }

  private async uploadIfNeeded(initiated: InitiateAssetResponse, bytes: Blob): Promise<void> {
    if (!initiated.uploadUrl) return;
    await this.api.uploadToSignedUrl(initiated.uploadUrl, bytes, initiated.uploadHeaders ?? {});
  }
}

export async function sha256Hex(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("当前环境不支持图片哈希计算。");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片资源读取失败。"));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("图片资源格式无效。"));
    };
    reader.readAsDataURL(blob);
  });
}
