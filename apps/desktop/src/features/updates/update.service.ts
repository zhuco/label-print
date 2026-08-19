export type UpdateProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
};

export type AvailableUpdate = {
  currentVersion: string;
  version: string;
  notes: string | null;
  date: string | null;
  artifactSize: number | null;
  minimumSupportedVersion: string | null;
  mandatory: boolean;
  downloadAndInstall(onProgress: (progress: UpdateProgress) => void): Promise<void>;
};

export type UpdateProvider = {
  check(): Promise<AvailableUpdate | null>;
};

export type UpdateSafetyState = {
  printing: boolean;
  hasUnsyncedChanges: boolean;
  importingOrExporting: boolean;
  uploadingAssets: boolean;
};

export type UpdateInstallResult =
  | { ok: true }
  | { ok: false; reason: "blocked" | "failed"; message: string };

const DEFAULT_SAFETY_STATE: UpdateSafetyState = {
  printing: false,
  hasUnsyncedChanges: false,
  importingOrExporting: false,
  uploadingAssets: false,
};

export function getUpdateBlockReason(state: Partial<UpdateSafetyState>): string | null {
  const current = { ...DEFAULT_SAFETY_STATE, ...state };
  if (current.printing) return "正在打印，完成后才能安装更新。";
  if (current.hasUnsyncedChanges) return "存在尚未同步的标签修改，请先完成同步。";
  if (current.importingOrExporting) return "正在导入或导出文件，完成后才能安装更新。";
  if (current.uploadingAssets) return "正在上传图片资源，完成后才能安装更新。";
  return null;
}

/** True when the current SemVer core is older than the API's minimum supported version. */
export function isVersionBelowMinimum(currentVersion: string, minimumVersion: string | null): boolean {
  if (!minimumVersion) return false;
  const current = parseSemVerCore(currentVersion);
  const minimum = parseSemVerCore(minimumVersion);
  if (!current || !minimum) return false;
  return current[0] < minimum[0]
    || (current[0] === minimum[0] && current[1] < minimum[1])
    || (current[0] === minimum[0] && current[1] === minimum[1] && current[2] < minimum[2]);
}

/** Reads the API's optional rollout policy from the Tauri updater's preserved metadata. */
export function readUpdatePolicy(currentVersion: string, rawJson: Record<string, unknown>): Pick<AvailableUpdate, "minimumSupportedVersion" | "mandatory" | "artifactSize"> {
  const minimumSupportedVersion = stringFromRawJson(rawJson, "minimum_supported_version");
  return {
    minimumSupportedVersion,
    mandatory: rawJson.mandatory === true || isVersionBelowMinimum(currentVersion, minimumSupportedVersion),
    artifactSize: positiveIntegerFromRawJson(rawJson, "artifact_size"),
  };
}

/**
 * Holds the update returned by Tauri until the user explicitly chooses to install it.
 * Windows installers exit the application during installation, so installation is
 * guarded by current print/sync/file-transfer state instead of running automatically.
 */
export class UpdateCoordinator {
  private pendingUpdate: AvailableUpdate | null = null;

  constructor(private readonly provider: UpdateProvider) {}

  async check(): Promise<AvailableUpdate | null> {
    this.pendingUpdate = await this.provider.check();
    return this.pendingUpdate;
  }

  get pending(): AvailableUpdate | null {
    return this.pendingUpdate;
  }

  async install(
    safetyState: Partial<UpdateSafetyState>,
    onProgress: (progress: UpdateProgress) => void = () => undefined,
  ): Promise<UpdateInstallResult> {
    if (!this.pendingUpdate) {
      return { ok: false, reason: "failed", message: "没有可安装的更新。" };
    }
    const blockReason = getUpdateBlockReason(safetyState);
    if (blockReason) return { ok: false, reason: "blocked", message: blockReason };

    try {
      await this.pendingUpdate.downloadAndInstall(onProgress);
      return { ok: true };
    } catch {
      return { ok: false, reason: "failed", message: "更新下载或安装失败，请稍后重试。" };
    }
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Tauri-only adapter. Browser tests and the web fallback safely expose no updater. */
export async function createTauriUpdateProvider(): Promise<UpdateProvider | null> {
  if (!isTauriRuntime()) return null;

  const { check } = await import("@tauri-apps/plugin-updater");
  const clientId = getOrCreateUpdateClientId();
  return {
    async check(): Promise<AvailableUpdate | null> {
      const update = await check({ timeout: 30_000, headers: { "x-release-client-id": clientId } });
      if (!update) return null;
      const policy = readUpdatePolicy(update.currentVersion, update.rawJson);
      return {
        currentVersion: update.currentVersion,
        version: update.version,
        notes: update.body ?? null,
        date: update.date ?? null,
        ...policy,
        async downloadAndInstall(onProgress): Promise<void> {
          let downloadedBytes = 0;
          await update.downloadAndInstall((event) => {
            if (event.event === "Started") {
              onProgress({ downloadedBytes, totalBytes: event.data.contentLength ?? null });
            } else if (event.event === "Progress") {
              downloadedBytes += event.data.chunkLength;
              onProgress({ downloadedBytes, totalBytes: null });
            }
          }, { timeout: 120_000 });
        },
      };
    },
  };
}

function stringFromRawJson(rawJson: Record<string, unknown>, key: string): string | null {
  const value = rawJson[key];
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value) ? value : null;
}

const UPDATE_CLIENT_ID_STORAGE_KEY = "label-print.update-client-id.v1";

/** A non-secret random install identifier keeps rollout assignment stable across changing IP addresses. */
export function getOrCreateUpdateClientId(storage: Pick<Storage, "getItem" | "setItem"> | null = browserStorage()): string {
  try {
    const previous = storage?.getItem(UPDATE_CLIENT_ID_STORAGE_KEY);
    if (previous && /^[a-z0-9-]{16,80}$/i.test(previous)) return previous;
  } catch {
    // Continue with an ephemeral ID if WebView storage is currently unavailable.
  }
  const generated = globalThis.crypto?.randomUUID?.() ?? `install-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  try {
    storage?.setItem(UPDATE_CLIENT_ID_STORAGE_KEY, generated);
  } catch {
    // A locked-down WebView can still participate in this run with an ephemeral identifier.
  }
  return generated;
}

function browserStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function positiveIntegerFromRawJson(rawJson: Record<string, unknown>, key: string): number | null {
  const value = rawJson[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseSemVerCore(value: string): [number, number, number] | null {
  const matched = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  if (!matched) return null;
  return [Number(matched[1]), Number(matched[2]), Number(matched[3])];
}
