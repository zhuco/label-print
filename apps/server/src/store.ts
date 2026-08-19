import { randomUUID } from "node:crypto";
import { ApiError, conflict, forbidden, notFound } from "./errors.js";
import { hashPassword, randomToken, sha256 } from "./crypto.js";
import { collectAssetReferences, parseCloudLabelContent, requireCategoryName, requireName } from "./validation.js";
import {
  PLAN_LABEL_LIMITS,
  type BillingEventApplyResult,
  type BillingWebhookEvent,
  type AssetKind,
  type CloudLabelContentV1,
  type DesktopRelease,
  type LabelAsset,
  type LabelCategory,
  type LabelDocument,
  type OfficialTemplate,
  type PlanCode,
  type UserProfile,
} from "./types.js";
import type { DueAccountDeletion } from "./cloud-store.js";

export type UserRecord = UserProfile & {
  passwordHash: string;
  disabledAt: string | null;
  deletionRequestedAt: string | null;
  deletionScheduledFor: string | null;
  subscriptionUpdatedAt: string;
};
export type RefreshSession = { id: string; userId: string; tokenHash: string; expiresAt: number; revokedAt: string | null; createdAt: string };
export type ResetToken = { tokenHash: string; userId: string; expiresAt: number; usedAt: string | null };

/**
 * Deliberately serialisable representation used by the local, single-process server mode.
 * Production deployments use the equivalent PostgreSQL schema in migrations/0001_personal_cloud.sql.
 */
export type InMemoryStoreSnapshot = {
  version: 1;
  users: UserRecord[];
  refreshSessions: RefreshSession[];
  resetTokens: ResetToken[];
  labels: LabelDocument[];
  categories?: LabelCategory[];
  assets: LabelAsset[];
  templates: OfficialTemplate[];
  releases: DesktopRelease[];
  billingEvents?: BillingWebhookEvent[];
};

export const SAFE_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
export const ACCOUNT_DELETION_GRACE_DAYS = 14;

export class InMemoryStore {
  protected readonly users = new Map<string, UserRecord>();
  protected readonly userIdsByEmail = new Map<string, string>();
  protected readonly refreshSessions = new Map<string, RefreshSession>();
  protected readonly resetTokens = new Map<string, ResetToken>();
  protected readonly labels = new Map<string, LabelDocument>();
  protected readonly categories = new Map<string, LabelCategory>();
  protected readonly assets = new Map<string, LabelAsset>();
  protected readonly templates = new Map<string, OfficialTemplate>();
  protected readonly releases = new Map<string, DesktopRelease>();
  protected readonly billingEvents = new Map<string, BillingWebhookEvent>();

  constructor(snapshot?: InMemoryStoreSnapshot) {
    if (!snapshot) return;
    if (snapshot.version !== 1) throw new Error("Unsupported local cloud-store snapshot version.");
    for (const user of snapshot.users) {
      this.users.set(user.id, {
        ...structuredClone(user),
        deletionRequestedAt: user.deletionRequestedAt ?? null,
        deletionScheduledFor: user.deletionScheduledFor ?? null,
      });
      this.userIdsByEmail.set(user.email, user.id);
    }
    for (const session of snapshot.refreshSessions) this.refreshSessions.set(session.id, structuredClone(session));
    for (const token of snapshot.resetTokens) this.resetTokens.set(token.tokenHash, structuredClone(token));
    for (const label of snapshot.labels) this.labels.set(label.id, { ...structuredClone(label), categoryId: label.categoryId ?? null });
    for (const category of snapshot.categories ?? []) this.categories.set(category.id, structuredClone(category));
    for (const asset of snapshot.assets) this.assets.set(asset.id, structuredClone(asset));
    for (const template of snapshot.templates) this.templates.set(template.id, structuredClone(template));
    for (const release of snapshot.releases) this.releases.set(release.id, structuredClone(release));
    for (const event of snapshot.billingEvents ?? []) this.billingEvents.set(billingEventKey(event), structuredClone(event));
  }

