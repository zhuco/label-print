import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  InMemoryStore,
  type InMemoryStoreSnapshot,
} from "./store.js";
import type { BillingEventApplyResult, BillingWebhookEvent, DesktopRelease, LabelAsset, LabelDocument, OfficialTemplate, PlanCode, UserProfile } from "./types.js";
import type { DueAccountDeletion } from "./cloud-store.js";

/**
 * Durable local-store mode for a single API process. It is intentionally not a replacement for
 * PostgreSQL in a multi-instance deployment, but it makes a development/demo server survive
 * restarts and keeps plaintext credentials out of the snapshot (passwords are salted hashes).
 */
export class FileStore extends InMemoryStore {
  readonly filePath: string;

  constructor(filePath: string) {
    const resolved = resolve(filePath);
    super(loadSnapshot(resolved));
    this.filePath = resolved;
  }

  override createUser(email: string, password: string, displayName?: string): UserProfile { return this.persist(() => super.createUser(email, password, displayName)); }
  override createDevelopmentUser(email: string, password: string, displayName?: string): UserProfile { return this.persist(() => super.createDevelopmentUser(email, password, displayName)); }
  override requestAccountDeletion(userId: string): { scheduledFor: string } { return this.persist(() => super.requestAccountDeletion(userId)); }
  override listDueAccountDeletions(now: string, limit: number): DueAccountDeletion[] { return super.listDueAccountDeletions(now, limit); }
  override purgeDueAccountDeletion(userId: string, now: string): boolean { return this.persist(() => super.purgeDueAccountDeletion(userId, now)); }
  override setPassword(userId: string, password: string): void { this.persist(() => super.setPassword(userId, password)); }
  override setPlanFromSubscription(userId: string, plan: PlanCode, expiresAt: string | null = null): void { this.persist(() => super.setPlanFromSubscription(userId, plan, expiresAt)); }
  override applyBillingWebhookEvent(event: BillingWebhookEvent): BillingEventApplyResult { return this.persist(() => super.applyBillingWebhookEvent(event)); }
  override createRefreshSession(userId: string, ttlSeconds: number): string { return this.persist(() => super.createRefreshSession(userId, ttlSeconds)); }
  override rotateRefreshSession(token: string, ttlSeconds: number): string { return this.persist(() => super.rotateRefreshSession(token, ttlSeconds)); }
  override revokeRefreshSession(token: string): void { this.persist(() => super.revokeRefreshSession(token)); }
  override createPasswordResetToken(userId: string, ttlSeconds?: number): string { return this.persist(() => super.createPasswordResetToken(userId, ttlSeconds)); }
  override consumePasswordResetToken(token: string): string { return this.persist(() => super.consumePasswordResetToken(token)); }
  override createLabel(userId: string, name: unknown, content: unknown): LabelDocument { return this.persist(() => super.createLabel(userId, name, content)); }
  override updateLabel(userId: string, labelId: string, revision: unknown, content: unknown): LabelDocument { return this.persist(() => super.updateLabel(userId, labelId, revision, content)); }
  override renameLabel(userId: string, labelId: string, name: unknown, revision: unknown): LabelDocument { return this.persist(() => super.renameLabel(userId, labelId, name, revision)); }
  override duplicateLabel(userId: string, labelId: string, name?: unknown): LabelDocument { return this.persist(() => super.duplicateLabel(userId, labelId, name)); }
  override moveToTrash(userId: string, labelId: string): void { this.persist(() => super.moveToTrash(userId, labelId)); }
  override restoreLabel(userId: string, labelId: string): void { this.persist(() => super.restoreLabel(userId, labelId)); }
  override permanentlyDeleteLabel(userId: string, labelId: string): void { this.persist(() => super.permanentlyDeleteLabel(userId, labelId)); }
  override initiateAsset(userId: string, input: { mimeType?: unknown; kind?: unknown; sha256?: unknown; byteSize?: unknown }): { asset: LabelAsset; reused: boolean; uploadUrl: string | null } { return this.persist(() => super.initiateAsset(userId, input)); }
  override completeAsset(userId: string, assetId: string): LabelAsset { return this.persist(() => super.completeAsset(userId, assetId)); }
  override deleteAsset(userId: string, assetId: string): void { this.persist(() => super.deleteAsset(userId, assetId)); }
  override addOfficialTemplate(template: OfficialTemplate): void { this.persist(() => super.addOfficialTemplate(template)); }
  override addDesktopRelease(release: DesktopRelease): void { this.persist(() => super.addDesktopRelease(release)); }

  private persist<T>(operation: () => T): T {
    const result = operation();
    const directory = dirname(this.filePath);
    mkdirSync(directory, { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.snapshot()), { encoding: "utf8", mode: 0o600 });
    // POSIX can replace an existing path with rename(2), while Windows cannot. Preserve the
    // previous snapshot until the replacement succeeds so a failed write remains recoverable.
    const backup = `${this.filePath}.bak`;
    const hadExistingSnapshot = existsSync(this.filePath);
    if (hadExistingSnapshot) renameSync(this.filePath, backup);
    try {
      renameSync(temporary, this.filePath);
      if (hadExistingSnapshot) rmSync(backup, { force: true });
    } catch (error) {
      if (hadExistingSnapshot && existsSync(backup) && !existsSync(this.filePath)) renameSync(backup, this.filePath);
      throw error;
    }
    try { chmodSync(this.filePath, 0o600); } catch { /* Windows ACLs are configured by the host. */ }
    return result;
  }
}

function loadSnapshot(filePath: string): InMemoryStoreSnapshot | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("snapshot is not an object");
    const snapshot = parsed as Partial<InMemoryStoreSnapshot>;
    if (snapshot.version !== 1 || !Array.isArray(snapshot.users) || !Array.isArray(snapshot.refreshSessions)
      || !Array.isArray(snapshot.resetTokens) || !Array.isArray(snapshot.labels) || !Array.isArray(snapshot.assets)
      || !Array.isArray(snapshot.templates) || !Array.isArray(snapshot.releases)) {
      throw new Error("snapshot shape is invalid");
    }
    return snapshot as InMemoryStoreSnapshot;
  } catch (error) {
    throw new Error(`Cannot load local cloud-store data at ${filePath}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}
