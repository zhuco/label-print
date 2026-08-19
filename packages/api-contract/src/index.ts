import type { CloudLabelContentV1 } from '@label/template-schema';

export const API_V1_PREFIX = '/api/v1' as const;

export const PLAN_CODES = ['free', 'pro'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** The server-enforced maximum number of non-permanently-deleted labels. */
export const PLAN_LABEL_LIMITS: Readonly<Record<PlanCode, number>> = {
  free: 50,
  pro: 200,
};

export function getPlanLabelLimit(plan: PlanCode): number {
  return PLAN_LABEL_LIMITS[plan];
}

export type LabelUsage = {
  used: number;
  limit: number;
  canCreate: boolean;
};

export type ApiErrorCode =
  | 'INVALID_LABEL_CONTENT'
  | 'AUTH_REQUIRED'
  | 'PLAN_REQUIRED'
  | 'LABEL_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'LABEL_LIMIT_REACHED'
  | 'ASSET_TOO_LARGE'
  | 'UNSUPPORTED_DOCUMENT_VERSION'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE';

export type ApiErrorDetails = Record<string, unknown>;

/** Stable error envelope returned by every cloud API endpoint. */
export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message?: string;
    details?: ApiErrorDetails;
  };
};

export const API_ERROR_HTTP_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  INVALID_LABEL_CONTENT: 400,
  AUTH_REQUIRED: 401,
  PLAN_REQUIRED: 403,
  LABEL_NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  LABEL_LIMIT_REACHED: 409,
  ASSET_TOO_LARGE: 413,
  UNSUPPORTED_DOCUMENT_VERSION: 422,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
};

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && value in API_ERROR_HTTP_STATUS;
}

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
};

export type RegisterRequest = {
  email: string;
  password: string;
  displayName?: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type RefreshSessionRequest = {
  refreshToken: string;
};

export type LogoutRequest = {
  refreshToken?: string;
};

export type ForgotPasswordRequest = {
  email: string;
};

export type ResetPasswordRequest = {
  token: string;
  password: string;
};

export type AuthSessionResponse = TokenPair & {
  user: MeResponse;
};

/** Response DTO for GET /api/v1/me. */
export type MeResponse = {
  id: string;
  displayName: string | null;
  plan: PlanCode;
  planExpiresAt: string | null;
  labelUsage: LabelUsage;
};

/** Response returned after the account has been frozen and queued for deletion. */
export type AccountDeletionResponse = {
  scheduledFor: string;
};

export type LabelStatus = 'active' | 'trash';
export type LabelSort = 'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc';

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type ListLabelsQuery = {
  query?: string;
  status?: LabelStatus;
  sort?: LabelSort;
  cursor?: string;
  limit?: number;
};

/** Cloud label metadata included in list and content responses. */
export type LabelSummary = {
  id: string;
  name: string;
  /** null means the label is in the user's built-in uncategorized bucket. */
  categoryId?: string | null;
  schemaVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lastOpenedAt: string | null;
};

/** A private category belonging to exactly one cloud account. */
export type LabelCategory = {
  id: string;
  name: string;
  createdAt: string;
};

export type CreateLabelCategoryRequest = { name: string };
export type ListLabelCategoriesResponse = { items: LabelCategory[] };

export type LabelDocument = LabelSummary & {
  content: CloudLabelContentV1;
};

export type ListLabelsResponse = CursorPage<LabelSummary>;
export type GetLabelResponse = LabelDocument;

export type CreateLabelRequest = {
  name: string;
  content: CloudLabelContentV1;
};

export type CreateLabelResponse = LabelDocument;

/** expectedRevision makes the PUT operation an optimistic-concurrency update. */
export type UpdateLabelRequest = {
  expectedRevision: number;
  content: CloudLabelContentV1;
};

export type UpdateLabelResponse = LabelDocument;

export type RenameLabelRequest = {
  expectedRevision: number;
  name: string;
};

export type RenameLabelResponse = LabelSummary;

export type DuplicateLabelRequest = {
  name?: string;
};

export type DuplicateLabelResponse = LabelDocument;

export type AssetKind = 'image' | 'icon';

/** Lifecycle state of an uploaded asset. Only completed assets can be attached to labels. */
export type AssetState = 'initiated' | 'completed' | 'deleted';

/** Metadata record for an object-store resource referenced as asset://<id>. */
export type LabelAsset = {
  id: string;
  userId: string;
  mimeType: string;
  kind: AssetKind;
  sha256: string;
  byteSize: number;
  state: AssetState;
  createdAt: string;
  completedAt: string | null;
  deletedAt: string | null;
};

export type InitiateAssetRequest = {
  mimeType: string;
  kind: AssetKind;
  sha256: string;
  byteSize: number;
};

/** A signed upload URL may be omitted when an existing matching asset is reused. */
export type InitiateAssetResponse = {
  asset: LabelAsset;
  uploadUrl: string | null;
  uploadHeaders?: Record<string, string>;
  expiresAt?: string | null;
};

export type CompleteAssetResponse = {
  asset: LabelAsset;
};

export type AssetDownloadResponse = {
  asset: LabelAsset;
  downloadUrl: string;
  expiresAt: string;
};

/** Public metadata available from the official-template catalogue. */
export type OfficialTemplateSummary = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  requiredPlan: PlanCode;
  previewUrl: string | null;
  sortOrder: number;
};

/** Full content is returned only after the server has checked the plan. */
export type OfficialTemplateDetail = OfficialTemplateSummary & {
  schemaVersion: number;
  content: CloudLabelContentV1;
};

export type ListOfficialTemplatesResponse = {
  items: OfficialTemplateSummary[];
};

export type GetOfficialTemplateResponse = OfficialTemplateDetail;

export type CreateLabelFromOfficialTemplateRequest = {
  name?: string;
};

export type CreateLabelFromOfficialTemplateResponse = LabelDocument;