  snapshot(): InMemoryStoreSnapshot {
    return {
      version: 1,
      users: [...this.users.values()].map((value) => structuredClone(value)),
      refreshSessions: [...this.refreshSessions.values()].map((value) => structuredClone(value)),
      resetTokens: [...this.resetTokens.values()].map((value) => structuredClone(value)),
      labels: [...this.labels.values()].map((value) => structuredClone(value)),
      categories: [...this.categories.values()].map((value) => structuredClone(value)),
      assets: [...this.assets.values()].map((value) => structuredClone(value)),
      templates: [...this.templates.values()].map((value) => structuredClone(value)),
      releases: [...this.releases.values()].map((value) => structuredClone(value)),
      billingEvents: [...this.billingEvents.values()].map((value) => structuredClone(value)),
    };
  }

  now(): string { return new Date().toISOString(); }

  createUser(email: string, password: string, displayName?: string): UserProfile {
    if (this.userIdsByEmail.has(email)) throw conflict("EMAIL_ALREADY_REGISTERED", "This email is already registered.");
    const now = this.now();
    const user: UserRecord = {
      id: randomUUID(), email, displayName: displayName?.trim() || null, plan: "free", planExpiresAt: null,
      passwordHash: hashPassword(password), disabledAt: null, deletionRequestedAt: null, deletionScheduledFor: null,
      subscriptionUpdatedAt: now, createdAt: now, updatedAt: now,
    };
    this.users.set(user.id, user);
    this.userIdsByEmail.set(user.email, user.id);
    return this.publicUser(user);
  }

  /**
   * Creates a deliberately weak credential only for a local development fixture. This is not
   * reachable from an HTTP route and refuses to run in production. Registration and password
   * reset continue to enforce the normal 10-character minimum.
   */
  createDevelopmentUser(email: string, password: string, displayName?: string): UserProfile {
    if (process.env.NODE_ENV === "production") throw new Error("Development seed accounts are disabled in production.");
    if (typeof password !== "string" || password.length < 1 || password.length > 256) {
      throw new Error("Development seed password must contain 1 to 256 characters.");
    }
    if (this.userIdsByEmail.has(email)) return this.getUser(this.userIdsByEmail.get(email)!);
    const now = this.now();
    const user: UserRecord = {
      id: randomUUID(), email, displayName: displayName?.trim() || null, plan: "free", planExpiresAt: null,
      passwordHash: hashPassword(password), disabledAt: null, deletionRequestedAt: null, deletionScheduledFor: null,
      subscriptionUpdatedAt: now, createdAt: now, updatedAt: now,
    };
    this.users.set(user.id, user);
    this.userIdsByEmail.set(user.email, user.id);
    return this.publicUser(user);
  }

  getUserForLogin(email: string): UserRecord | undefined {
    const id = this.userIdsByEmail.get(email);
    return id ? this.users.get(id) : undefined;
  }

  getUser(userId: string): UserProfile {
    const user = this.users.get(userId);
    if (!user || user.disabledAt) throw notFound("USER_NOT_FOUND", "User was not found.");
    return this.publicUser(user);
  }

