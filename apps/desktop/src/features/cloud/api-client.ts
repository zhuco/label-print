import type {
  CreateLabelRequest,
  CompleteAssetResponse,
  InitiateAssetRequest,
  InitiateAssetResponse,
  AssetDownloadResponse,
  AccountDeletionResponse,
  LabelAsset,
  LabelCategory,
  ListLabelCategoriesResponse,
  LabelDocument,
  LabelSummary,
  ListOfficialTemplatesResponse,
  OfficialTemplateSummary,
  MeResponse,
  RenameLabelRequest,
  UpdateLabelRequest,
} from "@label/api-contract";

import type { AuthResponse, CloudCredentials, ListLabelsInput } from "./types";

const API_PREFIX = "/api/v1";

export class CloudApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "CloudApiError";
    this.status = status;
    this.code = code;
  }
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("请先登录后再使用个人云空间。");
    this.name = "AuthenticationRequiredError";
  }
}

export type CloudApiClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => Promise<boolean>;
};

type ErrorPayload = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
  message?: unknown;
};

export type ListResponse = {
  items: LabelSummary[];
  nextCursor?: string | null;
};

function defaultApiBaseUrl(): string {
  const configured = import.meta.env.VITE_LABEL_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  // The bundled local API deliberately binds only IPv4 loopback; use the same literal here so
  // Windows never selects an unavailable IPv6 localhost address during development. Production
  // builds are also rejected by vite.config.ts when this value is absent.
  if (import.meta.env.DEV) return "http://127.0.0.1:8787";
  throw new Error("正式版缺少 VITE_LABEL_API_URL，已拒绝连接本机开发云服务。");
}

