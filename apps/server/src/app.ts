import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { API_V1_PREFIX } from "@label/api-contract";
import { ApiError, badRequest, notFound, unauthorized } from "./errors.js";
import { secureStringEquals, signAccessToken, verifyAccessToken, verifyHmacSha256, verifyPassword } from "./crypto.js";
import { InMemoryStore, MAX_ASSET_BYTES } from "./store.js";
import type { CloudStore } from "./cloud-store.js";
import type { ObjectStorage } from "./object-storage.js";
import { MemoryAssetStorage, type LocalAssetStorage } from "./local-asset-storage.js";
import { HttpMetrics } from "./metrics.js";
import { parseCloudLabelContent, requireEmail, requireLoginPassword, requirePassword } from "./validation.js";
import type { BillingEventType, BillingWebhookEvent, DesktopRelease, LabelAsset, LabelDocument, OfficialTemplate, SessionTokens, UserProfile } from "./types.js";

const API_PREFIX = API_V1_PREFIX;
const MAX_JSON_BODY_BYTES = 1_048_576;

type JsonObject = Record<string, unknown>;
type Headers = Record<string, string | undefined>;

export type PasswordResetMailer = (input: { user: UserProfile; token: string }) => void | Promise<void>;

export type ServerOptions = {
  store?: CloudStore;
  accessTokenSecret?: string;
  accessTokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
  passwordResetMailer?: PasswordResetMailer;
  objectStorage?: ObjectStorage;
  localAssetStorage?: LocalAssetStorage;
  allowedOrigins?: string[];
  rateLimit?: { maxRequests: number; windowMs: number };
  metricsToken?: string;
  billingWebhookSecret?: string;
  releaseAdminToken?: string;
  /** Explicit proxy source addresses whose X-Forwarded-For value may be trusted. */
  trustedProxyIps?: string[];
};

export type InjectRequest = {
  method: string;
  url: string;
  headers?: Headers;
  body?: string | JsonObject | Buffer;
  remoteAddress?: string;
};

export type InjectResponse = {
  status: number;
  headers: Record<string, string>;
  body: string | Buffer;
  json<T = unknown>(): T;
};

class RateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly maxRequests: number, private readonly windowMs: number) {}

  check(key: string): void {
    const now = Date.now();
    const found = this.entries.get(key);
    const entry = !found || found.resetAt <= now ? { count: 0, resetAt: now + this.windowMs } : found;
    entry.count += 1;
    this.entries.set(key, entry);
    if (entry.count > this.maxRequests) throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please retry later.");
  }
}

function normalizeIpAddress(value: string): string {
  const address = value.trim();
  const mappedIpv4 = /^::ffff:(.+)$/i.exec(address)?.[1];
  return mappedIpv4 && isIP(mappedIpv4) === 4 ? mappedIpv4 : address;
}

function forwardedClientAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Proxies append the immediate client at the right. Starting there means an
  // incoming, spoofed left-hand entry cannot replace Caddy's observed client.
  for (const candidate of value.split(",").reverse()) {
    const address = normalizeIpAddress(candidate);
    if (isIP(address)) return address;
  }
  return undefined;
}

/**
 * Framework-free HTTP application. Its in-memory repository is intentionally injectable so the
 * same API behaviour can be tested without a database or object-store account.
 */
export class LabelCloudServer {
  readonly store: CloudStore;
  private readonly accessTokenSecret: string;
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;
  private readonly passwordResetMailer?: PasswordResetMailer;
  private readonly objectStorage?: ObjectStorage;
  private readonly localAssetStorage?: LocalAssetStorage;
  private readonly allowedOrigins: Set<string>;
  private readonly rateLimiter: RateLimiter;
  private readonly metrics = new HttpMetrics();
  private readonly metricsToken?: string;
  private readonly billingWebhookSecret?: string;
  private readonly releaseAdminToken?: string;
  private readonly trustedProxyIps: Set<string>;