  requestAccountDeletion(userId: string): { scheduledFor: string } {
    const user = this.requireUser(userId);
    const requestedAt = this.now();
    const scheduledFor = new Date(Date.parse(requestedAt) + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    user.disabledAt = requestedAt;
    user.deletionRequestedAt = requestedAt;
    user.deletionScheduledFor = scheduledFor;
    user.updatedAt = requestedAt;
    this.revokeUserSessions(userId);
    return { scheduledFor };
  }

  listDueAccountDeletions(now: string, limit: number): DueAccountDeletion[] {
    const cutoff = Date.parse(now);
    if (!Number.isFinite(cutoff) || !Number.isInteger(limit) || limit < 1) return [];
    return [...this.users.values()]
      .filter((user) => user.disabledAt && user.deletionScheduledFor && Date.parse(user.deletionScheduledFor) <= cutoff)
      .sort((left, right) => Date.parse(left.deletionScheduledFor!) - Date.parse(right.deletionScheduledFor!))
      .slice(0, limit)
      .map((user) => ({
        userId: user.id,
        assets: [...this.assets.values()].filter((asset) => asset.userId === user.id).map((asset) => structuredClone(asset)),
      }));
  }

  purgeDueAccountDeletion(userId: string, now: string): boolean {
    const user = this.users.get(userId);
    if (!user?.disabledAt || !user.deletionScheduledFor || Date.parse(user.deletionScheduledFor) > Date.parse(now)) return false;
    for (const [id, label] of this.labels) if (label.userId === userId) this.labels.delete(id);
    for (const [id, asset] of this.assets) if (asset.userId === userId) this.assets.delete(id);
    for (const [id, session] of this.refreshSessions) if (session.userId === userId) this.refreshSessions.delete(id);
    for (const [tokenHash, token] of this.resetTokens) if (token.userId === userId) this.resetTokens.delete(tokenHash);
    for (const [key, event] of this.billingEvents) if (event.userId === userId) this.billingEvents.delete(key);
    this.users.delete(userId);
    this.userIdsByEmail.delete(user.email);
    return true;
  }

  getPasswordHash(userId: string): string | undefined { return this.users.get(userId)?.passwordHash; }

  setPassword(userId: string, password: string): void {
    const user = this.requireUser(userId);
    user.passwordHash = hashPassword(password);
    user.updatedAt = this.now();
    this.revokeUserSessions(userId);
  }

  /** Infrastructure-only method used by subscription webhooks and tests; it is never routed from client input. */
  setPlanFromSubscription(userId: string, plan: PlanCode, planExpiresAt: string | null = null): void {
    const user = this.requireUser(userId);
    user.plan = plan;
    user.planExpiresAt = planExpiresAt;
    user.subscriptionUpdatedAt = this.now();
    user.updatedAt = user.subscriptionUpdatedAt;
  }

  applyBillingWebhookEvent(event: BillingWebhookEvent): BillingEventApplyResult {
    const key = billingEventKey(event);
    const existing = this.billingEvents.get(key);
    const user = this.requireUser(event.userId);
    if (existing) return { status: "duplicate", user: this.publicUser(user) };
    this.billingEvents.set(key, structuredClone(event));
    const previous = Date.parse(user.subscriptionUpdatedAt || user.updatedAt);
    if (Number.isFinite(previous) && Date.parse(event.occurredAt) < previous) {
      return { status: "stale", user: this.publicUser(user) };
    }
    user.plan = event.plan;
    user.planExpiresAt = event.planExpiresAt;
    user.subscriptionUpdatedAt = event.occurredAt;
    user.updatedAt = this.now();
    return { status: "applied", user: this.publicUser(user) };
  }

  createRefreshSession(userId: string, ttlSeconds: number): string {
    this.requireUser(userId);
    const id = randomUUID();
    const secret = randomToken();
    this.refreshSessions.set(id, {
      id, userId, tokenHash: sha256(secret), expiresAt: Date.now() + ttlSeconds * 1000, revokedAt: null, createdAt: this.now(),
    });
    return `${id}.${secret}`;
  }

  rotateRefreshSession(token: string, ttlSeconds: number): string {
    const session = this.getValidRefreshSession(token);
    session.revokedAt = this.now();
    return this.createRefreshSession(session.userId, ttlSeconds);
  }

  getRefreshSessionUserId(token: string): string {
    return this.getValidRefreshSession(token).userId;
  }

  revokeRefreshSession(token: string): void {
    const [id, secret, unexpected] = token.split(".");
    if (!id || !secret || unexpected) return;
    const session = this.refreshSessions.get(id);
    if (session && session.tokenHash === sha256(secret)) session.revokedAt = this.now();
  }

  private getValidRefreshSession(token: string): RefreshSession {
    const [id, secret, unexpected] = token.split(".");
    const session = id && secret && !unexpected ? this.refreshSessions.get(id) : undefined;
    if (!session || session.revokedAt || session.expiresAt <= Date.now() || session.tokenHash !== sha256(secret)) {
      throw forbidden("INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked.");
    }
    this.requireUser(session.userId);
    return session;
  }

  private revokeUserSessions(userId: string): void {
    for (const session of this.refreshSessions.values()) if (session.userId === userId && !session.revokedAt) session.revokedAt = this.now();
  }

  createPasswordResetToken(userId: string, ttlSeconds = 15 * 60): string {
    this.requireUser(userId);
    const token = randomToken();
    this.resetTokens.set(sha256(token), { tokenHash: sha256(token), userId, expiresAt: Date.now() + ttlSeconds * 1000, usedAt: null });
    return token;
  }

  consumePasswordResetToken(token: string): string {
    const record = this.resetTokens.get(sha256(token));
    if (!record || record.usedAt || record.expiresAt <= Date.now()) throw forbidden("INVALID_RESET_TOKEN", "Reset token is invalid or expired.");
    const usedAt = this.now();
    // A later reset link must not remain usable after the password has changed through an
    // earlier link. This also mirrors the production PostgreSQL implementation.
    for (const resetToken of this.resetTokens.values()) {
      if (resetToken.userId === record.userId && !resetToken.usedAt) resetToken.usedAt = usedAt;
    }
    return record.userId;
  }

  usage(userId: string): { used: number; limit: number; canCreate: boolean } {
    const user = this.getUser(userId);
    const used = [...this.labels.values()].filter((label) => label.userId === userId).length;
    const limit = PLAN_LABEL_LIMITS[user.plan];
    return { used, limit, canCreate: used < limit };
  }

  listLabelCategories(userId: string): LabelCategory[] {
    this.requireUser(userId);
    return [...this.categories.values()]
      .filter((category) => category.userId === userId)
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id))
      .map((category) => structuredClone(category));
  }

  createLabelCategory(userId: string, nameInput: unknown): LabelCategory {
    this.requireUser(userId);
    const name = requireCategoryName(nameInput);
    if ([...this.categories.values()].some((category) => category.userId === userId && category.name === name)) {
      throw conflict("CATEGORY_NAME_EXISTS", "A category with this name already exists.");
    }
    const category = { id: randomUUID(), userId, name, createdAt: this.now() };
    this.categories.set(category.id, category);
    return structuredClone(category);
  }

  deleteLabelCategory(userId: string, categoryId: string): void {
    this.requireUser(userId);
    const category = this.categories.get(categoryId);
    if (!category || category.userId !== userId) throw notFound("CATEGORY_NOT_FOUND", "Category was not found.");
    this.categories.delete(categoryId);
    for (const label of this.labels.values()) {
      if (label.userId === userId && label.categoryId === categoryId) {
        label.categoryId = null;
        label.revision += 1;
        label.updatedAt = this.now();
      }
    }
  }

  listLabels(userId: string, options: { status: "active" | "trash"; query?: string; sort?: string; cursor?: string; limit: number }) {
    this.requireUser(userId);
    const query = options.query?.trim().toLocaleLowerCase();
    const sorter = labelSorter(options.sort);
    const labels = [...this.labels.values()]
      .filter((label) => label.userId === userId && (options.status === "trash" ? label.deletedAt !== null : label.deletedAt === null))
      .filter((label) => !query || label.name.toLocaleLowerCase().includes(query))
      .sort(sorter);
    const offset = decodeCursor(options.cursor);
    const page = labels.slice(offset, offset + options.limit).map((label) => this.copyLabel(label));
    const nextCursor = offset + page.length < labels.length ? encodeCursor(offset + page.length) : null;
    return { items: page, nextCursor };
  }

  getLabel(userId: string, labelId: string): LabelDocument {
    const label = this.labels.get(labelId);
    if (!label || label.userId !== userId) throw notFound("LABEL_NOT_FOUND", "Label was not found.");
    return this.copyLabel(label);
  }

  createLabel(userId: string, nameInput: unknown, contentInput: unknown): LabelDocument {
    this.assertCanCreate(userId);
    const content = this.validateOwnedAssets(userId, contentInput);
    const now = this.now();
    const label: LabelDocument = {
      id: randomUUID(), userId, name: requireName(nameInput), categoryId: null, schemaVersion: content.version, content,
      revision: 1, createdAt: now, updatedAt: now, deletedAt: null, lastOpenedAt: null,
    };
    this.labels.set(label.id, label);
    return this.copyLabel(label);
  }

  updateLabel(userId: string, labelId: string, expectedRevision: unknown, contentInput: unknown): LabelDocument {
    const label = this.requireActiveOwnedLabel(userId, labelId);
    this.assertRevision(label, expectedRevision);
    const content = this.validateOwnedAssets(userId, contentInput);
    label.content = content;
    label.schemaVersion = content.version;
    label.revision += 1;
    label.updatedAt = this.now();
    return this.copyLabel(label);
  }

  renameLabel(userId: string, labelId: string, nameInput: unknown, expectedRevision: unknown): LabelDocument {
    const label = this.requireActiveOwnedLabel(userId, labelId);
    this.assertRevision(label, expectedRevision);
    label.name = requireName(nameInput);
    label.revision += 1;
    label.updatedAt = this.now();
    return this.copyLabel(label);
  }

  setLabelCategory(userId: string, labelId: string, categoryIdInput: unknown, expectedRevision: unknown): LabelDocument {
    const label = this.requireActiveOwnedLabel(userId, labelId);
    this.assertRevision(label, expectedRevision);
    const categoryId = categoryIdInput === null ? null : typeof categoryIdInput === "string" ? categoryIdInput : undefined;
    if (categoryId === undefined) throw new ApiError(400, "INVALID_CATEGORY", "Category must be a category ID or null.");
    if (categoryId) {
      const category = this.categories.get(categoryId);
      if (!category || category.userId !== userId) throw notFound("CATEGORY_NOT_FOUND", "Category was not found.");
    }
    label.categoryId = categoryId;
    label.revision += 1;
    label.updatedAt = this.now();
    return this.copyLabel(label);
  }

  duplicateLabel(userId: string, labelId: string, nameInput?: unknown): LabelDocument {
    const source = this.requireActiveOwnedLabel(userId, labelId);
    this.assertCanCreate(userId);
    const now = this.now();
    const label: LabelDocument = {
      ...this.copyLabel(source), id: randomUUID(), name: nameInput === undefined ? `${source.name} (copy)` : requireName(nameInput),
      categoryId: null, revision: 1, createdAt: now, updatedAt: now, deletedAt: null, lastOpenedAt: null,
    };
    this.labels.set(label.id, label);
    return this.copyLabel(label);
  }

  moveToTrash(userId: string, labelId: string): void {
    const label = this.requireActiveOwnedLabel(userId, labelId);
    label.deletedAt = this.now();
    label.updatedAt = this.now();
  }

  restoreLabel(userId: string, labelId: string): void {
    const label = this.getOwnedLabel(userId, labelId);
    if (!label.deletedAt) throw conflict("LABEL_NOT_IN_TRASH", "Only trashed labels can be restored.");
    label.deletedAt = null;
    label.updatedAt = this.now();
  }

  permanentlyDeleteLabel(userId: string, labelId: string): void {
    const label = this.getOwnedLabel(userId, labelId);
    if (!label.deletedAt) throw conflict("LABEL_NOT_IN_TRASH", "Move a label to trash before permanently deleting it.");
    this.labels.delete(label.id);
  }

  initiateAsset(userId: string, input: { mimeType?: unknown; kind?: unknown; sha256?: unknown; byteSize?: unknown }): { asset: LabelAsset; reused: boolean; uploadUrl: string | null } {
    this.requireUser(userId);
    const mimeType = typeof input.mimeType === "string" ? input.mimeType.toLowerCase() : "";
    const kind = input.kind as AssetKind;
    const hash = typeof input.sha256 === "string" ? input.sha256.toLowerCase() : "";
    const byteSize = input.byteSize;
    if (!SAFE_IMAGE_MIME_TYPES.has(mimeType) || (kind !== "image" && kind !== "icon")) {
      throw badAsset("UNSUPPORTED_ASSET_MIME", "Only PNG, JPEG, and WebP images are accepted.");
    }
    if (!/^[a-f0-9]{64}$/.test(hash)) throw badAsset("INVALID_ASSET_HASH", "Asset SHA-256 must be a lowercase hexadecimal digest.");
    if (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize < 1 || byteSize > MAX_ASSET_BYTES) {
      throw new ApiError(413, "ASSET_TOO_LARGE", `Assets must be no larger than ${MAX_ASSET_BYTES} bytes.`);
    }
    const existing = [...this.assets.values()].find((asset) => asset.userId === userId && asset.sha256 === hash && asset.mimeType === mimeType && asset.state === "completed" && !asset.deletedAt);
    if (existing) return { asset: this.copyAsset(existing), reused: true, uploadUrl: null };
    const now = this.now();
    const asset: LabelAsset = {
      id: randomUUID(), userId, mimeType, kind, sha256: hash, byteSize,
      objectKey: `label-assets/${userId}/${randomUUID()}`, state: "initiated", createdAt: now, completedAt: null, deletedAt: null,
    };
    this.assets.set(asset.id, asset);
    return { asset: this.copyAsset(asset), reused: false, uploadUrl: `/api/v1/assets/${asset.id}/upload` };
  }

  completeAsset(userId: string, assetId: string): LabelAsset {
    const asset = this.getOwnedAsset(userId, assetId);
    if (asset.state === "deleted") throw notFound("ASSET_NOT_FOUND", "Asset was not found.");
    asset.state = "completed";
    asset.completedAt ??= this.now();
    return this.copyAsset(asset);
  }

  /** Used by an object-storage adapter before an initiated resource becomes publicly usable. */
  getAssetForCompletion(userId: string, assetId: string): LabelAsset {
    const asset = this.getOwnedAsset(userId, assetId);
    if (asset.state === "deleted" || asset.deletedAt) throw notFound("ASSET_NOT_FOUND", "Asset was not found.");
    return this.copyAsset(asset);
  }

  getAsset(userId: string, assetId: string): LabelAsset {
    const asset = this.getOwnedAsset(userId, assetId);
    if (asset.state !== "completed" || asset.deletedAt) throw notFound("ASSET_NOT_FOUND", "Asset was not found.");
    return this.copyAsset(asset);
  }

  deleteAsset(userId: string, assetId: string): void {
    const asset = this.getOwnedAsset(userId, assetId);
    const referenced = [...this.labels.values()].some((label) => label.userId === userId && collectAssetReferences(label.content).has(assetId));
    if (referenced) throw conflict("ASSET_STILL_REFERENCED", "Asset is referenced by a label and cannot be deleted.");
    asset.state = "deleted";
    asset.deletedAt = this.now();
  }

  addOfficialTemplate(template: OfficialTemplate): void {
    parseCloudLabelContent(template.content);
    this.templates.set(template.id, structuredClone(template));
  }

  listOfficialTemplates(): Array<Omit<OfficialTemplate, "content">> {
    return [...this.templates.values()]
      .filter((template) => template.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(({ content: _content, ...template }) => structuredClone(template));
  }

  getOfficialTemplate(userId: string, templateId: string): OfficialTemplate {
    const template = this.templates.get(templateId);
    if (!template || !template.enabled) throw notFound("OFFICIAL_TEMPLATE_NOT_FOUND", "Official template was not found.");
    this.assertTemplatePlan(userId, template);
    return structuredClone(template);
  }

  createLabelFromTemplate(userId: string, templateId: string, nameInput: unknown): LabelDocument {
    const template = this.getOfficialTemplate(userId, templateId);
    return this.createLabel(userId, nameInput ?? template.name, template.content);
  }

  addDesktopRelease(release: DesktopRelease): void {
    if (!isSemver(release.version)) throw new Error(`Invalid release version: ${release.version}`);
    this.releases.set(release.id, structuredClone(release));
  }

  findDesktopUpdate(input: { target: string; arch: string; currentVersion: string; channel: "stable" | "beta"; clientId: string }): DesktopRelease | null {
    if (!isSemver(input.currentVersion)) return null;
    return [...this.releases.values()]
      .filter((release) => release.publishedAt && release.target === input.target && release.arch === input.arch && release.channel === input.channel)
      .filter((release) => compareSemver(release.version, input.currentVersion) > 0)
      .filter((release) => isIncludedInRollout(release.rolloutPercent, input.clientId))
      .sort((a, b) => compareSemver(b.version, a.version))[0] ?? null;
  }

  private assertCanCreate(userId: string): void {
    if (!this.usage(userId).canCreate) throw conflict("LABEL_LIMIT_REACHED", "The label limit for this plan has been reached.");
  }

  private assertTemplatePlan(userId: string, template: OfficialTemplate): void {
    const user = this.getUser(userId);
    if (template.requiredPlan === "pro" && user.plan !== "pro") throw forbidden();
  }

  private validateOwnedAssets(userId: string, contentInput: unknown): CloudLabelContentV1 {
    const content = parseCloudLabelContent(contentInput);
    for (const assetId of collectAssetReferences(content)) {
      const asset = this.assets.get(assetId);
      if (!asset || asset.userId !== userId || asset.state !== "completed" || asset.deletedAt) {
        throw badAsset("INVALID_LABEL_CONTENT", "All referenced assets must be completed assets owned by the current user.");
      }
    }
    return structuredClone(content);
  }

  private assertRevision(label: LabelDocument, expectedRevision: unknown): void {
    if (typeof expectedRevision !== "number" || !Number.isInteger(expectedRevision)) {
      throw conflict("REVISION_CONFLICT", "An expected revision is required to update a label.");
    }
    if (label.revision !== expectedRevision) throw conflict("REVISION_CONFLICT", "The label was changed by another client.");
  }

  private getOwnedLabel(userId: string, labelId: string): LabelDocument {
    const label = this.labels.get(labelId);
    if (!label || label.userId !== userId) throw notFound("LABEL_NOT_FOUND", "Label was not found.");
    return label;
  }

  private requireActiveOwnedLabel(userId: string, labelId: string): LabelDocument {
    const label = this.getOwnedLabel(userId, labelId);
    if (label.deletedAt) throw notFound("LABEL_NOT_FOUND", "Label was not found.");
    return label;
  }

  private getOwnedAsset(userId: string, assetId: string): LabelAsset {
    const asset = this.assets.get(assetId);
    if (!asset || asset.userId !== userId) throw notFound("ASSET_NOT_FOUND", "Asset was not found.");
    return asset;
  }

  private requireUser(userId: string): UserRecord {
    const user = this.users.get(userId);
    if (!user || user.disabledAt) throw notFound("USER_NOT_FOUND", "User was not found.");
    return user;
  }

  private publicUser(user: UserRecord): UserProfile {
    const {
      passwordHash: _passwordHash,
      disabledAt: _disabledAt,
      deletionRequestedAt: _deletionRequestedAt,
      deletionScheduledFor: _deletionScheduledFor,
      subscriptionUpdatedAt: _subscriptionUpdatedAt,
      ...publicUser
    } = user;
    return { ...structuredClone(publicUser), plan: effectivePlan(user.plan, user.planExpiresAt) };
  }

  private copyLabel(label: LabelDocument): LabelDocument { return structuredClone(label); }
  private copyAsset(asset: LabelAsset): LabelAsset { return structuredClone(asset); }
}