function makeUrl(baseUrl: string, path: string, query?: Record<string, string | number | null | undefined>): string {
  const url = new URL(`${API_PREFIX}${path}`, `${baseUrl.replace(/\/$/, "")}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readError(response: Response): Promise<CloudApiError> {
  let payload: ErrorPayload | null = null;
  try {
    payload = (await response.json()) as ErrorPayload;
  } catch {
    // An HTTP status is sufficient if a proxy returned a non-JSON response.
  }
  const code = typeof payload?.error?.code === "string" ? payload.error.code : null;
  const message =
    (typeof payload?.error?.message === "string" && payload.error.message) ||
    (typeof payload?.message === "string" && payload.message) ||
    `云服务请求失败（${response.status}）`;
  return new CloudApiError(response.status, code, message);
}

/** Small fetch wrapper. It does not persist credentials and never logs request bodies. */
export class CloudApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly getAccessToken: () => string | null;
  private readonly onUnauthorized?: () => Promise<boolean>;

  constructor(options: CloudApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? defaultApiBaseUrl();
    // Browser implementations expose `fetch` as a method of Window. Keeping an unbound
    // reference and invoking it through this client changes its receiver to CloudApiClient,
    // which fails in Chromium with "Illegal invocation". Bind the default once while still
    // allowing tests and alternate runtimes to provide their own fetch implementation.
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.getAccessToken = options.getAccessToken ?? (() => null);
    this.onUnauthorized = options.onUnauthorized;
  }

  async register(input: { email: string; password: string; displayName?: string }): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/register", { method: "POST", body: input, authenticated: false });
  }

  async login(input: { email: string; password: string }): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/login", { method: "POST", body: input, authenticated: false });
  }

  async refresh(refreshToken: string): Promise<CloudCredentials> {
    return this.request<CloudCredentials>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      authenticated: false,
    });
  }

  async logout(refreshToken: string | null): Promise<void> {
    await this.request<void>("/auth/logout", {
      method: "POST",
      body: refreshToken ? { refreshToken } : {},
      authenticated: false,
      emptyResponse: true,
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.request<void>("/auth/password/forgot", { method: "POST", body: { email }, authenticated: false, emptyResponse: true });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.request<void>("/auth/password/reset", { method: "POST", body: { token, password }, authenticated: false, emptyResponse: true });
  }

  async me(): Promise<MeResponse> {
    return this.request<MeResponse>("/me");
  }

  async requestAccountDeletion(): Promise<AccountDeletionResponse> {
    return this.request<AccountDeletionResponse>("/me/account-deletion", { method: "POST" });
  }

  async listLabels(input: ListLabelsInput & { includeContent?: boolean }): Promise<ListResponse> {
    return this.request<ListResponse>("/labels", {
      query: {
        query: input.query,
        status: input.status,
        sort: input.sort,
        cursor: input.cursor,
        limit: input.limit,
        includeContent: input.includeContent ? "true" : undefined,
      },
    });
  }

  async listLabelCategories(): Promise<LabelCategory[]> {
    return (await this.request<ListLabelCategoriesResponse>("/label-categories")).items;
  }

  async createLabelCategory(name: string): Promise<LabelCategory> {
    return this.request<LabelCategory>("/label-categories", { method: "POST", body: { name } });
  }

  async deleteLabelCategory(id: string): Promise<void> {
    await this.request<void>(`/label-categories/${encodeURIComponent(id)}`, { method: "DELETE", emptyResponse: true });
  }

  async updateLabelCategory(id: string, categoryId: string | null, expectedRevision: number): Promise<LabelSummary> {
    return this.request<LabelSummary>(`/labels/${encodeURIComponent(id)}/category`, {
      method: "PATCH", body: { categoryId, expectedRevision },
    });
  }

  async getLabel(id: string): Promise<LabelDocument> {
    return this.request<LabelDocument>(`/labels/${encodeURIComponent(id)}`);
  }

  async createLabel(input: CreateLabelRequest): Promise<LabelDocument> {
    return this.request<LabelDocument>("/labels", { method: "POST", body: input });
  }

  async updateLabel(id: string, input: UpdateLabelRequest): Promise<LabelDocument> {
    return this.request<LabelDocument>(`/labels/${encodeURIComponent(id)}`, { method: "PUT", body: input });
  }

  async renameLabel(id: string, input: RenameLabelRequest): Promise<LabelSummary> {
    return this.request<LabelSummary>(`/labels/${encodeURIComponent(id)}/name`, { method: "PATCH", body: input });
  }

  async duplicateLabel(id: string, name: string): Promise<LabelDocument> {
    return this.request<LabelDocument>(`/labels/${encodeURIComponent(id)}/duplicate`, { method: "POST", body: { name } });
  }

  async moveToTrash(id: string): Promise<void> {
    await this.request<void>(`/labels/${encodeURIComponent(id)}`, { method: "DELETE", emptyResponse: true });
  }

  async restoreLabel(id: string): Promise<void> {
    await this.request<void>(`/labels/${encodeURIComponent(id)}/restore`, { method: "POST", emptyResponse: true });
  }

  async permanentlyDeleteLabel(id: string): Promise<void> {
    await this.request<void>(`/labels/${encodeURIComponent(id)}/permanent`, { method: "DELETE", emptyResponse: true });
  }

  async listOfficialTemplates(): Promise<OfficialTemplateSummary[]> {
    return (await this.request<ListOfficialTemplatesResponse>("/official-templates")).items;
  }

  async createLabelFromOfficialTemplate(templateId: string, name?: string): Promise<LabelDocument> {
    return this.request<LabelDocument>(`/official-templates/${encodeURIComponent(templateId)}/create-label`, {
      method: "POST",
      body: name?.trim() ? { name: name.trim() } : {},
    });
  }

  async initiateAsset(input: InitiateAssetRequest): Promise<InitiateAssetResponse> {
    return this.request<InitiateAssetResponse>("/assets/initiate", { method: "POST", body: input });
  }

  async completeAsset(id: string): Promise<CompleteAssetResponse> {
    return this.request<CompleteAssetResponse>(`/assets/${encodeURIComponent(id)}/complete`, { method: "POST" });
  }

  async getAssetDownload(id: string): Promise<AssetDownloadResponse> {
    return this.request<AssetDownloadResponse>(`/assets/${encodeURIComponent(id)}`);
  }

  async deleteAsset(id: string): Promise<void> {
    await this.request<void>(`/assets/${encodeURIComponent(id)}`, { method: "DELETE", emptyResponse: true });
  }

  async uploadToSignedUrl(uploadUrl: string, bytes: Blob, headers: Record<string, string> = {}): Promise<void> {
    let response: Response;
    try {
      response = await this.fetcher(this.resolveStorageUrl(uploadUrl), { method: "PUT", headers, body: bytes });
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error("图片上传失败。");
    }
    if (!response.ok) throw await readError(response);
  }

  async downloadAsset(downloadUrl: string): Promise<Blob> {
    const resolvedUrl = this.resolveStorageUrl(downloadUrl);
    const headers = new Headers();
    // S3/R2 presigned URLs carry their own authorization. The local fallback is an API route
    // and therefore still needs the bearer token, without putting that token in a URL.
    if (new URL(resolvedUrl).origin === new URL(this.baseUrl).origin) {
      const accessToken = this.getAccessToken();
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    }
    let response: Response;
    try {
      response = await this.fetcher(resolvedUrl, { headers });
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error("图片下载失败。");
    }
    if (!response.ok) throw await readError(response);
    return response.blob();
  }

  private resolveStorageUrl(url: string): string {
    return new URL(url, `${this.baseUrl.replace(/\/$/, "")}/`).toString();
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      query?: Record<string, string | number | null | undefined>;
      authenticated?: boolean;
      emptyResponse?: boolean;
    } = {},
    retried = false
  ): Promise<T> {
    const authenticated = options.authenticated ?? true;
    const accessToken = authenticated ? this.getAccessToken() : null;
    if (authenticated && !accessToken) {
      throw new AuthenticationRequiredError();
    }

    const headers = new Headers({ Accept: "application/json" });
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    let response: Response;
    try {
      response = await this.fetcher(makeUrl(this.baseUrl, path, options.query), {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error("无法连接到云服务。");
    }

    if (response.status === 401 && authenticated && !retried && this.onUnauthorized && (await this.onUnauthorized())) {
      return this.request<T>(path, options, true);
    }
    if (!response.ok) {
      throw await readError(response);
    }
    if (options.emptyResponse || response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

export function isNetworkOrServiceError(error: unknown): boolean {
  if (error instanceof CloudApiError) {
    return error.status === 429 || error.status >= 500;
  }
  return !(error instanceof AuthenticationRequiredError);
}