  constructor(options: ServerOptions = {}) {
    this.store = options.store ?? new InMemoryStore();
    const configuredSecret = options.accessTokenSecret ?? process.env.ACCESS_TOKEN_SECRET;
    if (process.env.NODE_ENV === "production" && (!configuredSecret || Buffer.byteLength(configuredSecret, "utf8") < 32)) {
      throw new Error("ACCESS_TOKEN_SECRET must contain at least 32 bytes in production.");
    }
    this.accessTokenSecret = configuredSecret ?? "development-only-change-me";
    this.accessTokenTtlSeconds = options.accessTokenTtlSeconds ?? 15 * 60;
    this.refreshTokenTtlSeconds = options.refreshTokenTtlSeconds ?? 30 * 24 * 60 * 60;
    this.passwordResetMailer = options.passwordResetMailer;
    this.objectStorage = options.objectStorage;
    this.localAssetStorage = options.localAssetStorage ?? (!options.objectStorage ? new MemoryAssetStorage() : undefined);
    // Keep the explicit local Vite ports used by both `tauri dev` (5173) and the
    // Playwright/browser smoke tests (4173). Production deployments always replace this
    // list with CORS_ALLOWED_ORIGINS, so this does not broaden a public deployment.
    this.allowedOrigins = new Set(options.allowedOrigins ?? [
      "tauri://localhost",
      "http://tauri.localhost",
      "https://tauri.localhost",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
    ]);
    this.rateLimiter = new RateLimiter(options.rateLimit?.maxRequests ?? 20, options.rateLimit?.windowMs ?? 60_000);
    this.metricsToken = options.metricsToken;
    this.billingWebhookSecret = options.billingWebhookSecret;
    this.releaseAdminToken = options.releaseAdminToken;
    this.trustedProxyIps = new Set((options.trustedProxyIps ?? []).map(normalizeIpAddress));
  }

  createNodeServer(): Server {
    return createServer((request, response) => {
      void this.handleNodeRequest(request, response);
    });
  }