export function effectivePlan(plan: PlanCode, expiresAt: string | null, now = Date.now()): PlanCode {
  return plan === "pro" && expiresAt !== null && Date.parse(expiresAt) <= now ? "free" : plan;
}

function billingEventKey(event: Pick<BillingWebhookEvent, "provider" | "eventId">): string {
  return `${event.provider}\u0000${event.eventId}`;
}

function labelSorter(sort?: string): (a: LabelDocument, b: LabelDocument) => number {
  switch (sort) {
    case "updated_asc": return (a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id);
    case "name_asc": return (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    case "name_desc": return (a, b) => b.name.localeCompare(a.name) || a.id.localeCompare(b.id);
    case "updated_desc":
    default: return (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);
  }
}

function encodeCursor(offset: number): string { return Buffer.from(String(offset)).toString("base64url"); }
function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function badAsset(code: string, message: string) { return new ApiError(400, code, message); }

function isSemver(value: string): boolean { return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value); }
function compareSemver(left: string, right: string): number {
  const parse = (value: string) => value.split("+")[0].split("-")[0].split(".").map(Number);
  const [la, lb, lc] = parse(left); const [ra, rb, rc] = parse(right);
  return la - ra || lb - rb || lc - rc;
}
function isIncludedInRollout(percent: number, clientId: string): boolean {
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  let hash = 2166136261;
  for (const char of clientId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100 < percent;
}
