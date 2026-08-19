import type { CloudLabelContentV1 as TemplateSchemaCloudLabelContentV1 } from "@label/template-schema";

export const PLAN_LABEL_LIMITS = {
  free: 50,
  pro: 200,
} as const;

export type PlanCode = keyof typeof PLAN_LABEL_LIMITS;
export type AssetKind = "image" | "icon";
export type AssetState = "initiated" | "completed" | "deleted";
export type BillingEventType = "subscription_activated" | "subscription_renewed" | "subscription_cancelled" | "subscription_refunded";

/**
 * Provider-neutral event after a payment-provider adapter has verified its native callback.
 * The API applies only a signed relay event; clients can never select their own plan.
 */
export type BillingWebhookEvent = {
  provider: string;
  eventId: string;
  type: BillingEventType;
  userId: string;
  plan: PlanCode;
  planExpiresAt: string | null;
  occurredAt: string;
};

export type BillingEventApplyResult = {
  status: "applied" | "duplicate" | "stale";
  user: UserProfile;
};

/** The public, portable content format stored in PostgreSQL JSONB. */
export type CloudLabelContentV1 = TemplateSchemaCloudLabelContentV1;

export type UserProfile = {
  id: string;
  email: string;
  displayName: string | null;
  plan: PlanCode;
  planExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountDeletionResult = {
  scheduledFor: string;
};

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
};

export type LabelDocument = {
  id: string;
  userId: string;
  name: string;
  categoryId: string | null;
  schemaVersion: number;
  content: CloudLabelContentV1;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lastOpenedAt: string | null;
};

export type LabelCategory = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
};

export type LabelAsset = {
  id: string;
  userId: string;
  mimeType: string;
  kind: AssetKind;
  objectKey: string;
  sha256: string;
  byteSize: number;
  state: AssetState;
  createdAt: string;
  completedAt: string | null;
  deletedAt: string | null;
};

export type OfficialTemplate = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  requiredPlan: PlanCode;
  schemaVersion: number;
  content: CloudLabelContentV1;
  previewUrl: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DesktopRelease = {
  id: string;
  version: string;
  channel: "stable" | "beta";
  target: string;
  arch: string;
  artifactUrl: string;
  artifactSignature: string;
  artifactSha256: string;
  artifactSize: number;
  releaseNotes: string;
  minimumSupportedVersion: string | null;
  mandatory: boolean;
  rolloutPercent: number;
  publishedAt: string | null;
  createdAt: string;
};

export type ApiErrorBody = { error: { code: string; message: string } };