  /** Internal maintenance operation; call it from a controlled scheduler, never an HTTP route. */
  async purgeDueAccountDeletions(limit = 100): Promise<{ purged: number; failed: number }> {
    const now = new Date().toISOString();
    const candidates = await this.store.listDueAccountDeletions(now, limit);
    let purged = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        for (const asset of candidate.assets) {
          if (this.objectStorage) await this.objectStorage.delete(asset);
          else if (this.localAssetStorage) await this.localAssetStorage.delete(asset);
        }
        if (await this.store.purgeDueAccountDeletion(candidate.userId, now)) purged += 1;
      } catch {
        // Keep the database record intact so the next maintenance run can retry safely.
        failed += 1;
      }
    }
    return { purged, failed };
  }

  async inject(request: InjectRequest): Promise<InjectResponse> {
    const headers = normalizeHeaders(request.headers ?? {});
    const url = new URL(request.url, "http://localhost");
    const rawBytes = Buffer.isBuffer(request.body) ? request.body : undefined;
    const rawBody = rawBytes ? rawBytes.toString("utf8") : typeof request.body === "string" ? request.body : request.body === undefined ? "" : JSON.stringify(request.body);
    const response = await this.dispatch({ method: request.method.toUpperCase(), url, headers, rawBody, rawBytes, remoteAddress: request.remoteAddress ?? "127.0.0.1" });
    return {
      ...response,
      json<T = unknown>(): T { return JSON.parse(Buffer.isBuffer(response.body) ? response.body.toString("utf8") : response.body) as T; },
    };
  }

  private async handleNodeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let result: Omit<InjectResponse, "json">;
    try {
      const rawBytes = await readRawBody(request);
      const url = new URL(request.url ?? "/", "http://localhost");
      result = await this.dispatch({
        method: (request.method ?? "GET").toUpperCase(), url, headers: normalizeHeaders(request.headers), rawBody: rawBytes.toString("utf8"), rawBytes,
        remoteAddress: request.socket.remoteAddress ?? "unknown",
      });
    } catch (error) {
      result = error instanceof ApiError
        ? jsonResponse(error.status, error.body)
        : jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." } });
    }
    response.writeHead(result.status, result.headers);
    response.end(result.body);
  }

  private async dispatch(request: { method: string; url: URL; headers: Record<string, string | undefined>; rawBody: string; rawBytes?: Buffer; remoteAddress: string }): Promise<Omit<InjectResponse, "json">> {
    let response: Omit<InjectResponse, "json">;
    try {
      if (request.method === "OPTIONS" && request.url.pathname.startsWith(API_PREFIX)) response = this.withCors(emptyResponse(204), request.headers.origin);
      else response = this.withCors(await this.route(request), request.headers.origin);
    } catch (error) {
      if (error instanceof ApiError) response = this.withCors(jsonResponse(error.status, error.body), request.headers.origin);
      // Do not expose parser, database, token, or uploaded-content details to clients.
      else response = this.withCors(jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." } }), request.headers.origin);
    }
    this.metrics.record(request.method, request.url.pathname, response.status);
    return response;
  }

  private async route(request: { method: string; url: URL; headers: Record<string, string | undefined>; rawBody: string; rawBytes?: Buffer; remoteAddress: string }): Promise<Omit<InjectResponse, "json">> {
    const { method, url } = request;
    const path = url.pathname;
    const body = () => parseJsonBody(request.rawBody);
    const clientAddress = this.clientAddress(request);
    const rateLimited = (scope: string) => this.rateLimiter.check(`${scope}:${clientAddress}`);

    if (method === "GET" && path === "/healthz") return jsonResponse(200, { status: "ok" });
    if (method === "GET" && path === "/metrics") {
      if (!this.metricsToken || request.headers.authorization !== `Bearer ${this.metricsToken}`) {
        throw new ApiError(404, "ROUTE_NOT_FOUND", "The requested API route was not found.");
      }
      return textResponse(200, this.metrics.render(), "text/plain; version=0.0.4; charset=utf-8");
    }

    if (method === "POST" && path === `${API_PREFIX}/internal/billing/events`) {
      if (!this.billingWebhookSecret) throw notFound("ROUTE_NOT_FOUND", "The requested API route was not found.");
      rateLimited("billing-webhook");
      const timestamp = request.headers["x-billing-timestamp"];
      const signature = request.headers["x-billing-signature"];
      if (!isRecentWebhookTimestamp(timestamp) || typeof signature !== "string"
        || !verifyHmacSha256(`${timestamp}.${request.rawBody}`, this.billingWebhookSecret, signature)) {
        throw new ApiError(401, "INVALID_BILLING_SIGNATURE", "Billing webhook signature is invalid.");
      }
      const result = await this.store.applyBillingWebhookEvent(parseBillingWebhookEvent(body()));
      return jsonResponse(200, { status: result.status });
    }

    if (method === "PUT" && path === `${API_PREFIX}/internal/desktop-releases`) {
      if (!this.releaseAdminToken) throw notFound("ROUTE_NOT_FOUND", "The requested API route was not found.");
      rateLimited("release-admin");
      if (!secureStringEquals(request.headers.authorization, `Bearer ${this.releaseAdminToken}`)) {
        throw new ApiError(401, "INVALID_RELEASE_ADMIN_TOKEN", "Release administration token is invalid.");
      }
      const release = parseDesktopRelease(body());
      await this.store.addDesktopRelease(release);
      return jsonResponse(200, { id: release.id, version: release.version, channel: release.channel, rolloutPercent: release.rolloutPercent });
    }

    if (method === "POST" && path === `${API_PREFIX}/auth/register`) {
      rateLimited("register");
      const input = body();
      const user = await this.store.createUser(requireEmail(input.email), requirePassword(input.password), optionalDisplayName(input.displayName));
      return jsonResponse(201, { ...await this.issueTokens(user.id), user: toMeResponse(user, await this.store.usage(user.id)) });
    }
    if (method === "POST" && path === `${API_PREFIX}/auth/login`) {
      rateLimited("login");
      const input = body();
      const email = requireEmail(input.email);
      const password = requireLoginPassword(input.password);
      const user = await this.store.getUserForLogin(email);
      // This product explicitly shows account-level guidance in the desktop login form.
      // Keep session-token failures generic, but make an interactive password login actionable.
      if (!user) throw notFound("ACCOUNT_NOT_FOUND", "The account does not exist.");
      if (user.disabledAt) throw new ApiError(401, "ACCOUNT_DISABLED", "The account has been disabled.");
      if (!verifyPassword(password, user.passwordHash)) throw new ApiError(401, "LOGIN_PASSWORD_INCORRECT", "The password is incorrect.");
      const publicUser = await this.store.getUser(user.id);
      return jsonResponse(200, { ...await this.issueTokens(user.id), user: toMeResponse(publicUser, await this.store.usage(user.id)) });
    }
    if (method === "POST" && path === `${API_PREFIX}/auth/refresh`) {
      const input = body();
      if (typeof input.refreshToken !== "string") throw unauthorized();
      try {
        const refreshToken = await this.store.rotateRefreshSession(input.refreshToken, this.refreshTokenTtlSeconds);
        const user = await this.userForRotatedSession(refreshToken);
        return jsonResponse(200, { ...await this.issueTokens(user.id, refreshToken), user: toMeResponse(user, await this.store.usage(user.id)) });
      } catch (error) {
        if (error instanceof ApiError) throw unauthorized();
        throw error;
      }
    }
    if (method === "POST" && path === `${API_PREFIX}/auth/logout`) {
      const input = body();
      if (typeof input.refreshToken === "string") await this.store.revokeRefreshSession(input.refreshToken);
      return emptyResponse(204);
    }
    if (method === "POST" && path === `${API_PREFIX}/auth/password/forgot`) {
      rateLimited("password-forgot");
      const input = body();
      const email = requireEmail(input.email);
      const user = await this.store.getUserForLogin(email);
      if (user && !user.disabledAt && this.passwordResetMailer) {
        const token = await this.store.createPasswordResetToken(user.id);
        await this.passwordResetMailer({ user: await this.store.getUser(user.id), token });
      }
      // The response is deliberately identical for present and absent accounts.
      return emptyResponse(202);
    }
    if (method === "POST" && path === `${API_PREFIX}/auth/password/reset`) {
      rateLimited("password-reset");
      const input = body();
      if (typeof input.token !== "string") throw unauthorized();
      const userId = await this.store.consumePasswordResetToken(input.token);
      await this.store.setPassword(userId, requirePassword(input.password));
      return emptyResponse(204);
    }
    if (method === "GET" && path === `${API_PREFIX}/me`) {
      const user = await this.requireUser(request.headers);
      return jsonResponse(200, toMeResponse(user, await this.store.usage(user.id)));
    }
    if (method === "POST" && path === `${API_PREFIX}/me/account-deletion`) {
      rateLimited("account-deletion");
      const user = await this.requireUser(request.headers);
      const result = await this.store.requestAccountDeletion(user.id);
      return jsonResponse(202, result);
    }

    if (method === "GET" && path === `${API_PREFIX}/label-categories`) {
      const user = await this.requireUser(request.headers);
      const categories = await this.store.listLabelCategories(user.id);
      return jsonResponse(200, { items: categories.map(toPublicLabelCategory) });
    }
    if (method === "POST" && path === `${API_PREFIX}/label-categories`) {
      const user = await this.requireUser(request.headers);
      const input = body();
      return jsonResponse(201, toPublicLabelCategory(await this.store.createLabelCategory(user.id, input.name)));
    }
    const categoryMatch = /^\/api\/v1\/label-categories\/([^/]+)$/.exec(path);
    if (categoryMatch && method === "DELETE") {
      const user = await this.requireUser(request.headers);
      await this.store.deleteLabelCategory(user.id, decodeURIComponent(categoryMatch[1]));
      return emptyResponse(204);
    }

    if (method === "GET" && path === `${API_PREFIX}/labels`) {
      const user = await this.requireUser(request.headers);
      const status = url.searchParams.get("status") ?? "active";
      if (status !== "active" && status !== "trash") throw badRequest("INVALID_LABEL_STATUS", "Status must be active or trash.");
      const limit = parseLimit(url.searchParams.get("limit"));
      const listed = await this.store.listLabels(user.id, { status, query: url.searchParams.get("query") ?? undefined, sort: url.searchParams.get("sort") ?? undefined, cursor: url.searchParams.get("cursor") ?? undefined, limit });
      const includeContent = url.searchParams.get("includeContent") === "true";
      return jsonResponse(200, {
        items: listed.items.map(includeContent ? toPublicLabel : toPublicLabelSummary),
        nextCursor: listed.nextCursor,
      });
    }
    if (method === "POST" && path === `${API_PREFIX}/labels`) {
      const user = await this.requireUser(request.headers);
      const input = body();
      return jsonResponse(201, toPublicLabel(await this.store.createLabel(user.id, input.name, input.content)));
    }

    const labelMatch = /^\/api\/v1\/labels\/([^/]+)(?:\/(name|category|duplicate|restore|permanent))?$/.exec(path);
    if (labelMatch) {
      const user = await this.requireUser(request.headers);
      const labelId = decodeURIComponent(labelMatch[1]);
      const action = labelMatch[2];
      if (!action && method === "GET") return jsonResponse(200, toPublicLabel(await this.store.getLabel(user.id, labelId)));
      if (!action && method === "PUT") {
        const input = body();
        return jsonResponse(200, toPublicLabel(await this.store.updateLabel(user.id, labelId, input.expectedRevision, input.content)));
      }
      if (!action && method === "DELETE") { await this.store.moveToTrash(user.id, labelId); return emptyResponse(204); }
      if (action === "name" && method === "PATCH") {
        const input = body();
        return jsonResponse(200, toPublicLabelSummary(await this.store.renameLabel(user.id, labelId, input.name, input.expectedRevision)));
      }
      if (action === "category" && method === "PATCH") {
        const input = body();
        return jsonResponse(200, toPublicLabelSummary(await this.store.setLabelCategory(user.id, labelId, input.categoryId, input.expectedRevision)));
      }
      if (action === "duplicate" && method === "POST") {
        const input = body();
        return jsonResponse(201, toPublicLabel(await this.store.duplicateLabel(user.id, labelId, input.name)));
      }
      if (action === "restore" && method === "POST") { await this.store.restoreLabel(user.id, labelId); return emptyResponse(204); }
      if (action === "permanent" && method === "DELETE") { await this.store.permanentlyDeleteLabel(user.id, labelId); return emptyResponse(204); }
    }

    if (method === "POST" && path === `${API_PREFIX}/assets/initiate`) {
      rateLimited("asset-initiate");
      const user = await this.requireUser(request.headers);
      const input = body();
      const initiated = await this.store.initiateAsset(user.id, input);
      const upload = !initiated.reused && this.objectStorage ? await this.objectStorage.createUploadUrl(initiated.asset) : null;
      return jsonResponse(201, {
        asset: toPublicAsset(initiated.asset), reused: initiated.reused,
        uploadUrl: upload?.url ?? initiated.uploadUrl, uploadHeaders: upload?.headers,
        expiresAt: upload?.expiresAt ?? null,
      });
    }
    const assetMatch = /^\/api\/v1\/assets\/([^/]+)(?:\/(complete|upload|download))?$/.exec(path);
    if (assetMatch) {
      const user = await this.requireUser(request.headers);
      const assetId = decodeURIComponent(assetMatch[1]);
      if (!assetMatch[2] && method === "GET") {
        const asset = await this.store.getAsset(user.id, assetId);
        const download = this.objectStorage ? await this.objectStorage.createDownloadUrl(asset) : null;
        return jsonResponse(200, {
          asset: toPublicAsset(asset), downloadUrl: download?.url ?? `${API_PREFIX}/assets/${asset.id}/download`,
          expiresAt: download?.expiresAt ?? new Date(Date.now() + 5 * 60_000).toISOString(),
        });
      }
      if (assetMatch[2] === "upload" && method === "PUT" && !this.objectStorage && this.localAssetStorage) {
        const asset = await this.store.getAssetForCompletion(user.id, assetId);
        if (asset.state !== "initiated") throw badRequest("ASSET_NOT_INITIATED", "Only initiated assets can be uploaded.");
        const suppliedMimeType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
        if (suppliedMimeType !== asset.mimeType) throw badRequest("ASSET_MIME_MISMATCH", "Upload Content-Type does not match the authorized asset.");
        if (!request.rawBytes) throw badRequest("ASSET_UPLOAD_INVALID", "Asset upload requires binary request data.");
        await this.localAssetStorage.put(asset, request.rawBytes);
        return emptyResponse(204);
      }
      if (assetMatch[2] === "download" && method === "GET" && !this.objectStorage && this.localAssetStorage) {
        const asset = await this.store.getAsset(user.id, assetId);
        const bytes = await this.localAssetStorage.read(asset);
        return binaryResponse(200, bytes, asset.mimeType);
      }
      if (assetMatch[2] === "complete" && method === "POST") {
        if (this.objectStorage) await this.objectStorage.assertUploaded(await this.store.getAssetForCompletion(user.id, assetId));
        else if (this.localAssetStorage) await this.localAssetStorage.assertUploaded(await this.store.getAssetForCompletion(user.id, assetId));
        return jsonResponse(200, { asset: toPublicAsset(await this.store.completeAsset(user.id, assetId)) });
      }
      if (!assetMatch[2] && method === "DELETE") {
        const asset = await this.store.getAssetForCompletion(user.id, assetId);
        if (this.objectStorage) await this.objectStorage.delete(asset);
        await this.store.deleteAsset(user.id, assetId);
        if (this.localAssetStorage) await this.localAssetStorage.delete(asset);
        return emptyResponse(204);
      }
    }

    if (method === "GET" && path === `${API_PREFIX}/official-templates`) {
      await this.requireUser(request.headers);
      return jsonResponse(200, { items: await this.store.listOfficialTemplates() });
    }
    const templateMatch = /^\/api\/v1\/official-templates\/([^/]+)(?:\/(create-label))?$/.exec(path);
    if (templateMatch) {
      const user = await this.requireUser(request.headers);
      const templateId = decodeURIComponent(templateMatch[1]);
      if (!templateMatch[2] && method === "GET") return jsonResponse(200, toPublicTemplate(await this.store.getOfficialTemplate(user.id, templateId)));
      if (templateMatch[2] === "create-label" && method === "POST") {
        const input = body();
        return jsonResponse(201, toPublicLabel(await this.store.createLabelFromTemplate(user.id, templateId, input.name)));
      }
    }

    const updateMatch = /^\/api\/v1\/desktop-updates\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path);
    if (method === "GET" && updateMatch) {
      rateLimited("desktop-update");
      const release = await this.store.findDesktopUpdate({
        target: decodeURIComponent(updateMatch[1]), arch: decodeURIComponent(updateMatch[2]), currentVersion: decodeURIComponent(updateMatch[3]),
        channel: url.searchParams.get("channel") === "beta" ? "beta" : "stable",
        clientId: request.headers["x-release-client-id"] ?? clientAddress,
      });
      return release ? jsonResponse(200, toUpdaterResponse(release)) : emptyResponse(204);
    }

    throw new ApiError(404, "ROUTE_NOT_FOUND", "The requested API route was not found.");
  }

  /**
   * A forwarded address is accepted only when the immediate TCP peer has been
   * configured as a trusted proxy. This keeps a public caller from evading
   * per-client rate limits by sending its own X-Forwarded-For header.
   */
  private clientAddress(request: { headers: Record<string, string | undefined>; remoteAddress: string }): string {
    const peer = normalizeIpAddress(request.remoteAddress);
    if (!this.trustedProxyIps.has(peer)) return peer;
    return forwardedClientAddress(request.headers["x-forwarded-for"]) ?? peer;
  }

  private async issueTokens(userId: string, refreshToken?: string): Promise<SessionTokens> {
    return {
      accessToken: signAccessToken(userId, this.accessTokenSecret, this.accessTokenTtlSeconds),
      refreshToken: refreshToken ?? await this.store.createRefreshSession(userId, this.refreshTokenTtlSeconds),
      tokenType: "Bearer", expiresIn: this.accessTokenTtlSeconds,
    };
  }

  private async userForRotatedSession(refreshToken: string): Promise<UserProfile> {
    // Store owns token validation. This lookup intentionally only derives the identity after rotation.
    const userId = await this.store.getRefreshSessionUserId(refreshToken);
    return this.store.getUser(userId);
  }

  private async requireUser(headers: Record<string, string | undefined>): Promise<UserProfile> {
    const header = headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    const userId = token ? verifyAccessToken(token, this.accessTokenSecret) : null;
    if (!userId) throw unauthorized();
    try { return await this.store.getUser(userId); } catch { throw unauthorized(); }
  }

  private withCors(response: Omit<InjectResponse, "json">, origin: string | undefined): Omit<InjectResponse, "json"> {
    if (!origin || !this.allowedOrigins.has(origin)) return response;
    return {
      ...response,
      headers: {
        ...response.headers,
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "access-control-allow-headers": "Authorization, Content-Type, Accept",
        "access-control-max-age": "600",
        vary: "Origin",
      },
    };
  }
}

