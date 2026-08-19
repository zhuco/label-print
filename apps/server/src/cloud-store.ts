import type {
  BillingEventApplyResult,
  BillingWebhookEvent,
  DesktopRelease,
  LabelAsset,
  LabelCategory,
  LabelDocument,
  OfficialTemplate,
  PlanCode,
  UserProfile,
} from "./types.js";
import type { RefreshSession, UserRecord } from "./store.js";

export type Awaitable<T> = T | Promise<T>;
export type DueAccountDeletion = { userId: string; assets: LabelAsset[] };

/**
 * Repository contract shared by the fast in-memory test store and the production PostgreSQL
 * implementation. The application always awaits results, while synchronous test stores remain
 * inexpensive and ergonomically compatible with existing tests.
 */
export interface CloudStore {
  createUser(email: string, password: string, displayName?: string): Awaitable<UserProfile>;
  getUserForLogin(email: string): Awaitable<UserRecord | undefined>;
  getUser(userId: string): Awaitable<UserProfile>;
  requestAccountDeletion(userId: string): Awaitable<{ scheduledFor: string }>;
  listDueAccountDeletions(now: string, limit: number): Awaitable<DueAccountDeletion[]>;
  purgeDueAccountDeletion(userId: string, now: string): Awaitable<boolean>;
  setPassword(userId: string, password: string): Awaitable<void>;
  setPlanFromSubscription(userId: string, plan: PlanCode, planExpiresAt?: string | null): Awaitable<void>;
  applyBillingWebhookEvent(event: BillingWebhookEvent): Awaitable<BillingEventApplyResult>;
  createRefreshSession(userId: string, ttlSeconds: number): Awaitable<string>;
  rotateRefreshSession(token: string, ttlSeconds: number): Awaitable<string>;
  getRefreshSessionUserId(token: string): Awaitable<string>;
  revokeRefreshSession(token: string): Awaitable<void>;
  createPasswordResetToken(userId: string, ttlSeconds?: number): Awaitable<string>;
  consumePasswordResetToken(token: string): Awaitable<string>;
  usage(userId: string): Awaitable<{ used: number; limit: number; canCreate: boolean }>;
  listLabelCategories(userId: string): Awaitable<LabelCategory[]>;
  createLabelCategory(userId: string, nameInput: unknown): Awaitable<LabelCategory>;
  deleteLabelCategory(userId: string, categoryId: string): Awaitable<void>;
  listLabels(userId: string, options: { status: "active" | "trash"; query?: string; sort?: string; cursor?: string; limit: number }): Awaitable<{ items: LabelDocument[]; nextCursor: string | null }>;
  getLabel(userId: string, labelId: string): Awaitable<LabelDocument>;
  createLabel(userId: string, nameInput: unknown, contentInput: unknown): Awaitable<LabelDocument>;
  updateLabel(userId: string, labelId: string, expectedRevision: unknown, contentInput: unknown): Awaitable<LabelDocument>;
  renameLabel(userId: string, labelId: string, nameInput: unknown, expectedRevision: unknown): Awaitable<LabelDocument>;
  setLabelCategory(userId: string, labelId: string, categoryIdInput: unknown, expectedRevision: unknown): Awaitable<LabelDocument>;
  duplicateLabel(userId: string, labelId: string, nameInput?: unknown): Awaitable<LabelDocument>;
  moveToTrash(userId: string, labelId: string): Awaitable<void>;
  restoreLabel(userId: string, labelId: string): Awaitable<void>;
  permanentlyDeleteLabel(userId: string, labelId: string): Awaitable<void>;
  initiateAsset(userId: string, input: { mimeType?: unknown; kind?: unknown; sha256?: unknown; byteSize?: unknown }): Awaitable<{ asset: LabelAsset; reused: boolean; uploadUrl: string | null }>;
  getAssetForCompletion(userId: string, assetId: string): Awaitable<LabelAsset>;
  completeAsset(userId: string, assetId: string): Awaitable<LabelAsset>;
  getAsset(userId: string, assetId: string): Awaitable<LabelAsset>;
  deleteAsset(userId: string, assetId: string): Awaitable<void>;
  addOfficialTemplate(template: OfficialTemplate): Awaitable<void>;
  listOfficialTemplates(): Awaitable<Array<Omit<OfficialTemplate, "content">>>;
  getOfficialTemplate(userId: string, templateId: string): Awaitable<OfficialTemplate>;
  createLabelFromTemplate(userId: string, templateId: string, nameInput: unknown): Awaitable<LabelDocument>;
  addDesktopRelease(release: DesktopRelease): Awaitable<void>;
  findDesktopUpdate(input: { target: string; arch: string; currentVersion: string; channel: "stable" | "beta"; clientId: string }): Awaitable<DesktopRelease | null>;
}

export type { RefreshSession };
