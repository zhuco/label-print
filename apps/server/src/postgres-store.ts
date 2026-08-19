import { randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { CloudStore, DueAccountDeletion } from "./cloud-store.js";
import { hashPassword, randomToken, sha256 } from "./crypto.js";
import { ApiError, conflict, forbidden, notFound } from "./errors.js";
import { ACCOUNT_DELETION_GRACE_DAYS, effectivePlan, MAX_ASSET_BYTES, SAFE_IMAGE_MIME_TYPES, type UserRecord } from "./store.js";
import { collectAssetReferences, parseCloudLabelContent, requireCategoryName, requireName } from "./validation.js";
import {
  PLAN_LABEL_LIMITS,
  type BillingEventApplyResult,
  type BillingWebhookEvent,
  type AssetKind,
  type AssetState,
  type CloudLabelContentV1,
  type DesktopRelease,
  type LabelAsset,
  type LabelCategory,
  type LabelDocument,
  type OfficialTemplate,
  type PlanCode,
  type UserProfile,
} from "./types.js";

type PgResult<T extends QueryResultRow = QueryResultRow> = { rows: T[]; rowCount: number | null };
type PgQueryable = { query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<PgResult<T>> };
type PgPool = PgQueryable & { connect(): Promise<PoolClient>; end(): Promise<void> };

export type PostgresStoreOptions = {
  connectionString?: string;
  pool?: PgPool;
};

type UserRow = QueryResultRow & {
  id: string; email: string; password_hash: string; disabled_at: Date | string | null;
  deletion_requested_at: Date | string | null; deletion_scheduled_for: Date | string | null;
  display_name: string | null; plan_code: PlanCode; plan_expires_at: Date | string | null;
  subscription_updated_at: Date | string | null;
  created_at: Date | string; updated_at: Date | string;
};
type LabelRow = QueryResultRow & {
  id: string; user_id: string; name: string; category_id: string | null; schema_version: number; content: CloudLabelContentV1 | string;
  revision: number | string; created_at: Date | string; updated_at: Date | string;
  deleted_at: Date | string | null; last_opened_at: Date | string | null;
};
type LabelCategoryRow = QueryResultRow & { id: string; user_id: string; name: string; created_at: Date | string };
type AssetRow = QueryResultRow & {
  id: string; user_id: string; mime_type: string; kind: AssetKind; object_key: string; sha256: string;
  byte_size: number | string; upload_state: AssetState; created_at: Date | string;
  completed_at: Date | string | null; deleted_at: Date | string | null;
};
type TemplateRow = QueryResultRow & {
  id: string; code: string; name: string; description: string; category: string; required_plan: PlanCode;
  schema_version: number; content: CloudLabelContentV1 | string; preview_object_key: string | null;
  enabled: boolean; sort_order: number; created_at: Date | string; updated_at: Date | string;
};
type TemplateSummaryRow = Omit<TemplateRow, "content">;
type ReleaseRow = QueryResultRow & {
  id: string; version: string; channel: "stable" | "beta"; target: string; arch: string;
  artifact_url: string; artifact_signature: string; artifact_sha256: string; artifact_size: number | string;
  release_notes: string; minimum_supported_version: string | null; mandatory: boolean; rollout_percent: number;
  published_at: Date | string | null; created_at: Date | string;
};

/** PostgreSQL-backed production repository. Every user-owned read/write is scoped by user_id. */
export class PostgresStore implements CloudStore {
  private readonly pool: PgPool;
  private readonly ownsPool: boolean;

  constructor(options: PostgresStoreOptions = {}) {
    if (options.pool) {
      this.pool = options.pool;
      this.ownsPool = false;
      return;
    }
    if (!options.connectionString) throw new Error("PostgresStore requires DATABASE_URL.");
    this.pool = new Pool({ connectionString: options.connectionString });
    this.ownsPool = true;
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }

  async createUser(email: string, password: string, displayName?: string): Promise<UserProfile> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const id = randomUUID();
      const created = await client.query<UserRow>(
        `INSERT INTO auth_users (id, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, password_hash, disabled_at, created_at, updated_at`,
        [id, email, hashPassword(password)],
      );
      await client.query(
        `INSERT INTO user_profiles (user_id, display_name) VALUES ($1, $2)`,
        [id, displayName?.trim() || null],
      );
      await client.query("COMMIT");
      return toUserProfile({ ...created.rows[0], display_name: displayName?.trim() || null, plan_code: "free", plan_expires_at: null, subscription_updated_at: new Date() });
    } catch (error) {
      await rollback(client);
      if (isUniqueViolation(error)) throw conflict("EMAIL_ALREADY_REGISTERED", "This email is already registered.");
      throw error;
    } finally { client.release(); }
  }

  async getUserForLogin(email: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRow>(userSelect("WHERE u.email = $1"), [email]);
    return result.rows[0] ? toUserRecord(result.rows[0]) : undefined;
  }

  async getUser(userId: string): Promise<UserProfile> {
    const result = await this.pool.query<UserRow>(userSelect("WHERE u.id = $1 AND u.disabled_at IS NULL"), [userId]);
    if (!result.rows[0]) throw notFound("USER_NOT_FOUND", "User was not found.");
    return toUserProfile(result.rows[0]);
  }

  async requestAccountDeletion(userId: string): Promise<{ scheduledFor: string }> {
    const requestedAt = new Date();
    const scheduledFor = new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    return this.withTransaction(async (client) => {
      const updated = await client.query<QueryResultRow & { deletion_scheduled_for: Date | string }>(
        `UPDATE auth_users
         SET disabled_at = $2, deletion_requested_at = $2, deletion_scheduled_for = $3, updated_at = $2
         WHERE id = $1 AND disabled_at IS NULL
         RETURNING deletion_scheduled_for`,
        [userId, requestedAt.toISOString(), scheduledFor.toISOString()],
      );
      if (!updated.rows[0]) throw notFound("USER_NOT_FOUND", "User was not found.");
      await client.query(
        `UPDATE auth_refresh_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId, requestedAt.toISOString()],
      );
      return { scheduledFor: iso(updated.rows[0].deletion_scheduled_for)! };
    });
  }

  async listDueAccountDeletions(now: string, limit: number): Promise<DueAccountDeletion[]> {
    const users = await this.pool.query<QueryResultRow & { id: string }>(
      `SELECT id FROM auth_users
       WHERE disabled_at IS NOT NULL AND deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for <= $1
       ORDER BY deletion_scheduled_for ASC LIMIT $2`,
      [now, limit],
    );
    if (!users.rows.length) return [];
    const userIds = users.rows.map((row) => row.id);
    const assets = await this.pool.query<AssetRow>(
      `SELECT id, user_id, mime_type, kind, object_key, sha256, byte_size, upload_state, created_at, completed_at, deleted_at
       FROM label_assets WHERE user_id = ANY($1::uuid[])`,
      [userIds],
    );
    const assetsByUser = new Map<string, LabelAsset[]>();
    for (const asset of assets.rows.map(toAsset)) {
      const values = assetsByUser.get(asset.userId) ?? [];
      values.push(asset);
      assetsByUser.set(asset.userId, values);
    }
    return userIds.map((userId) => ({ userId, assets: assetsByUser.get(userId) ?? [] }));
  }

  async purgeDueAccountDeletion(userId: string, now: string): Promise<boolean> {
    return this.withTransaction(async (client) => {
      const account = await client.query<QueryResultRow & { id: string }>(
        `SELECT id FROM auth_users
         WHERE id = $1 AND disabled_at IS NOT NULL AND deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for <= $2
         FOR UPDATE`,
        [userId, now],
      );
      if (!account.rows[0]) return false;
      await client.query(`DELETE FROM billing_webhook_events WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM label_documents WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM label_assets WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM user_profiles WHERE user_id = $1`, [userId]);
      const deleted = await client.query(`DELETE FROM auth_users WHERE id = $1`, [userId]);
      return deleted.rowCount === 1;
    });
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(`UPDATE auth_users SET password_hash = $2, updated_at = NOW() WHERE id = $1 AND disabled_at IS NULL`, [userId, hashPassword(password)]);
      if (updated.rowCount !== 1) throw notFound("USER_NOT_FOUND", "User was not found.");
      await client.query(`UPDATE auth_refresh_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      await client.query("COMMIT");
    } catch (error) { await rollback(client); throw error; } finally { client.release(); }
  }

  async setPlanFromSubscription(userId: string, plan: PlanCode, planExpiresAt: string | null = null): Promise<void> {
    const result = await this.pool.query(
      `UPDATE user_profiles SET plan_code = $2, plan_expires_at = $3, subscription_updated_at = NOW(), updated_at = NOW()
       WHERE user_id = $1`,
      [userId, plan, planExpiresAt],
    );
    if (result.rowCount !== 1) throw notFound("USER_NOT_FOUND", "User was not found.");
  }

  async applyBillingWebhookEvent(event: BillingWebhookEvent): Promise<BillingEventApplyResult> {
    return this.withTransaction(async (client) => {
      const account = await client.query<UserRow>(`${userSelect("WHERE u.id = $1 AND u.disabled_at IS NULL")} FOR UPDATE`, [event.userId]);
      if (!account.rows[0]) throw notFound("USER_NOT_FOUND", "User was not found.");
      const existing = await client.query(
        `SELECT 1 FROM billing_webhook_events WHERE provider = $1 AND event_id = $2`,
        [event.provider, event.eventId],
      );
      if (existing.rowCount) return { status: "duplicate", user: toUserProfile(account.rows[0]) };
      await client.query(
        `INSERT INTO billing_webhook_events (provider, event_id, user_id, event_type, plan_code, plan_expires_at, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (provider, event_id) DO NOTHING`,
        [event.provider, event.eventId, event.userId, event.type, event.plan, event.planExpiresAt, event.occurredAt],
      );
      const persisted = await client.query<QueryResultRow & { user_id: string }>(
        `SELECT user_id FROM billing_webhook_events WHERE provider = $1 AND event_id = $2`,
        [event.provider, event.eventId],
      );
      if (persisted.rows[0]?.user_id !== event.userId) return { status: "duplicate", user: toUserProfile(account.rows[0]) };
      const applied = await client.query(
        `UPDATE user_profiles
         SET plan_code = $2, plan_expires_at = $3, subscription_updated_at = $4, updated_at = NOW()
         WHERE user_id = $1 AND (subscription_updated_at IS NULL OR subscription_updated_at <= $4)`,
        [event.userId, event.plan, event.planExpiresAt, event.occurredAt],
      );
      const current = await client.query<UserRow>(userSelect("WHERE u.id = $1 AND u.disabled_at IS NULL"), [event.userId]);
      return { status: applied.rowCount ? "applied" : "stale", user: toUserProfile(current.rows[0]) };
    });
  }

  async createRefreshSession(userId: string, ttlSeconds: number): Promise<string> {
    await this.getUser(userId);
    return this.insertRefreshSession(this.pool, userId, ttlSeconds);
  }

  async rotateRefreshSession(token: string, ttlSeconds: number): Promise<string> {
    const parsed = parseOpaqueToken(token);
    if (!parsed) throw forbidden("INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked.");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<QueryResultRow & { user_id: string }>(
        `SELECT s.user_id FROM auth_refresh_sessions s
         JOIN auth_users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.token_hash = $2 AND s.revoked_at IS NULL
           AND s.expires_at > NOW() AND u.disabled_at IS NULL FOR UPDATE`,
        [parsed.id, sha256(parsed.secret)],
      );
      if (!found.rows[0]) throw forbidden("INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked.");
      await client.query(`UPDATE auth_refresh_sessions SET revoked_at = NOW() WHERE id = $1`, [parsed.id]);
      const next = await this.insertRefreshSession(client, found.rows[0].user_id, ttlSeconds);
      await client.query("COMMIT");
      return next;
    } catch (error) { await rollback(client); throw error; } finally { client.release(); }
  }

  async getRefreshSessionUserId(token: string): Promise<string> {
    const parsed = parseOpaqueToken(token);
    if (!parsed) throw forbidden("INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked.");
    const found = await this.pool.query<QueryResultRow & { user_id: string }>(
      `SELECT s.user_id FROM auth_refresh_sessions s JOIN auth_users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.token_hash = $2 AND s.revoked_at IS NULL
         AND s.expires_at > NOW() AND u.disabled_at IS NULL`,
      [parsed.id, sha256(parsed.secret)],
    );
    if (!found.rows[0]) throw forbidden("INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked.");
    return found.rows[0].user_id;
  }

  async revokeRefreshSession(token: string): Promise<void> {
    const parsed = parseOpaqueToken(token);
    if (!parsed) return;
    await this.pool.query(`UPDATE auth_refresh_sessions SET revoked_at = NOW() WHERE id = $1 AND token_hash = $2 AND revoked_at IS NULL`, [parsed.id, sha256(parsed.secret)]);
  }

  async createPasswordResetToken(userId: string, ttlSeconds = 15 * 60): Promise<string> {
    await this.getUser(userId);
    const token = randomToken();
    await this.pool.query(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [sha256(token), userId, new Date(Date.now() + ttlSeconds * 1000).toISOString()],
    );
    return token;
  }

  async consumePasswordResetToken(token: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<QueryResultRow & { user_id: string }>(
        `UPDATE password_reset_tokens SET used_at = NOW()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
         RETURNING user_id`,
        [sha256(token)],
      );
      if (!result.rows[0]) throw forbidden("INVALID_RESET_TOKEN", "Reset token is invalid or expired.");
      await client.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [result.rows[0].user_id]);
      await client.query("COMMIT");
      return result.rows[0].user_id;
    } catch (error) { await rollback(client); throw error; } finally { client.release(); }
  }

  async usage(userId: string): Promise<{ used: number; limit: number; canCreate: boolean }> {
    const user = await this.getUser(userId);
    const count = await this.pool.query<QueryResultRow & { count: string }>(`SELECT COUNT(*)::text AS count FROM label_documents WHERE user_id = $1`, [userId]);
    const used = Number(count.rows[0]?.count ?? 0);
    const limit = PLAN_LABEL_LIMITS[user.plan];
    return { used, limit, canCreate: used < limit };
  }

  async listLabelCategories(userId: string): Promise<LabelCategory[]> {
    await this.getUser(userId);
    const result = await this.pool.query<LabelCategoryRow>(
      "SELECT id, user_id, name, created_at FROM label_categories WHERE user_id = $1 ORDER BY name, id",
      [userId],
    );
    return result.rows.map(toLabelCategory);
  }

  async createLabelCategory(userId: string, nameInput: unknown): Promise<LabelCategory> {
    const name = requireCategoryName(nameInput);
    await this.getUser(userId);
    try {
      const result = await this.pool.query<LabelCategoryRow>(
        "INSERT INTO label_categories (id, user_id, name) VALUES ($1, $2, $3) RETURNING id, user_id, name, created_at",
        [randomUUID(), userId, name],
      );
      return toLabelCategory(result.rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("CATEGORY_NAME_EXISTS", "A category with this name already exists.");
      throw error;
    }
  }

  async deleteLabelCategory(userId: string, categoryId: string): Promise<void> {
    const result = await this.pool.query("DELETE FROM label_categories WHERE id = $1 AND user_id = $2", [categoryId, userId]);
    if (result.rowCount !== 1) throw notFound("CATEGORY_NOT_FOUND", "Category was not found.");
  }

  async listLabels(userId: string, options: { status: "active" | "trash"; query?: string; sort?: string; cursor?: string; limit: number }): Promise<{ items: LabelDocument[]; nextCursor: string | null }> {
    await this.getUser(userId);
    const offset = decodeCursor(options.cursor);
    const values: unknown[] = [userId];
    const predicates = ["user_id = $1", options.status === "trash" ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
    if (options.query?.trim()) {
      values.push(`%${options.query.trim()}%`);
      predicates.push(`name ILIKE $${values.length}`);
    }
    values.push(options.limit + 1, offset);
    const sort = labelOrderSql(options.sort);
    const result = await this.pool.query<LabelRow>(
      `SELECT id, user_id, name, category_id, schema_version, content, revision, created_at, updated_at, deleted_at, last_opened_at
       FROM label_documents WHERE ${predicates.join(" AND ")}
       ORDER BY ${sort} LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > options.limit;
    const items = result.rows.slice(0, options.limit).map(toLabel);
    return { items, nextCursor: hasMore ? encodeCursor(offset + items.length) : null };
  }

  async getLabel(userId: string, labelId: string): Promise<LabelDocument> {
    const result = await this.pool.query<LabelRow>(labelSelect("WHERE id = $1 AND user_id = $2"), [labelId, userId]);
    if (!result.rows[0]) throw notFound("LABEL_NOT_FOUND", "Label was not found.");
    return toLabel(result.rows[0]);
  }

  async createLabel(userId: string, nameInput: unknown, contentInput: unknown): Promise<LabelDocument> {
    const content = parseCloudLabelContent(contentInput);
    const name = requireName(nameInput);
    return this.withTransaction(async (client) => {
      await this.assertCanCreateLocked(client, userId);
      await this.assertOwnedCompletedAssets(client, userId, content);
      const id = randomUUID();
      const inserted = await client.query<LabelRow>(
        `INSERT INTO label_documents (id, user_id, name, category_id, schema_version, content)
         VALUES ($1, $2, $3, NULL, $4, $5::jsonb)
         RETURNING id, user_id, name, category_id, schema_version, content, revision, created_at, updated_at, deleted_at, last_opened_at`,
        [id, userId, name, content.version, JSON.stringify(content)],
      );
      await syncLabelAssetRelations(client, id, collectAssetReferences(content));
      return toLabel(inserted.rows[0]);
    });
  }

  async updateLabel(userId: string, labelId: string, expectedRevision: unknown, contentInput: unknown): Promise<LabelDocument> {
    if (!isRevision(expectedRevision)) throw conflict("REVISION_CONFLICT", "An expected revision is required to update a label.");
    const content = parseCloudLabelContent(contentInput);
    return this.withTransaction(async (client) => {
      await this.assertOwnedCompletedAssets(client, userId, content);
      const updated = await client.query<LabelRow>(
        `UPDATE label_documents SET content = $4::jsonb, schema_version = $5, revision = revision + 1, updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND revision = $3
         RETURNING id, user_id, name, category_id, schema_version, content, revision, created_at, updated_at, deleted_at, last_opened_at`,
        [labelId, userId, expectedRevision, JSON.stringify(content), content.version],
      );
      if (!updated.rows[0]) await this.throwLabelUpdateError(client, userId, labelId);
      await syncLabelAssetRelations(client, labelId, collectAssetReferences(content));
      return toLabel(updated.rows[0]!);
    });
  }

  async renameLabel(userId: string, labelId: string, nameInput: unknown, expectedRevision: unknown): Promise<LabelDocument> {
    if (!isRevision(expectedRevision)) throw conflict("REVISION_CONFLICT", "An expected revision is required to update a label.");
    const result = await this.pool.query<LabelRow>(
      `UPDATE label_documents SET name = $4, revision = revision + 1, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND revision = $3
       RETURNING id, user_id, name, category_id, schema_version, content, revision, created_at, updated_at, deleted_at, last_opened_at`,
      [labelId, userId, expectedRevision, requireName(nameInput)],
    );
    if (!result.rows[0]) await this.throwLabelUpdateError(this.pool, userId, labelId);
    return toLabel(result.rows[0]!);
  }

  async setLabelCategory(userId: string, labelId: string, categoryIdInput: unknown, expectedRevision: unknown): Promise<LabelDocument> {
    if (!isRevision(expectedRevision)) throw conflict("REVISION_CONFLICT", "An expected revision is required to update a label.");
    const categoryId = categoryIdInput === null ? null : typeof categoryIdInput === "string" ? categoryIdInput : undefined;
    if (categoryId === undefined) throw new ApiError(400, "INVALID_CATEGORY", "Category must be a category ID or null.");
    if (categoryId) {
      const category = await this.pool.query("SELECT 1 FROM label_categories WHERE id = $1 AND user_id = $2", [categoryId, userId]);
      if (!category.rowCount) throw notFound("CATEGORY_NOT_FOUND", "Category was not found.");
    }
    const result = await this.pool.query<LabelRow>(
      `UPDATE label_documents SET category_id = $4, revision = revision + 1, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND revision = $3
       RETURNING id, user_id, name, category_id, schema_version, content, revision, created_at, updated_at, deleted_at, last_opened_at`,
      [labelId, userId, expectedRevision, categoryId],
    );
    if (!result.rows[0]) await this.throwLabelUpdateError(this.pool, userId, labelId);
    return toLabel(result.rows[0]!);
  }

  async duplicateLabel(userId: string, labelId: string, nameInput?: unknown): Promise<LabelDocument> {
    return this.withTransaction(async (client) => {
      await this.assertCanCreateLocked(client, userId);
      const source = await client.query<LabelRow>(labelSelect("WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE"), [labelId, userId]);
      if (!source.rows[0]) throw notFound("LABEL_NOT_FOUND", "Label was not found.");
      const sourceLabel = toLabel(source.rows[0]);
      const id = randomUUID();
      const inserted = await client.query<LabelRow>(
        `INSERT INTO label_documents (id, user_id, name, category_id, schema_version, content)
         VALUES ($1, $2, $3, NULL, $4, $5::jsonb)
         RETURNING id, user_id, name, category_id, schema_version, content, revision, created_at, updated_at, deleted_at, last_opened_at`,
        [id, userId, nameInput === undefined ? `${sourceLabel.name} (copy)` : requireName(nameInput), sourceLabel.schemaVersion, JSON.stringify(sourceLabel.content)],
      );
      await syncLabelAssetRelations(client, id, collectAssetReferences(sourceLabel.content));
      return toLabel(inserted.rows[0]);
    });
  }

  async moveToTrash(userId: string, labelId: string): Promise<void> {
    const result = await this.pool.query(`UPDATE label_documents SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [labelId, userId]);
    if (result.rowCount !== 1) throw notFound("LABEL_NOT_FOUND", "Label was not found.");
  }

  async restoreLabel(userId: string, labelId: string): Promise<void> {
    const owned = await this.pool.query<QueryResultRow & { deleted_at: Date | string | null }>(`SELECT deleted_at FROM label_documents WHERE id = $1 AND user_id = $2`, [labelId, userId]);
    if (!owned.rows[0]) throw notFound("LABEL_NOT_FOUND", "Label was not found.");
    if (!owned.rows[0].deleted_at) throw conflict("LABEL_NOT_IN_TRASH", "Only trashed labels can be restored.");
    await this.pool.query(`UPDATE label_documents SET deleted_at = NULL, updated_at = NOW() WHERE id = $1`, [labelId]);
  }

  async permanentlyDeleteLabel(userId: string, labelId: string): Promise<void> {
    const owned = await this.pool.query<QueryResultRow & { deleted_at: Date | string | null }>(`SELECT deleted_at FROM label_documents WHERE id = $1 AND user_id = $2`, [labelId, userId]);
    if (!owned.rows[0]) throw notFound("LABEL_NOT_FOUND", "Label was not found.");
    if (!owned.rows[0].deleted_at) throw conflict("LABEL_NOT_IN_TRASH", "Move a label to trash before permanently deleting it.");
    await this.pool.query(`DELETE FROM label_documents WHERE id = $1 AND user_id = $2`, [labelId, userId]);
  }

  async initiateAsset(userId: string, input: { mimeType?: unknown; kind?: unknown; sha256?: unknown; byteSize?: unknown }): Promise<{ asset: LabelAsset; reused: boolean; uploadUrl: string | null }> {
    await this.getUser(userId);
    const mimeType = typeof input.mimeType === "string" ? input.mimeType.toLowerCase() : "";
    const kind = input.kind as AssetKind;
    const digest = typeof input.sha256 === "string" ? input.sha256.toLowerCase() : "";
    const byteSize = input.byteSize;
    if (!SAFE_IMAGE_MIME_TYPES.has(mimeType) || (kind !== "image" && kind !== "icon")) throw badAsset("UNSUPPORTED_ASSET_MIME", "Only PNG, JPEG, and WebP images are accepted.");
    if (!/^[a-f0-9]{64}$/.test(digest)) throw badAsset("INVALID_ASSET_HASH", "Asset SHA-256 must be a lowercase hexadecimal digest.");
    if (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize < 1 || byteSize > MAX_ASSET_BYTES) throw new ApiError(413, "ASSET_TOO_LARGE", `Assets must be no larger than ${MAX_ASSET_BYTES} bytes.`);
    const existing = await this.pool.query<AssetRow>(assetSelect(`WHERE user_id = $1 AND sha256 = $2 AND mime_type = $3 AND upload_state = 'completed' AND deleted_at IS NULL`), [userId, digest, mimeType]);
    if (existing.rows[0]) return { asset: toAsset(existing.rows[0]), reused: true, uploadUrl: null };
    const id = randomUUID();
    const objectKey = `label-assets/${userId}/${randomUUID()}`;
    const created = await this.pool.query<AssetRow>(
      `INSERT INTO label_assets (id, user_id, mime_type, kind, object_key, sha256, byte_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, mime_type, kind, object_key, sha256, byte_size, upload_state, created_at, completed_at, deleted_at`,
      [id, userId, mimeType, kind, objectKey, digest, byteSize],
    );
    return { asset: toAsset(created.rows[0]), reused: false, uploadUrl: `/api/v1/assets/${id}/upload` };
  }

  async completeAsset(userId: string, assetId: string): Promise<LabelAsset> {
    const result = await this.pool.query<AssetRow>(
      `UPDATE label_assets SET upload_state = 'completed', completed_at = COALESCE(completed_at, NOW())
       WHERE id = $1 AND user_id = $2 AND upload_state <> 'deleted'
       RETURNING id, user_id, mime_type, kind, object_key, sha256, byte_size, upload_state, created_at, completed_at, deleted_at`,
      [assetId, userId],
    );
    if (!result.rows[0]) throw notFound("ASSET_NOT_FOUND", "Asset was not found.");
    return toAsset(result.rows[0]);
  }

  async getAssetForCompletion(userId: string, assetId: string): Promise<LabelAsset> {
    const result = await this.pool.query<AssetRow>(assetSelect("WHERE id = $1 AND user_id = $2 AND upload_state <> 'deleted' AND deleted_at IS NULL"), [assetId, userId]);
    if (!result.rows[0]) throw notFound("ASSET_NOT_FOUND", "Asset was not found.");
    return toAsset(result.rows[0]);
  }

  async getAsset(userId: string, assetId: string): Promise<LabelAsset> {
    const result = await this.pool.query<AssetRow>(assetSelect("WHERE id = $1 AND user_id = $2 AND upload_state = 'completed' AND deleted_at IS NULL"), [assetId, userId]);
    if (!result.rows[0]) throw notFound("ASSET_NOT_FOUND", "Asset was not found.");
    return toAsset(result.rows[0]);
  }

  async deleteAsset(userId: string, assetId: string): Promise<void> {
    const asset = await this.pool.query<AssetRow>(assetSelect("WHERE id = $1 AND user_id = $2"), [assetId, userId]);
    if (!asset.rows[0] || asset.rows[0].upload_state === "deleted") throw notFound("ASSET_NOT_FOUND", "Asset was not found.");
    const references = await this.pool.query(`SELECT 1 FROM label_document_assets WHERE asset_id = $1 LIMIT 1`, [assetId]);
    if (references.rowCount) throw conflict("ASSET_STILL_REFERENCED", "Asset is referenced by a label and cannot be deleted.");
    await this.pool.query(`UPDATE label_assets SET upload_state = 'deleted', deleted_at = NOW() WHERE id = $1`, [assetId]);
  }

  async addOfficialTemplate(template: OfficialTemplate): Promise<void> {
    parseCloudLabelContent(template.content);
    await this.pool.query(
      `INSERT INTO official_templates (id, code, name, description, category, required_plan, schema_version, content, preview_object_key, enabled, sort_order, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, category=EXCLUDED.category,
         required_plan=EXCLUDED.required_plan, schema_version=EXCLUDED.schema_version, content=EXCLUDED.content, preview_object_key=EXCLUDED.preview_object_key,
         enabled=EXCLUDED.enabled, sort_order=EXCLUDED.sort_order, updated_at=EXCLUDED.updated_at`,
      [template.id, template.code, template.name, template.description, template.category, template.requiredPlan, template.schemaVersion, JSON.stringify(template.content), template.previewUrl, template.enabled, template.sortOrder, template.createdAt, template.updatedAt],
    );
  }

  async listOfficialTemplates(): Promise<Array<Omit<OfficialTemplate, "content">>> {
    // Catalogue clients only need metadata. Do not read paid template bodies into the list path.
    const result = await this.pool.query<TemplateSummaryRow>(`SELECT id, code, name, description, category, required_plan, schema_version, preview_object_key, enabled, sort_order, created_at, updated_at FROM official_templates WHERE enabled = TRUE ORDER BY sort_order, name`);
    return result.rows.map(toTemplateSummary);
  }

  async getOfficialTemplate(userId: string, templateId: string): Promise<OfficialTemplate> {
    const user = await this.getUser(userId);
    const result = await this.pool.query<TemplateRow>(`SELECT id, code, name, description, category, required_plan, schema_version, content, preview_object_key, enabled, sort_order, created_at, updated_at FROM official_templates WHERE id = $1 AND enabled = TRUE`, [templateId]);
    if (!result.rows[0]) throw notFound("OFFICIAL_TEMPLATE_NOT_FOUND", "Official template was not found.");
    const template = toTemplate(result.rows[0]);
    if (template.requiredPlan === "pro" && user.plan !== "pro") throw forbidden();
    return template;
  }

  async createLabelFromTemplate(userId: string, templateId: string, nameInput: unknown): Promise<LabelDocument> {
    const template = await this.getOfficialTemplate(userId, templateId);
    return this.createLabel(userId, nameInput ?? template.name, template.content);
  }

  async addDesktopRelease(release: DesktopRelease): Promise<void> {
    if (!isSemver(release.version)) throw new Error(`Invalid release version: ${release.version}`);
    await this.pool.query(
      `INSERT INTO desktop_releases (id, version, channel, target, arch, artifact_url, artifact_signature, artifact_sha256, artifact_size, release_notes, minimum_supported_version, mandatory, rollout_percent, published_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (version, channel, target, arch) DO UPDATE SET artifact_url=EXCLUDED.artifact_url, artifact_signature=EXCLUDED.artifact_signature,
         artifact_sha256=EXCLUDED.artifact_sha256, artifact_size=EXCLUDED.artifact_size, release_notes=EXCLUDED.release_notes,
         minimum_supported_version=EXCLUDED.minimum_supported_version, mandatory=EXCLUDED.mandatory, rollout_percent=EXCLUDED.rollout_percent, published_at=EXCLUDED.published_at`,
      [release.id, release.version, release.channel, release.target, release.arch, release.artifactUrl, release.artifactSignature, release.artifactSha256, release.artifactSize, release.releaseNotes, release.minimumSupportedVersion, release.mandatory, release.rolloutPercent, release.publishedAt, release.createdAt],
    );
  }

  async findDesktopUpdate(input: { target: string; arch: string; currentVersion: string; channel: "stable" | "beta"; clientId: string }): Promise<DesktopRelease | null> {
    if (!isSemver(input.currentVersion)) return null;
    const releases = await this.pool.query<ReleaseRow>(`SELECT id, version, channel, target, arch, artifact_url, artifact_signature, artifact_sha256, artifact_size, release_notes, minimum_supported_version, mandatory, rollout_percent, published_at, created_at FROM desktop_releases WHERE target = $1 AND arch = $2 AND channel = $3 AND published_at IS NOT NULL`, [input.target, input.arch, input.channel]);
    return releases.rows.map(toRelease)
      .filter((release) => compareSemver(release.version, input.currentVersion) > 0 && isIncludedInRollout(release.rolloutPercent, input.clientId))
      .sort((left, right) => compareSemver(right.version, left.version))[0] ?? null;
  }

  private async insertRefreshSession(queryable: PgQueryable, userId: string, ttlSeconds: number): Promise<string> {
    const id = randomUUID();
    const secret = randomToken();
    await queryable.query(
      `INSERT INTO auth_refresh_sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [id, userId, sha256(secret), new Date(Date.now() + ttlSeconds * 1000).toISOString()],
    );
    return `${id}.${secret}`;
  }

  private async withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await operation(client); await client.query("COMMIT"); return result; }
    catch (error) { await rollback(client); throw error; }
    finally { client.release(); }
  }

  private async assertCanCreateLocked(client: PoolClient, userId: string): Promise<void> {
    const user = await client.query<QueryResultRow & { plan_code: PlanCode; plan_expires_at: Date | string | null }>(
      `SELECT p.plan_code, p.plan_expires_at FROM user_profiles p JOIN auth_users u ON u.id = p.user_id
       WHERE p.user_id = $1 AND u.disabled_at IS NULL FOR UPDATE`, [userId],
    );
    if (!user.rows[0]) throw notFound("USER_NOT_FOUND", "User was not found.");
    const count = await client.query<QueryResultRow & { count: string }>(`SELECT COUNT(*)::text AS count FROM label_documents WHERE user_id = $1`, [userId]);
    const plan = effectivePlan(user.rows[0].plan_code, iso(user.rows[0].plan_expires_at));
    if (Number(count.rows[0]?.count ?? 0) >= PLAN_LABEL_LIMITS[plan]) throw conflict("LABEL_LIMIT_REACHED", "The label limit for this plan has been reached.");
  }

  private async assertOwnedCompletedAssets(client: PgQueryable, userId: string, content: CloudLabelContentV1): Promise<void> {
    const ids = [...collectAssetReferences(content)];
    if (!ids.length) return;
    const result = await client.query<QueryResultRow & { id: string }>(
      `SELECT id FROM label_assets WHERE user_id = $1 AND id = ANY($2::uuid[]) AND upload_state = 'completed' AND deleted_at IS NULL`,
      [userId, ids],
    );
    if (result.rows.length !== ids.length) throw badAsset("INVALID_LABEL_CONTENT", "All referenced assets must be completed assets owned by the current user.");
  }

  private async throwLabelUpdateError(client: PgQueryable, userId: string, labelId: string): Promise<never> {
    const existing = await client.query(`SELECT 1 FROM label_documents WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [labelId, userId]);
    if (!existing.rowCount) throw notFound("LABEL_NOT_FOUND", "Label was not found.");
    throw conflict("REVISION_CONFLICT", "The label was changed by another client.");
  }
}

function userSelect(where: string): string {
  return `SELECT u.id, u.email, u.password_hash, u.disabled_at, u.deletion_requested_at, u.deletion_scheduled_for, p.display_name, p.plan_code, p.plan_expires_at, p.subscription_updated_at, u.created_at, u.updated_at
    FROM auth_users u JOIN user_profiles p ON p.user_id = u.id ${where}`;
}
function labelSelect(where: string): string { return `SELECT id, user_id, name, category_id, schema_version, content, revision, created_at, updated_at, deleted_at, last_opened_at FROM label_documents ${where}`; }
function assetSelect(where: string): string { return `SELECT id, user_id, mime_type, kind, object_key, sha256, byte_size, upload_state, created_at, completed_at, deleted_at FROM label_assets ${where}`; }
function toUserRecord(row: UserRow): UserRecord { return { ...toUserProfile(row), passwordHash: row.password_hash, disabledAt: iso(row.disabled_at), deletionRequestedAt: iso(row.deletion_requested_at), deletionScheduledFor: iso(row.deletion_scheduled_for), subscriptionUpdatedAt: iso(row.subscription_updated_at) ?? iso(row.updated_at)! }; }
function toUserProfile(row: UserRow): UserProfile { const planExpiresAt = iso(row.plan_expires_at); return { id: row.id, email: row.email, displayName: row.display_name, plan: effectivePlan(row.plan_code, planExpiresAt), planExpiresAt, createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! }; }
function toLabel(row: LabelRow): LabelDocument { return { id: row.id, userId: row.user_id, name: row.name, categoryId: row.category_id, schemaVersion: Number(row.schema_version), content: json<CloudLabelContentV1>(row.content), revision: Number(row.revision), createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)!, deletedAt: iso(row.deleted_at), lastOpenedAt: iso(row.last_opened_at) }; }
function toLabelCategory(row: LabelCategoryRow): LabelCategory { return { id: row.id, userId: row.user_id, name: row.name, createdAt: iso(row.created_at)! }; }
function toAsset(row: AssetRow): LabelAsset { return { id: row.id, userId: row.user_id, mimeType: row.mime_type, kind: row.kind, objectKey: row.object_key, sha256: row.sha256, byteSize: Number(row.byte_size), state: row.upload_state, createdAt: iso(row.created_at)!, completedAt: iso(row.completed_at), deletedAt: iso(row.deleted_at) }; }
function toTemplate(row: TemplateRow): OfficialTemplate { return { id: row.id, code: row.code, name: row.name, description: row.description, category: row.category, requiredPlan: row.required_plan, schemaVersion: row.schema_version, content: json<CloudLabelContentV1>(row.content), previewUrl: row.preview_object_key, enabled: row.enabled, sortOrder: row.sort_order, createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! }; }
function toTemplateSummary(row: TemplateSummaryRow): Omit<OfficialTemplate, "content"> { return { id: row.id, code: row.code, name: row.name, description: row.description, category: row.category, requiredPlan: row.required_plan, schemaVersion: row.schema_version, previewUrl: row.preview_object_key, enabled: row.enabled, sortOrder: row.sort_order, createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! }; }
function toRelease(row: ReleaseRow): DesktopRelease { return { id: row.id, version: row.version, channel: row.channel, target: row.target, arch: row.arch, artifactUrl: row.artifact_url, artifactSignature: row.artifact_signature, artifactSha256: row.artifact_sha256, artifactSize: Number(row.artifact_size), releaseNotes: row.release_notes, minimumSupportedVersion: row.minimum_supported_version, mandatory: row.mandatory, rolloutPercent: row.rollout_percent, publishedAt: iso(row.published_at), createdAt: iso(row.created_at)! }; }
function json<T>(value: T | string): T { return typeof value === "string" ? JSON.parse(value) as T : value; }
function iso(value: Date | string | null): string | null { return value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function parseOpaqueToken(value: string): { id: string; secret: string } | null { const [id, secret, unexpected] = value.split("."); return id && secret && !unexpected ? { id, secret } : null; }
function isRevision(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value); }
function labelOrderSql(sort?: string): string { switch (sort) { case "updated_asc": return "updated_at ASC, id ASC"; case "name_asc": return "name ASC, id ASC"; case "name_desc": return "name DESC, id ASC"; default: return "updated_at DESC, id DESC"; } }
function encodeCursor(offset: number): string { return Buffer.from(String(offset)).toString("base64url"); }
function decodeCursor(cursor?: string): number { if (!cursor) return 0; const value = Number(Buffer.from(cursor, "base64url").toString("utf8")); return Number.isInteger(value) && value >= 0 ? value : 0; }
function badAsset(code: string, message: string): ApiError { return new ApiError(400, code, message); }
function isSemver(value: string): boolean { return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value); }
function compareSemver(left: string, right: string): number { const parse = (value: string) => value.split("+")[0].split("-")[0].split(".").map(Number); const [la, lb, lc] = parse(left); const [ra, rb, rc] = parse(right); return la - ra || lb - rb || lc - rc; }
function isIncludedInRollout(percent: number, clientId: string): boolean { if (percent <= 0) return false; if (percent >= 100) return true; let hash = 2166136261; for (const char of clientId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0) % 100 < percent; }
function isUniqueViolation(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505"; }
async function rollback(client: PoolClient): Promise<void> { try { await client.query("ROLLBACK"); } catch { /* a failed connection cannot be rolled back */ } }
async function syncLabelAssetRelations(client: PgQueryable, labelId: string, assetIds: Set<string>): Promise<void> { await client.query(`DELETE FROM label_document_assets WHERE label_id = $1`, [labelId]); for (const assetId of assetIds) await client.query(`INSERT INTO label_document_assets (label_id, asset_id) VALUES ($1, $2)`, [labelId, assetId]); }