function parseJsonBody(rawBody: string): JsonObject {
  if (Buffer.byteLength(rawBody, "utf8") > MAX_JSON_BODY_BYTES) throw new ApiError(413, "REQUEST_TOO_LARGE", "Request body is too large.");
  if (!rawBody) return {};
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
    return parsed as JsonObject;
  } catch {
    throw badRequest("INVALID_JSON", "Request body must be a JSON object.");
  }
}

function parseBillingWebhookEvent(input: JsonObject): BillingWebhookEvent {
  const provider = requiredBillingText(input.provider, "INVALID_BILLING_EVENT", 80);
  const eventId = requiredBillingText(input.eventId, "INVALID_BILLING_EVENT", 200);
  const type = input.type;
  if (type !== "subscription_activated" && type !== "subscription_renewed" && type !== "subscription_cancelled" && type !== "subscription_refunded") {
    throw badRequest("INVALID_BILLING_EVENT", "Billing event type is invalid.");
  }
  const userId = requiredBillingText(input.userId, "INVALID_BILLING_EVENT", 64);
  if (!isUuid(userId)) {
    throw badRequest("INVALID_BILLING_EVENT", "Billing event user id is invalid.");
  }
  if (input.plan !== "free" && input.plan !== "pro") throw badRequest("INVALID_BILLING_EVENT", "Billing event plan is invalid.");
  const occurredAt = requiredBillingTimestamp(input.occurredAt, "occurredAt");
  const planExpiresAt = input.planExpiresAt === null || input.planExpiresAt === undefined
    ? null
    : requiredBillingTimestamp(input.planExpiresAt, "planExpiresAt");
  if (input.plan === "pro" && !planExpiresAt) {
    throw badRequest("INVALID_BILLING_EVENT", "A pro billing event requires a subscription expiry.");
  }
  return { provider, eventId, type: type as BillingEventType, userId, plan: input.plan, planExpiresAt, occurredAt };
}

