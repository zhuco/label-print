import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ApiError } from "./errors.js";
import type { LabelAsset } from "./types.js";

export interface ObjectStorage {
  createUploadUrl(asset: LabelAsset): Promise<{ url: string; expiresAt: string; headers: Record<string, string> }>;
  createDownloadUrl(asset: LabelAsset): Promise<{ url: string; expiresAt: string }>;
  assertUploaded(asset: LabelAsset): Promise<void>;
  delete(asset: LabelAsset): Promise<void>;
}

export type S3ObjectStorageOptions = {
  bucket: string;
  region: string;
  /** Endpoint used by the API process for commands such as HeadObject. */
  endpoint?: string;
  /** Public endpoint embedded in presigned URLs. It can differ from the API's private endpoint. */
  publicEndpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  signedUrlTtlSeconds?: number;
};

/** S3-compatible adapter; works with AWS S3, Cloudflare R2, MinIO and similar providers. */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;
  private readonly ttlSeconds: number;

  constructor(private readonly options: S3ObjectStorageOptions) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle ?? Boolean(options.endpoint),
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
    this.signingClient = options.publicEndpoint
      ? new S3Client({
        region: options.region,
        endpoint: options.publicEndpoint,
        forcePathStyle: options.forcePathStyle ?? true,
        credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      })
      : this.client;
    this.ttlSeconds = options.signedUrlTtlSeconds ?? 5 * 60;
  }

  async createUploadUrl(asset: LabelAsset): Promise<{ url: string; expiresAt: string; headers: Record<string, string> }> {
    const checksum = checksumBase64(asset);
    const url = await getSignedUrl(this.signingClient, new PutObjectCommand({
      Bucket: this.options.bucket, Key: asset.objectKey, ContentType: asset.mimeType, ChecksumSHA256: checksum,
    }), { expiresIn: this.ttlSeconds });
    return {
      url,
      expiresAt: expiresAt(this.ttlSeconds),
      headers: { "content-type": asset.mimeType, "x-amz-checksum-sha256": checksum },
    };
  }

  async createDownloadUrl(asset: LabelAsset): Promise<{ url: string; expiresAt: string }> {
    const url = await getSignedUrl(this.signingClient, new GetObjectCommand({ Bucket: this.options.bucket, Key: asset.objectKey }), { expiresIn: this.ttlSeconds });
    return { url, expiresAt: expiresAt(this.ttlSeconds) };
  }

  async assertUploaded(asset: LabelAsset): Promise<void> {
    try {
      const object = await this.client.send(new HeadObjectCommand({
        Bucket: this.options.bucket,
        Key: asset.objectKey,
        ChecksumMode: "ENABLED",
      }));
      if (
        object.ContentLength !== asset.byteSize ||
        object.ContentType?.toLowerCase() !== asset.mimeType ||
        object.ChecksumSHA256 !== checksumBase64(asset)
      ) {
        throw new ApiError(400, "ASSET_UPLOAD_INVALID", "Uploaded asset metadata does not match the authorized upload.");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, "ASSET_UPLOAD_NOT_READY", "The asset upload is missing or not ready yet.");
    }
  }

  async delete(asset: LabelAsset): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: asset.objectKey }));
    } catch {
      throw new ApiError(502, "ASSET_DELETE_FAILED", "The asset object could not be deleted. Please retry.");
    }
  }
}

export function objectStorageFromEnvironment(environment = process.env): ObjectStorage | undefined {
  const bucket = environment.S3_BUCKET;
  if (!bucket) return undefined;
  const region = environment.S3_REGION;
  const accessKeyId = environment.S3_ACCESS_KEY_ID;
  const secretAccessKey = environment.S3_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) throw new Error("S3_BUCKET requires S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
  return new S3ObjectStorage({
    bucket, region, accessKeyId, secretAccessKey, endpoint: environment.S3_ENDPOINT, publicEndpoint: environment.S3_PUBLIC_ENDPOINT,
    forcePathStyle: environment.S3_FORCE_PATH_STYLE === "true",
  });
}

function expiresAt(seconds: number): string { return new Date(Date.now() + seconds * 1_000).toISOString(); }

function checksumBase64(asset: LabelAsset): string {
  return Buffer.from(asset.sha256, "hex").toString("base64");
}
