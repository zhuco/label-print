import type {
  CreateLabelRequest,
  LabelDocument,
  LabelSummary,
  LabelSort,
  LabelStatus,
  MeResponse,
  RenameLabelRequest,
  UpdateLabelRequest,
} from "@label/api-contract";
import type { CloudLabelContentV1 } from "@label/template-schema";

export type CloudCredentials = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = CloudCredentials & {
  user: MeResponse;
};

export type CloudSyncStatus = "synced" | "pending" | "syncing" | "conflict" | "failed";
export type CloudConflictResolution = "overwrite" | "discard-local" | "save-copy";

/**
 * A cloud document plus the local-only state required to operate offline.
 * The local fields are deliberately never sent to the API.
 */
export type CachedCloudLabel = LabelSummary & {
  /** List responses may include content for previews; otherwise an opened/cached document has it. */
  content: CloudLabelContentV1 | null;
  syncStatus: CloudSyncStatus;
  lastSyncedAt: string | null;
};

export type ListLabelsInput = {
  query?: string;
  status?: LabelStatus;
  sort?: LabelSort;
  cursor?: string | null;
  limit?: number;
};

export type LabelListResult = {
  items: CachedCloudLabel[];
  nextCursor: string | null;
  source: "cloud" | "cache";
};

export type CreateLabelInput = CreateLabelRequest;
export type UpdateLabelInput = UpdateLabelRequest;
export type RenameLabelInput = RenameLabelRequest;

export type PendingSyncOperation =
  | {
      id: string;
      userId: string;
      labelId: string;
      kind: "create";
      payload: CreateLabelRequest;
      expectedRevision: null;
      createdAt: string;
      attempts: number;
      nextAttemptAt?: string | null;
    }
  | {
      id: string;
      userId: string;
      labelId: string;
      kind: "update";
      payload: UpdateLabelRequest;
      expectedRevision: number;
      createdAt: string;
      attempts: number;
      nextAttemptAt?: string | null;
    }
  | {
      id: string;
      userId: string;
      labelId: string;
      kind: "rename";
      payload: RenameLabelRequest;
      expectedRevision: number | null;
      createdAt: string;
      attempts: number;
      nextAttemptAt?: string | null;
    }
  | {
      id: string;
      userId: string;
      labelId: string;
      kind: "trash" | "restore" | "permanent-delete";
      payload: Record<string, never>;
      expectedRevision: number | null;
      createdAt: string;
      attempts: number;
      nextAttemptAt?: string | null;
    };

export type LabelRepository = {
  list(input: ListLabelsInput): Promise<LabelListResult>;
  get(id: string): Promise<CachedCloudLabel>;
  create(input: CreateLabelInput): Promise<CachedCloudLabel>;
  update(id: string, input: UpdateLabelInput): Promise<CachedCloudLabel>;
  rename(id: string, name: string, expectedRevision?: number): Promise<CachedCloudLabel>;
  duplicate(id: string, name: string): Promise<CachedCloudLabel>;
  moveToTrash(id: string, expectedRevision?: number): Promise<void>;
  restore(id: string): Promise<void>;
  permanentlyDelete(id: string): Promise<void>;
  createFromOfficialTemplate(templateId: string, name?: string): Promise<CachedCloudLabel>;
  resolveConflict(id: string, resolution: CloudConflictResolution): Promise<CachedCloudLabel | null>;
  syncPending(): Promise<SyncResult>;
};

export type SyncResult = {
  synced: number;
  conflicts: number;
  deferred: number;
};

export type CloudDocumentBinding = {
  id: string;
  revision: number;
  syncStatus: CloudSyncStatus;
};

export type CloudContent = CloudLabelContentV1;