function parseDesktopRelease(input: JsonObject): DesktopRelease {
  const id = requiredBillingText(input.id, "INVALID_DESKTOP_RELEASE", 100);
  if (!isUuid(id)) throw badRequest("INVALID_DESKTOP_RELEASE", "Desktop release id must be a UUID.");
  const version = requiredBillingText(input.version, "INVALID_DESKTOP_RELEASE", 80);
  if (!isSemver(version)) throw badRequest("INVALID_DESKTOP_RELEASE", "Desktop release version must use SemVer.");
  const channel = input.channel;
  if (channel !== "stable" && channel !== "beta") throw badRequest("INVALID_DESKTOP_RELEASE", "Desktop release channel is invalid.");
  const target = requiredBillingText(input.target, "INVALID_DESKTOP_RELEASE", 80);
  const arch = requiredBillingText(input.arch, "INVALID_DESKTOP_RELEASE", 80);
  const artifactUrl = requiredBillingText(input.artifactUrl, "INVALID_DESKTOP_RELEASE", 2_000);
  try {
    const parsed = new URL(artifactUrl);
    if (parsed.protocol !== "https:") throw new Error("non-https");
  } catch {
    throw badRequest("INVALID_DESKTOP_RELEASE", "Desktop release artifact URL must use HTTPS.");
  }
  const artifactSignature = requiredBillingText(input.artifactSignature, "INVALID_DESKTOP_RELEASE", 20_000);
  const artifactSha256 = requiredBillingText(input.artifactSha256, "INVALID_DESKTOP_RELEASE", 64);
  if (!/^[0-9a-f]{64}$/i.test(artifactSha256)) throw badRequest("INVALID_DESKTOP_RELEASE", "Desktop release SHA-256 is invalid.");
  if (typeof input.artifactSize !== "number" || !Number.isInteger(input.artifactSize) || input.artifactSize < 1) {
    throw badRequest("INVALID_DESKTOP_RELEASE", "Desktop release artifact size is invalid.");
  }
  if (typeof input.releaseNotes !== "string" || input.releaseNotes.length > 20_000) {
    throw badRequest("INVALID_DESKTOP_RELEASE", "Desktop release notes are invalid.");
  }
  const minimumSupportedVersion = input.minimumSupportedVersion === null || input.minimumSupportedVersion === undefined
    ? null
    : requiredBillingText(input.minimumSupportedVersion, "INVALID_DESKTOP_RELEASE", 80);
  if (minimumSupportedVersion && !isSemver(minimumSupportedVersion)) throw badRequest("INVALID_DESKTOP_RELEASE", "Minimum supported version must use SemVer.");
  if (typeof input.mandatory !== "boolean") throw badRequest("INVALID_DESKTOP_RELEASE", "Desktop release mandatory flag is invalid.");
  if (typeof input.rolloutPercent !== "number" || !Number.isInteger(input.rolloutPercent) || input.rolloutPercent < 0 || input.rolloutPercent > 100) {
    throw badRequest("INVALID_DESKTOP_RELEASE", "Desktop release rollout percentage is invalid.");
  }
  const publishedAt = input.publishedAt === null || input.publishedAt === undefined ? null : requiredBillingTimestamp(input.publishedAt, "publishedAt");
  const createdAt = input.createdAt === undefined ? new Date().toISOString() : requiredBillingTimestamp(input.createdAt, "createdAt");
  return { id, version, channel, target, arch, artifactUrl, artifactSignature, artifactSha256: artifactSha256.toLowerCase(), artifactSize: input.artifactSize, releaseNotes: input.releaseNotes, minimumSupportedVersion, mandatory: input.mandatory, rolloutPercent: input.rolloutPercent, publishedAt, createdAt };
}

function requiredBillingText(value: unknown, code: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw badRequest(code, "Billing event text field is invalid.");
  }
  return value.trim();
}

function requiredBillingTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw badRequest("INVALID_BILLING_EVENT", `Billing event ${field} is invalid.`);
  }
  return new Date(value).toISOString();
}

function isRecentWebhookTimestamp(value: string | undefined): boolean {
  if (!value || !/^\d{10,13}$/.test(value)) return false;
  const raw = Number(value);
  const milliseconds = value.length === 10 ? raw * 1000 : raw;
  return Number.isSafeInteger(milliseconds) && Math.abs(Date.now() - milliseconds) <= 5 * 60 * 1000;
}

function isSemver(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseLimit(value: string | null): number {
  if (!value) return 50;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw badRequest("INVALID_LIMIT", "Limit must be an integer from 1 to 100.");
  return parsed;
}

function optionalDisplayName(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim().length > 120) throw badRequest("INVALID_DISPLAY_NAME", "Display name must contain at most 120 characters.");
  return value;
}

function normalizeHeaders(headers: Record<string, string | string[] | number | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(",") : value === undefined ? undefined : String(value)]));
}

async function readRawBody(request: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_ASSET_BYTES) throw new ApiError(413, "REQUEST_TOO_LARGE", "Request body is too large.");
    parts.push(part);
  }
  return Buffer.concat(parts);
}

function jsonResponse(status: number, value: unknown): Omit<InjectResponse, "json"> {
  const body = JSON.stringify(value);
  return { status, headers: { "content-type": "application/json; charset=utf-8", "content-length": String(Buffer.byteLength(body)) }, body };
}

function emptyResponse(status: number): Omit<InjectResponse, "json"> { return { status, headers: {}, body: "" }; }

function binaryResponse(status: number, body: Buffer, mimeType: string): Omit<InjectResponse, "json"> {
  return {
    status,
    headers: {
      "content-type": mimeType,
      "content-length": String(body.byteLength),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
    body,
  };
}

function textResponse(status: number, body: string, contentType: string): Omit<InjectResponse, "json"> {
  return { status, headers: { "content-type": contentType, "content-length": String(Buffer.byteLength(body)) }, body };
}

function toPublicLabel(label: LabelDocument) {
  const { userId: _userId, ...publicLabel } = label;
  return publicLabel;
}

function toPublicLabelSummary(label: LabelDocument) {
  const { content: _content, ...summary } = toPublicLabel(label);
  return summary;
}

function toPublicLabelCategory(category: import("./types.js").LabelCategory) {
  const { userId: _userId, ...publicCategory } = category;
  return publicCategory;
}

function toMeResponse(user: UserProfile, labelUsage: { used: number; limit: number; canCreate: boolean }) {
  return { id: user.id, displayName: user.displayName, plan: user.plan, planExpiresAt: user.planExpiresAt, labelUsage };
}

function toPublicAsset(asset: LabelAsset) {
  const { objectKey: _objectKey, ...publicAsset } = asset;
  return publicAsset;
}

function toPublicTemplate(template: OfficialTemplate) {
  const { previewUrl, ...publicTemplate } = template;
  return { ...publicTemplate, previewUrl };
}

function toUpdaterResponse(release: DesktopRelease) {
  return {
    version: release.version,
    pub_date: release.publishedAt,
    url: release.artifactUrl,
    signature: release.artifactSignature,
    notes: release.releaseNotes,
    artifact_size: release.artifactSize,
    // Tauri ignores unknown properties but preserves them in Update.rawJson for the desktop UI.
    minimum_supported_version: release.minimumSupportedVersion,
    mandatory: release.mandatory,
  };
}
