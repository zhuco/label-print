import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";

import appLogo from "./assets/icons/logo.png";
import { useDataImportStore } from "./features/data-import/data-import.store";
import {
  AuthenticationRequiredError,
  CloudApiClient,
  CloudAssetRepository,
  CloudApiError,
  CloudAuthSession,
  CloudLabelRepository,
  createCloudCacheStore,
  createCloudAssetCache,
  createCredentialStore,
  type CloudAssetCache,
  type CloudCacheStore,
  type CachedCloudLabel,
  type CloudAuthState,
  type CloudConflictResolution,
  type CloudDocumentBinding,
  isNetworkOrServiceError,
} from "./features/cloud";
import { EditorPage } from "./features/editor/EditorPage";
import { NewLabelModal } from "./features/editor/NewLabelModal";
import { type DirectPrintSubmitInput, PrintSubmitModal } from "./features/editor/PrintSubmitModal";
import { buildFontOptions, DEFAULT_FONT_OPTIONS, type FontOption } from "./features/editor/core/font-options";
import {
  getTemplateFileBaseName,
  parseDdlTemplate,
  packTemplateBundle,
  unpackTemplateBundle,
} from "./features/editor/core/template-file";
import { buildPrintSubmitPayload, toSubmitTaskPayload } from "./features/editor/core/print-task";
import {
  buildTemplateSnapshot,
  cloneElement,
  cloneElements,
  parseTemplateSnapshot,
  type TemplateSnapshot,
} from "./features/editor/core/template-snapshot";
import type { EditorElement, LabelSize } from "./features/editor/core/types";
import { type Calibration, type EditorDocument, selectActiveDocument, useEditorStore } from "./features/editor/editor.store";
import { HomePage } from "./features/home/HomePage";
import { CloudAuthModal } from "./features/home/CloudAuthModal";
import { CloudLabelThumbnail } from "./features/home/CloudLabelThumbnail";
import { matchesLabelSearch } from "./features/home/label-search";
import { createRecentTemplateStore, type RecentTemplateItem, type RecentTemplateStore } from "./features/home/recent-store";
import { createTauriUpdateProvider, isTauriRuntime, UpdateCoordinator } from "./features/updates/update.service";
import { listSystemFonts } from "./services/ipc/fonts";
import { consumeLaunchFiles, subscribeLaunchFiles, type LaunchFilePayload } from "./services/ipc/launch-files";
import { getCachedSystemPrinters, listSystemPrinters, revealPdfOutput, submitDirectPrint } from "./services/ipc/print";
import {
  type TemplateDto,
  listTemplates,
  pickTemplateFile,
  pickTemplateSavePath,
  saveTemplate,
  saveTemplateFile,
} from "./services/ipc/template";
import {
  closeWindow,
  minimizeWindow,
  startDragWindow,
  toggleMaximizeWindow,
} from "./services/ipc/window-controls";
import { toCloudLabelContent, toTemplateSnapshot, type CloudLabelContentV1 } from "@label/template-schema";
import type { LabelCategory, OfficialTemplateSummary } from "@label/api-contract";
import desktopPackage from "../package.json";

const LABEL_MIN_SIZE_MM = 10;
const DEFAULT_NEW_LABEL_SIZE: LabelSize = { widthMm: 40, heightMm: 30 };
const HOME_RECENT_STORAGE_KEY = "label-print.recent-opened";
const HOME_RECENT_LIMIT = 24;
const LAST_NEW_LABEL_SIZE_STORAGE_KEY = "label-print.last-new-label-size";
const SOFTWARE_DEFAULT_PRINTER_STORAGE_KEY = "label-print.default-printer";

export function shouldOpenCloudAuthOnStartup(state: CloudAuthState, isProduction = import.meta.env.PROD): boolean {
  return isProduction && state.status === "anonymous";
}
const TITLEBAR_IGNORE_SELECTOR = "button, input, textarea, select, a, [data-no-titlebar-action]";
const PRINTER_PREWARM_DELAY_MS = 4000;
const PRINTER_PREWARM_IDLE_TIMEOUT_MS = 2000;
const OPEN_LABEL_ALL_CATEGORIES = "__all_categories__";
const OPEN_LABEL_UNCATEGORIZED = "__uncategorized__";
// The public updater endpoint and signing key have not been published yet.
const UPDATE_CHECK_ENABLED = false;

type LocalFontMeta = {
  family?: string;
  fullName?: string;
  postscriptName?: string;
};

type LocalFontWindow = Window & {
  queryLocalFonts?: () => Promise<LocalFontMeta[]>;
};

type SaveFileHandle = {
  name?: string;
  createWritable: () => Promise<{
    write: (data: Blob | ArrayBuffer) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<SaveFileHandle>;
};

type IdleCallbackWindow = Window & {
  requestIdleCallback?: (
    callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
    options?: { timeout?: number }
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type SaveTemplateResult = {
  mode: "picker" | "download" | "direct" | "path";
  fileName: string;
  filePath?: string;
  handle?: SaveFileHandle;
  replacedExisting?: boolean;
};

type SaveDialogRequest = {
  documentId: string;
  name: string;
  destination: "cloud" | "local";
  categoryId: string | null | undefined;
  forceSaveAs: boolean;
  closeAfterSave: boolean;
};

type CloseConfirmRequest =
  | {
      kind: "tab";
      documentId: string;
      documentTitle: string;
    }
  | {
      kind: "app";
      unsavedCount: number;
    };

type PrintTarget = {
  title: string;
  labelSize: LabelSize;
  elements: EditorElement[];
  calibration: Calibration;
  printerId: string;
  copies: number;
};

type PdfOutputDialog = {
  path: string;
  directory: string;
};

function getParentDirectory(filePath: string): string {
  const separatorIndex = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
  return separatorIndex > 0 ? filePath.slice(0, separatorIndex) : filePath;
}

function resolveTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

function shouldIgnoreTitlebarAction(target: EventTarget | null): boolean {
  const element = resolveTargetElement(target);
  if (!element) {
    return true;
  }
  return Boolean(element.closest(TITLEBAR_IGNORE_SELECTOR));
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  const element = resolveTargetElement(target);
  if (!element) {
    return false;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return true;
  }
  return element instanceof HTMLElement ? element.isContentEditable : false;
}

function cloneSnapshot(snapshot: TemplateSnapshot): TemplateSnapshot {
  return {
    ...snapshot,
    labelSize: { ...snapshot.labelSize },
    elements: cloneElements(snapshot.elements),
    calibration: { ...snapshot.calibration },
  };
}

function toSnapshotSignature(snapshot: TemplateSnapshot): string {
  return JSON.stringify(snapshot);
}

function parseRecentOpenedItems(raw: string): RecentTemplateItem[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const output = parsed
      .map<RecentTemplateItem | null>((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const row = entry as Partial<RecentTemplateItem> & { snapshot?: unknown };
        if (row.saved !== true || typeof row.fileName !== "string" || !Number.isFinite(row.openedAt)) {
          return null;
        }
        const source = row.source === "cloud" ? "cloud" : "local";
        const cloudLabelId =
          source === "cloud" && typeof row.cloudLabelId === "string" && row.cloudLabelId.trim().length > 0
            ? row.cloudLabelId.trim()
            : null;
        if (source === "cloud" && !cloudLabelId) {
          return null;
        }
        const snapshot = parseTemplateSnapshot(JSON.stringify(row.snapshot ?? {}), row.fileName);
        if (!snapshot) {
          return null;
        }
        return {
          id:
            typeof row.id === "string" && row.id.trim().length > 0
              ? row.id
              : `recent-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          fileName: row.fileName,
          source,
          filePath:
            source === "local" && typeof row.filePath === "string" && row.filePath.trim().length > 0
              ? row.filePath.trim()
              : null,
          cloudLabelId,
          saved: true,
          openedAt: Number(row.openedAt),
          snapshot: cloneSnapshot(snapshot),
        };
      })
      .filter((item): item is RecentTemplateItem => item !== null)
      .sort((left, right) => right.openedAt - left.openedAt);

    return output.slice(0, HOME_RECENT_LIMIT);
  } catch {
    return [];
  }
}

/** Migrates pre-SQLite recent snapshots once, then removes their plaintext browser-storage copy. */
function takeLegacyRecentOpenedItems(): RecentTemplateItem[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(HOME_RECENT_STORAGE_KEY);
    localStorage.removeItem(HOME_RECENT_STORAGE_KEY);
    return raw ? parseRecentOpenedItems(raw) : [];
  } catch {
    return [];
  }
}

function readLastNewLabelSize(): LabelSize {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_NEW_LABEL_SIZE };
  }
  const raw = localStorage.getItem(LAST_NEW_LABEL_SIZE_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_NEW_LABEL_SIZE };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LabelSize>;
    return {
      widthMm: parsePositive(Number(parsed.widthMm), DEFAULT_NEW_LABEL_SIZE.widthMm),
      heightMm: parsePositive(Number(parsed.heightMm), DEFAULT_NEW_LABEL_SIZE.heightMm),
    };
  } catch {
    return { ...DEFAULT_NEW_LABEL_SIZE };
  }
}

function writeLastNewLabelSize(size: LabelSize) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(LAST_NEW_LABEL_SIZE_STORAGE_KEY, JSON.stringify(size));
}

function readSoftwareDefaultPrinterId(): string {
  if (typeof localStorage === "undefined") {
    return "";
  }
  return localStorage.getItem(SOFTWARE_DEFAULT_PRINTER_STORAGE_KEY)?.trim() || "";
}

function writeSoftwareDefaultPrinterId(printerId: string) {
  if (typeof localStorage === "undefined") {
    return;
  }
  const normalized = printerId.trim();
  if (!normalized) {
    localStorage.removeItem(SOFTWARE_DEFAULT_PRINTER_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SOFTWARE_DEFAULT_PRINTER_STORAGE_KEY, normalized);
}

function parsePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(LABEL_MIN_SIZE_MM, value);
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function isInitialUntouchedDocument(document: EditorDocument): boolean {
  return (
    document.title === "新建标签1" &&
    document.filePath === null &&
    document.labelSize.widthMm === DEFAULT_NEW_LABEL_SIZE.widthMm &&
    document.labelSize.heightMm === DEFAULT_NEW_LABEL_SIZE.heightMm &&
    document.elements.length === 0 &&
    document.selectedIds.length === 0 &&
    document.undoStack.length === 0 &&
    document.redoStack.length === 0
  );
}

function sanitizeFileName(input: string): string {
  const trimmed = input.trim();
  const base = trimmed.length > 0 ? trimmed : "label-template";
  return base.replace(/[\\/:*?"<>|]/g, "_");
}

function normalizeRecentFileName(fileName: string, fallbackTitle: string): string {
  const preferred = fileName.trim();
  if (preferred) {
    const baseName = getTemplateFileBaseName(preferred).trim();
    return baseName || preferred;
  }
  const fallback = fallbackTitle.trim();
  return fallback || "未命名标签";
}

function normalizeDocumentLookupKey(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes("\\") || trimmed.includes("/") || isAbsoluteFilePath(trimmed)) {
    return trimmed.replace(/\\/g, "/").toLocaleLowerCase("en-US");
  }
  return normalizeRecentFileName(trimmed, trimmed).trim().toLocaleLowerCase("zh-CN");
}

function isAbsoluteFilePath(value: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return true;
  }
  if (/^\\\\[^\\]/.test(value)) {
    return true;
  }
  return value.startsWith("/");
}

function resolveKnownDocumentPath(filePath: string | null): string | null {
  const normalized = filePath?.trim() || "";
  if (!normalized || !isAbsoluteFilePath(normalized)) {
    return null;
  }
  return normalized;
}

function isDdlDocumentPath(filePath: string | null): boolean {
  const normalized = filePath?.trim().toLocaleLowerCase("en-US") || "";
  return normalized.endsWith(".ddl");
}

function buildRecentEntryLookupKey(fileName: string, filePath: string | null): string {
  const knownPath = resolveKnownDocumentPath(filePath);
  if (knownPath) {
    return `path:${normalizeDocumentLookupKey(knownPath)}`;
  }
  return `name:${normalizeDocumentLookupKey(fileName)}`;
}

function buildRecentItemLookupKey(item: Pick<RecentTemplateItem, "source" | "fileName" | "filePath" | "cloudLabelId">): string {
  if (item.source === "cloud" && item.cloudLabelId) {
    return `cloud:${item.cloudLabelId}`;
  }
  return buildRecentEntryLookupKey(item.fileName, item.filePath ?? null);
}

function buildRecentNameLookupKey(fileName: string): string {
  return normalizeRecentFileName(fileName, fileName).trim().toLocaleLowerCase("zh-CN");
}

type RememberRecentOpenedOptions =
  | { source?: "local"; filePath?: string | null }
  | { source: "cloud"; cloudLabelId: string };

function toChineseErrorMessage(error: unknown): string {
  const readObjectMessage = (value: unknown): string | null => {
    if (!value || typeof value !== "object") {
      return null;
    }
    const row = value as Record<string, unknown>;
    const direct =
      (typeof row.message === "string" && row.message.trim()) ||
      (typeof row.error === "string" && row.error.trim()) ||
      (typeof row.details === "string" && row.details.trim());
    if (direct) {
      return direct;
    }
    if (row.cause) {
      const cause = row.cause;
      if (typeof cause === "string" && cause.trim()) {
        return cause.trim();
      }
      const nested = readObjectMessage(cause);
      if (nested) {
        return nested;
      }
    }
    return null;
  };

  const rawMessage = (() => {
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }
    const objectMessage = readObjectMessage(error);
    if (objectMessage) {
      return objectMessage;
    }
    if (error !== null && error !== undefined) {
      try {
        const serialized = JSON.stringify(error);
        if (serialized && serialized !== "{}") {
          return serialized;
        }
      } catch {
        // noop
      }
      const text = String(error).trim();
      if (text && text !== "[object Object]") {
        return text;
      }
    }
    return "";
  })();

  if (!rawMessage) {
    return "未知错误";
  }
  if (/[\u4e00-\u9fff]/.test(rawMessage)) {
    return rawMessage;
  }

  const lower = rawMessage.toLocaleLowerCase("en-US");
  if (lower.includes("permission")) {
    return "权限不足";
  }
  if (lower.includes("not found") || lower.includes("enoent")) {
    return "目标不存在";
  }
  if (lower.includes("abort") || lower.includes("cancel")) {
    return "操作已取消";
  }
  if (lower.includes("network")) {
    return "网络连接异常";
  }
  if (lower.includes("decode preview png failed")) {
    return "预览图解析失败";
  }
  if (lower.includes("write exported pdf failed")) {
    return "导出 PDF 失败（请检查文档目录权限）";
  }
  if (lower.includes("invalid label size for pdf export")) {
    return "标签尺寸无效，无法导出 PDF";
  }
  if (lower.includes("invalid preview image")) {
    return "预览图尺寸无效";
  }
  if (lower.includes("base64 decode")) {
    return "当前环境不支持 Base64 解码";
  }
  if (lower.includes("base64 encode")) {
    return "当前环境不支持 Base64 编码";
  }
  if (lower.includes("invalid template bundle")) {
    if (lower.includes("unsupported format")) {
      return "模板包格式不受支持";
    }
    if (lower.includes("unsupported version")) {
      return "模板包版本不受支持";
    }
    if (lower.includes("payload is not an object")) {
      return "模板包内容结构无效";
    }
    if (lower.includes("template payload is missing")) {
      return "模板包缺少模板内容";
    }
    if (lower.includes("assets is not an array")) {
      return "模板包资源列表格式无效";
    }
    if (lower.includes("malformed asset entry")) {
      return "模板包资源条目格式损坏";
    }
    if (lower.includes("json parse failed")) {
      return "模板包内容不是有效的 JSON";
    }
    if (lower.includes("template payload is malformed")) {
      return "模板包模板内容格式损坏";
    }
    return "模板包格式无效";
  }

  return rawMessage;
}

function getAssetId(value: string | undefined): string | null {
  if (!value?.startsWith("asset://")) return null;
  const id = value.slice("asset://".length).trim();
  return id || null;
}

async function prepareCloudContentAssets(
  content: CloudLabelContentV1,
  uploadAsset: (blob: Blob, mimeType: string, kind: "image" | "icon") => Promise<string>
): Promise<CloudLabelContentV1> {
  const uploaded = new Map<string, Promise<string>>();
  const elements = await Promise.all(
    content.elements.map(async (element) => {
      if (element.binding.mode !== "fixed" || !element.binding.fixedValue?.startsWith("data:image/")) {
        return structuredClone(element);
      }
      const dataUrl = element.binding.fixedValue;
      let task = uploaded.get(dataUrl);
      if (!task) {
        task = fetch(dataUrl)
          .then(async (response) => {
            if (!response.ok) throw new Error("图片资源读取失败。");
            const blob = await response.blob();
            const kind = element.type === "icon" ? "icon" : "image";
            return uploadAsset(blob, blob.type || "image/png", kind);
          });
        uploaded.set(dataUrl, task);
      }
      const assetId = await task;
      return {
        ...structuredClone(element),
        binding: { ...element.binding, fixedValue: `asset://${assetId}` },
      };
    })
  );
  return { ...structuredClone(content), elements };
}

async function restoreSnapshotAssetDataUrls(
  snapshot: TemplateSnapshot,
  loadAsset: (assetId: string) => Promise<string>,
  getCachedAsset: (assetId: string) => Promise<string | null>,
  cacheAsset: (assetId: string, dataUrl: string) => Promise<void>
): Promise<TemplateSnapshot> {
  const elements = await Promise.all(
    snapshot.elements.map(async (element) => {
      if (element.binding.mode !== "fixed") return cloneElement(element);
      const assetId = getAssetId(element.binding.fixedValue);
      if (!assetId) return cloneElement(element);
      const cached = await getCachedAsset(assetId);
      const dataUrl = cached ?? (await loadAsset(assetId));
      if (!cached) await cacheAsset(assetId, dataUrl);
      return {
        ...cloneElement(element),
        binding: { ...element.binding, fixedValue: dataUrl },
      };
    })
  );
  return { ...cloneSnapshot(snapshot), elements };
}

function toCloudErrorMessage(error: unknown): string {
  if (error instanceof AuthenticationRequiredError) {
    return "请先登录后再使用个人云空间。";
  }
  if (error instanceof CloudApiError) {
    switch (error.code) {
      case "LABEL_LIMIT_REACHED":
        return "标签数量已达当前套餐上限。";
      case "REVISION_CONFLICT":
        return "云端标签已在其他设备修改，请先处理冲突。";
      case "PLAN_REQUIRED":
        return "当前套餐不支持此云端功能。";
      case "LABEL_NOT_FOUND":
        return "云端标签不存在或已被永久删除。";
      case "AUTH_REQUIRED":
        return "登录状态已失效，请重新登录。";
      case "ACCOUNT_NOT_FOUND":
        return "该账号不存在，请检查邮箱或先注册账号。";
      case "LOGIN_PASSWORD_INCORRECT":
        return "密码错误，请重新输入。";
      case "ACCOUNT_DISABLED":
        return "该账号已被停用，请联系管理员。";
      case "EMAIL_ALREADY_REGISTERED":
        return "该邮箱已注册，请直接登录或找回密码。";
      case "INVALID_EMAIL":
        return "请输入正确的邮箱地址。";
      case "INVALID_PASSWORD":
        return "密码不符合要求，请使用至少 10 位字符。";
      case "RATE_LIMITED":
        return "操作过于频繁，请稍后重试。";
      case "SERVICE_UNAVAILABLE":
        return "云服务暂不可用，已保留本地缓存。";
      case "INVALID_LABEL_CONTENT":
        return "标签内容无效，未覆盖现有云端标签。";
      case "ASSET_TOO_LARGE":
        return "图片文件过大，请压缩或更换图片后重试。";
      case "UNSUPPORTED_DOCUMENT_VERSION":
        return "此标签由更高版本客户端创建，请升级软件后打开。";
      default:
        return error.message || "云服务请求失败。";
    }
  }
  if (error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message)) {
    return "无法连接云端服务。请检查网络，并确认正在使用已配置云端 API 的最新版软件。";
  }
  return toChineseErrorMessage(error);
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function decodeBytesAsUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(bytes);
  }
  return Array.from(bytes, (value) => String.fromCharCode(value)).join("");
}

function encodeUtf8(value: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }
  return Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  return encodeUtf8(await file.text());
}

function cloneForPaste(
  element: EditorElement,
  index: number,
  labelSize: LabelSize,
  copiedAt: number
): EditorElement {
  const xMm = Math.min(element.xMm + 2, Math.max(0, labelSize.widthMm - element.widthMm));
  const yMm = Math.min(element.yMm + 2, Math.max(0, labelSize.heightMm - element.heightMm));
  if (element.type === "barcode") {
    return {
      ...element,
      id: `${element.type}-paste-${copiedAt}-${index}`,
      xMm,
      yMm,
      binding: { ...element.binding },
      textStyle: { ...element.textStyle },
      barcode: { ...element.barcode },
    };
  }
  return {
    ...element,
    id: `${element.type}-paste-${copiedAt}-${index}`,
    xMm,
    yMm,
    binding: { ...element.binding },
    textStyle: { ...element.textStyle },
  };
}

async function listBrowserLocalFonts(): Promise<LocalFontMeta[]> {
  if (typeof window === "undefined") {
    return [];
  }

  const queryLocalFonts = (window as LocalFontWindow).queryLocalFonts;
  if (typeof queryLocalFonts !== "function") {
    return [];
  }

  try {
    const fonts = await queryLocalFonts();
    return Array.isArray(fonts) ? fonts : [];
  } catch {
    return [];
  }
}

export default function App() {
  const initialCachedPrinters = useMemo(() => getCachedSystemPrinters(), []);
  const recentTemplateStoreRef = useRef<RecentTemplateStore | null>(null);
  const legacyRecentItemsRef = useRef<RecentTemplateItem[] | null>(null);
  if (!recentTemplateStoreRef.current) recentTemplateStoreRef.current = createRecentTemplateStore();
  if (!legacyRecentItemsRef.current) legacyRecentItemsRef.current = takeLegacyRecentOpenedItems();
  const recentTemplateStore = recentTemplateStoreRef.current;
  const cloudServicesRef = useRef<{
    api: CloudApiClient;
    session: CloudAuthSession;
    repository: CloudLabelRepository;
    cache: CloudCacheStore;
    assetRepository: CloudAssetRepository;
    assetCache: CloudAssetCache;
  } | null>(null);
  if (!cloudServicesRef.current) {
    let session!: CloudAuthSession;
    const client = new CloudApiClient({
      getAccessToken: () => session?.accessToken ?? null,
      onUnauthorized: async () => session?.refresh() ?? false,
    });
    session = new CloudAuthSession(client, createCredentialStore());
    const assetRepository = new CloudAssetRepository(client);
    const cache = createCloudCacheStore();
    cloudServicesRef.current = {
      api: client,
      session,
      repository: new CloudLabelRepository(
        client,
        cache,
        () => session.user,
        async (content) => prepareCloudContentAssets(content, async (blob, mimeType, kind) =>
          (await assetRepository.upload({ bytes: blob, mimeType, kind })).id
        )
      ),
      cache,
      assetRepository,
      assetCache: createCloudAssetCache(),
    };
  }
  const cloudSession = cloudServicesRef.current.session;
  const cloudApi = cloudServicesRef.current.api;
  const cloudRepository = cloudServicesRef.current.repository;
  const cloudCache = cloudServicesRef.current.cache;
  const cloudAssetRepository = cloudServicesRef.current.assetRepository;
  const cloudAssetCache = cloudServicesRef.current.assetCache;

  const documents = useEditorStore((state) => state.documents);
  const activeDocument = useEditorStore(selectActiveDocument);
  const createDocument = useEditorStore((state) => state.createDocument);
  const closeDocument = useEditorStore((state) => state.closeDocument);
  const setActiveDocument = useEditorStore((state) => state.setActiveDocument);
  const setDocumentTitle = useEditorStore((state) => state.setDocumentTitle);
  const setDocumentFileMeta = useEditorStore((state) => state.setDocumentFileMeta);
  const setLabelSize = useEditorStore((state) => state.setLabelSize);
  const setPrinterConfig = useEditorStore((state) => state.setPrinterConfig);
  const setCalibration = useEditorStore((state) => state.setCalibration);
  const replaceElements = useEditorStore((state) => state.replaceElements);
  const setSelection = useEditorStore((state) => state.setSelection);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);

  const rows = useDataImportStore((state) => state.rows);

  const [lastNewLabelSize, setLastNewLabelSize] = useState<LabelSize>(() => readLastNewLabelSize());
  const [newLabelOpen, setNewLabelOpen] = useState(false);
  const [newLabelTitle, setNewLabelTitle] = useState("新建标签");
  const [newLabelWidth, setNewLabelWidth] = useState(lastNewLabelSize.widthMm);
  const [newLabelHeight, setNewLabelHeight] = useState(lastNewLabelSize.heightMm);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTitle, setSettingsTitle] = useState("");
  const [settingsWidth, setSettingsWidth] = useState(40);
  const [settingsHeight, setSettingsHeight] = useState(30);

  const [printOpen, setPrintOpen] = useState(false);
  const [printTarget, setPrintTarget] = useState<PrintTarget | null>(null);
  const [pdfOutputDialog, setPdfOutputDialog] = useState<PdfOutputDialog | null>(null);
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState<string[]>(initialCachedPrinters);
  const [softwareDefaultPrinterId, setSoftwareDefaultPrinterId] = useState<string>(() => readSoftwareDefaultPrinterId());
  const [hasLoadedSystemPrinters, setHasLoadedSystemPrinters] = useState(false);
  const [systemPrinterCount, setSystemPrinterCount] = useState(0);
  const [usingCachedPrinters, setUsingCachedPrinters] = useState(initialCachedPrinters.length > 0);
  const [toolbarStatus, setToolbarStatus] = useState("");
  const copiedElementsRef = useRef<EditorElement[]>([]);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [openLabelDialogOpen, setOpenLabelDialogOpen] = useState(false);
  const [openLabelCategoryFilter, setOpenLabelCategoryFilter] = useState(OPEN_LABEL_ALL_CATEGORIES);
  const [openLabelContentScrollTop, setOpenLabelContentScrollTop] = useState(0);
  const openLabelContentRef = useRef<HTMLDivElement | null>(null);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [templateLibraryLoading, setTemplateLibraryLoading] = useState(false);
  const [templateRows, setTemplateRows] = useState<TemplateDto[]>([]);
  const [officialTemplateDialogOpen, setOfficialTemplateDialogOpen] = useState(false);
  const [officialTemplateLoading, setOfficialTemplateLoading] = useState(false);
  const [officialTemplates, setOfficialTemplates] = useState<OfficialTemplateSummary[]>([]);
  const [systemFonts, setSystemFonts] = useState<FontOption[]>(DEFAULT_FONT_OPTIONS);
  const [titlebarDragStart, setTitlebarDragStart] = useState<{ x: number; y: number } | null>(null);
  const [activePage, setActivePage] = useState<"editor" | "home">("home");
  const [homeLibraryTab, setHomeLibraryTab] = useState<"recent" | "labels">("recent");
  // undefined means all labels; null represents labels without a category.
  const [homeSelectedCategoryId, setHomeSelectedCategoryId] = useState<string | null | undefined>(undefined);
  const [homeCloudLabelListScrollTop, setHomeCloudLabelListScrollTop] = useState(0);
  const [pendingCloseConfirm, setPendingCloseConfirm] = useState<CloseConfirmRequest | null>(null);
  const [saveDialogRequest, setSaveDialogRequest] = useState<SaveDialogRequest | null>(null);
  const [saveDialogPending, setSaveDialogPending] = useState(false);
  const [recentOpenedItems, setRecentOpenedItems] = useState<RecentTemplateItem[]>(() => legacyRecentItemsRef.current ?? []);
  const [homeSearchKeyword, setHomeSearchKeyword] = useState("");
  const [cloudAuthState, setCloudAuthState] = useState<CloudAuthState>(() => cloudSession.state);
  const [cloudLabels, setCloudLabels] = useState<CachedCloudLabel[]>([]);
  const [cloudCategories, setCloudCategories] = useState<LabelCategory[]>([]);
  const [cloudLabelView, setCloudLabelView] = useState<"active" | "trash">("active");
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudLoadingMore, setCloudLoadingMore] = useState(false);
  const [cloudNextCursor, setCloudNextCursor] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState("");
  const [cloudSource, setCloudSource] = useState<"cloud" | "cache" | null>(null);
  const [cloudAuthDialogOpen, setCloudAuthDialogOpen] = useState(false);
  const [cloudAuthPending, setCloudAuthPending] = useState(false);
  const [cloudAuthError, setCloudAuthError] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const cloudListQueryRef = useRef("");
  const cloudListRequestRef = useRef(0);

  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);
  const savedFileHandlesRef = useRef<Map<string, SaveFileHandle>>(new Map());
  const savedDocumentSignaturesRef = useRef<Map<string, string>>(new Map());
  const openTemplateFilePayloadRef = useRef<
    (sourcePath: string, bytes: Uint8Array, displayFileName?: string) => Promise<void>
  >(async () => {});
  const availablePrintersRef = useRef<string[]>(initialCachedPrinters);
  const printerRefreshPendingRef = useRef(false);
  const hasLoadedSystemPrintersRef = useRef(hasLoadedSystemPrinters);
  const cloudBindingsRef = useRef<Map<string, CloudDocumentBinding>>(new Map());
  const updateCoordinatorRef = useRef<UpdateCoordinator | null>(null);
  const automaticUpdateCheckRunningRef = useRef(false);

  const printableRows = useMemo(() => (rows.length > 0 ? rows : [{ code: "123456789" }]), [rows]);
  const printDialogPrinters = useMemo(() => {
    const normalized = softwareDefaultPrinterId.trim();
    if (!normalized || availablePrinters.includes(normalized)) {
      return availablePrinters;
    }
    return [normalized, ...availablePrinters];
  }, [availablePrinters, softwareDefaultPrinterId]);
  const activePrintDialogPrinterId = useMemo(() => {
    const normalized = softwareDefaultPrinterId.trim();
    if (normalized) {
      return normalized;
    }
    if (availablePrinters.length > 0) {
      return availablePrinters[0];
    }
    return printTarget?.printerId || activeDocument.printerId;
  }, [activeDocument.printerId, availablePrinters, printTarget?.printerId, softwareDefaultPrinterId]);
  const activePrintTarget = printTarget ?? {
    title: activeDocument.title,
    labelSize: activeDocument.labelSize,
    elements: activeDocument.elements,
    calibration: activeDocument.calibration,
    printerId: activeDocument.printerId,
    copies: activeDocument.copies,
  };

  useEffect(() => {
    if (!saveDialogRequest || saveDialogRequest.destination !== "cloud" || saveDialogRequest.categoryId !== undefined) {
      return;
    }
    const binding = cloudBindingsRef.current.get(saveDialogRequest.documentId);
    const boundLabel = binding ? cloudLabels.find((label) => label.id === binding.id) : null;
    if (!boundLabel) {
      return;
    }
    setSaveDialogRequest((current) =>
      current && current.documentId === saveDialogRequest.documentId && current.categoryId === undefined
        ? { ...current, categoryId: boundLabel.categoryId ?? null }
        : current
    );
  }, [cloudLabels, saveDialogRequest]);

  const openCurrentDocumentPrintDialog = () => {
    setPrintTarget(null);
    setSubmitStatus("");
    setPrintOpen(true);
  };
  const canUndo = activeDocument.undoStack.length > 0;
  const canRedo = activeDocument.redoStack.length > 0;
  const homeVisibleItems = useMemo(() => {
    return recentOpenedItems.filter((item) => matchesLabelSearch(item.fileName, homeSearchKeyword));
  }, [homeSearchKeyword, recentOpenedItems]);

  useEffect(() => {
    let active = true;
    void recentTemplateStore.list().then((stored) => {
      if (!active) return;
      const validated = parseRecentOpenedItems(JSON.stringify(stored));
      if (validated.length) {
        setRecentOpenedItems(validated);
        return;
      }
      const legacy = legacyRecentItemsRef.current ?? [];
      if (legacy.length) void recentTemplateStore.replaceAll(legacy);
    }).catch(() => {
      // The in-memory state remains usable if native persistence is temporarily unavailable.
    });
    return () => { active = false; };
  }, [recentTemplateStore]);
  const hasOnlyInitialUntouchedDocument = documents.length === 1 && isInitialUntouchedDocument(documents[0]);
  const visibleDocuments = activePage === "home" && hasOnlyInitialUntouchedDocument ? [] : documents;

  const refreshCloudLabels = useCallback(
    async (view = cloudLabelView, query = cloudListQueryRef.current) => {
      const requestId = ++cloudListRequestRef.current;
      setCloudLoadingMore(false);
      if (!cloudSession.user) {
        setCloudLabels([]);
        setCloudNextCursor(null);
        setCloudSource(null);
        return;
      }
      setCloudLoading(true);
      setCloudError("");
      try {
        const result = await cloudRepository.list({
          status: view,
          sort: "updated_desc",
          limit: 50,
          query: query.trim() || undefined,
        });
        if (requestId !== cloudListRequestRef.current) return;
        setCloudLabels(result.items);
        setCloudNextCursor(result.nextCursor);
        setCloudSource(result.source);
      } catch (error) {
        if (requestId !== cloudListRequestRef.current) return;
        setCloudError(toCloudErrorMessage(error));
        setCloudLabels([]);
        setCloudNextCursor(null);
        setCloudSource(null);
      } finally {
        if (requestId === cloudListRequestRef.current) {
          setCloudLoading(false);
        }
      }
    },
    [cloudLabelView, cloudRepository, cloudSession]
  );

  const refreshCloudProfile = useCallback(async () => {
    if (!cloudSession.user) return;
    try {
      await cloudSession.refreshProfile();
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  }, [cloudSession]);

  const refreshCloudCategories = useCallback(async () => {
    if (!cloudSession.user) {
      setCloudCategories([]);
      return;
    }
    try {
      setCloudCategories(await cloudApi.listLabelCategories());
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  }, [cloudApi, cloudSession]);

  const loadMoreCloudLabels = useCallback(async () => {
    const cursor = cloudNextCursor;
    if (!cloudSession.user || !cursor || cloudLoading || cloudLoadingMore || cloudSource !== "cloud") return;
    const requestId = ++cloudListRequestRef.current;
    setCloudLoadingMore(true);
    setCloudError("");
    try {
      const result = await cloudRepository.list({
        status: cloudLabelView,
        sort: "updated_desc",
        limit: 50,
        cursor,
        query: cloudListQueryRef.current.trim() || undefined,
      });
      if (requestId !== cloudListRequestRef.current) return;
      setCloudLabels((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !knownIds.has(item.id))];
      });
      setCloudNextCursor(result.nextCursor);
      setCloudSource(result.source);
    } catch (error) {
      if (requestId !== cloudListRequestRef.current) return;
      setCloudError(toCloudErrorMessage(error));
    } finally {
      if (requestId === cloudListRequestRef.current) {
        setCloudLoadingMore(false);
      }
    }
  }, [cloudLabelView, cloudLoading, cloudLoadingMore, cloudNextCursor, cloudRepository, cloudSession, cloudSource]);

  const selectCloudLabelView = (view: "active" | "trash") => {
    setCloudLabelView(view);
    void refreshCloudLabels(view);
  };

  const onChangeHomeSearchKeyword = (value: string) => {
    setHomeSearchKeyword(value);
    cloudListQueryRef.current = value.trim();
    if (cloudSession.user) {
      void refreshCloudLabels(cloudLabelView, cloudListQueryRef.current);
    }
  };

  useEffect(() => {
    const unsubscribe = cloudSession.subscribe((state) => setCloudAuthState(state));
    void cloudSession.restore().then((state) => {
      if (state.status === "authenticated") {
        void refreshCloudLabels();
        void refreshCloudCategories();
      } else if (shouldOpenCloudAuthOnStartup(state)) {
        setCloudAuthDialogOpen(true);
      }
    });
    return unsubscribe;
  }, [cloudSession, refreshCloudCategories, refreshCloudLabels]);

  useEffect(() => {
    const unsubscribeIdChange = cloudRepository.onLabelIdChanged((previousId, next) => {
      cloudBindingsRef.current.forEach((binding, documentId) => {
        if (binding.id === previousId) {
          cloudBindingsRef.current.set(documentId, {
            id: next.id,
            revision: next.revision,
            syncStatus: next.syncStatus,
          });
        }
      });
      setRecentOpenedItems((current) => {
        let changed = false;
        const migrated = current.map((item) => {
          if (item.source !== "cloud" || item.cloudLabelId !== previousId) {
            return item;
          }
          changed = true;
          return { ...item, cloudLabelId: next.id };
        });
        if (changed) {
          void recentTemplateStore.replaceAll(migrated).catch(() => undefined);
        }
        return changed ? migrated : current;
      });
    });
    const syncPendingAndRefresh = () => {
      if (!cloudSession.user) {
        if (cloudSession.state.status === "loading") {
          void cloudSession.restore().then((state) => {
            if (state.status === "authenticated") void refreshCloudLabels();
          });
        }
        return;
      }
      void cloudRepository.syncPending()
        .then((result) => {
          if (result.synced || result.conflicts) {
            void refreshCloudLabels();
            if (result.synced) void refreshCloudProfile();
          }
        })
        .catch(() => undefined);
    };
    window.addEventListener("online", syncPendingAndRefresh);
    window.addEventListener("focus", syncPendingAndRefresh);
    const retryInterval = window.setInterval(syncPendingAndRefresh, 30_000);
    return () => {
      unsubscribeIdChange();
      window.removeEventListener("online", syncPendingAndRefresh);
      window.removeEventListener("focus", syncPendingAndRefresh);
      window.clearInterval(retryInterval);
    };
  }, [cloudRepository, cloudSession, recentTemplateStore, refreshCloudLabels, refreshCloudProfile]);

  const markDocumentSavedBySnapshot = (documentId: string, snapshot: TemplateSnapshot) => {
    savedDocumentSignaturesRef.current.set(documentId, toSnapshotSignature(cloneSnapshot(snapshot)));
  };

  const isDocumentUnsaved = (document: EditorDocument): boolean => {
    const savedSignature = savedDocumentSignaturesRef.current.get(document.id);
    if (!savedSignature) {
      // A newly created or opened document can be closed before the effect
      // below registers its baseline snapshot.  In that short interval, only
      // an actual edit history should trigger the unsaved-changes warning.
      return document.undoStack.length > 0 || document.redoStack.length > 0;
    }
    const currentSignature = toSnapshotSignature(buildTemplateSnapshot(document));
    return currentSignature !== savedSignature;
  };

  const closeDocumentNow = (documentId: string): boolean => {
    const currentDocuments = useEditorStore.getState().documents;
    const target = currentDocuments.find((document) => document.id === documentId);
    if (!target) {
      return false;
    }

    const currentVisibleDocuments =
      activePage === "home" && currentDocuments.length === 1 && isInitialUntouchedDocument(currentDocuments[0])
        ? []
        : currentDocuments;
    const closingLastVisible = currentVisibleDocuments.length <= 1;
    closeDocument(target.id);
    cloudBindingsRef.current.delete(target.id);
    if (closingLastVisible) {
      setActivePage("home");
    }
    setToolbarStatus(`已关闭标签：${target.title}`);
    return true;
  };

  const closeDocumentWithPrompt = (documentId: string): boolean => {
    const target = useEditorStore.getState().documents.find((document) => document.id === documentId);
    if (!target) {
      return false;
    }
    if (isDocumentUnsaved(target)) {
      setPendingCloseConfirm({
        kind: "tab",
        documentId: target.id,
        documentTitle: target.title,
      });
      return false;
    }
    return closeDocumentNow(target.id);
  };

  const dismissCloseConfirm = () => {
    const request = pendingCloseConfirm;
    if (!request) {
      return;
    }
    if (request.kind === "app") {
      setToolbarStatus("已取消关闭程序。");
    } else {
      setToolbarStatus(`已取消关闭：${request.documentTitle}`);
    }
    setPendingCloseConfirm(null);
  };

  const acceptCloseConfirm = () => {
    const request = pendingCloseConfirm;
    if (!request) {
      return;
    }
    setPendingCloseConfirm(null);
    if (request.kind === "app") {
      void closeWindow();
      return;
    }
    closeDocumentNow(request.documentId);
  };

  const saveAndCloseConfirmTab = async () => {
    const request = pendingCloseConfirm;
    if (!request || request.kind !== "tab") {
      return;
    }

    setPendingCloseConfirm(null);
    await saveDocumentToOriginOrChoose(request.documentId, true);
  };

  const focusOpenedDocumentByFileName = (fileName: string): boolean => {
    const lookupKey = normalizeDocumentLookupKey(fileName);
    if (!lookupKey) {
      return false;
    }

    const existing = documents.find((document) => {
      if (!document.filePath) {
        return false;
      }
      return normalizeDocumentLookupKey(document.filePath) === lookupKey;
    });
    if (!existing) {
      return false;
    }

    setActiveDocument(existing.id);
    setActivePage("editor");
    setToolbarStatus(`已切换到已打开模板：${existing.title}。`);
    return true;
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!fileMenuRef.current) {
        return;
      }
      if (!fileMenuRef.current.contains(event.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (isEditableShortcutTarget(event.target)) {
        return;
      }
      if (!event.ctrlKey) {
        return;
      }
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  useEffect(() => {
    let cancelled = false;

    const loadFonts = async () => {
      const [tauriFonts, localFonts] = await Promise.all([listSystemFonts(), listBrowserLocalFonts()]);
      const options = buildFontOptions(tauriFonts, localFonts);
      if (!cancelled) {
        setSystemFonts(options);
      }
    };

    void loadFonts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    availablePrintersRef.current = availablePrinters;
  }, [availablePrinters]);

  useEffect(() => {
    if (availablePrinters.length === 0) {
      return;
    }
    const normalized = softwareDefaultPrinterId.trim();
    if (normalized && availablePrinters.includes(normalized)) {
      return;
    }
    const nextDefault = availablePrinters[0];
    setSoftwareDefaultPrinterId(nextDefault);
    writeSoftwareDefaultPrinterId(nextDefault);
  }, [availablePrinters, softwareDefaultPrinterId]);

  useEffect(() => {
    hasLoadedSystemPrintersRef.current = hasLoadedSystemPrinters;
  }, [hasLoadedSystemPrinters]);

  const refreshSystemPrinters = useCallback(async (background = true) => {
    if (printerRefreshPendingRef.current) {
      return;
    }
    printerRefreshPendingRef.current = true;
    if (!background) {
      setLoadingPrinters(true);
    }
    try {
      const fromSystem = await listSystemPrinters();
      const normalized = Array.from(new Set(fromSystem.map((item) => item.trim()).filter((item) => item.length > 0)));
      if (normalized.length > 0) {
        setHasLoadedSystemPrinters(true);
        setSystemPrinterCount(normalized.length);
        setUsingCachedPrinters(false);
      }
      const currentPrinter = useEditorStore
        .getState()
        .documents.find((document) => document.id === useEditorStore.getState().activeDocumentId)?.printerId;

      const nextPrinters = normalized.length > 0 ? [...normalized] : [...availablePrintersRef.current];
      if (currentPrinter && !nextPrinters.includes(currentPrinter)) {
        nextPrinters.unshift(currentPrinter);
      }
      const previousPrinters = availablePrintersRef.current;
      const sameOrder =
        previousPrinters.length === nextPrinters.length &&
        previousPrinters.every((item, index) => item === nextPrinters[index]);
      if (!sameOrder) {
        availablePrintersRef.current = nextPrinters;
        setAvailablePrinters(nextPrinters);
      }

      if (nextPrinters.length > 0 && (!currentPrinter || !nextPrinters.includes(currentPrinter))) {
        setPrinterConfig({ printerId: nextPrinters[0] });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!background) {
        setSubmitStatus(`读取系统打印机失败：${message}`);
      }
    } finally {
      printerRefreshPendingRef.current = false;
      if (!background) {
        setLoadingPrinters(false);
      }
    }
  }, [setPrinterConfig]);

  useEffect(() => {
    let cancelled = false;
    let delayHandle: number | null = null;
    let idleHandle: number | null = null;

    const runWarmup = () => {
      if (cancelled || hasLoadedSystemPrintersRef.current) {
        return;
      }
      void refreshSystemPrinters(true);
    };

    const scheduleIdleWarmup = () => {
      if (cancelled || hasLoadedSystemPrintersRef.current) {
        return;
      }
      const idleWindow = window as IdleCallbackWindow;
      if (typeof idleWindow.requestIdleCallback === "function") {
        idleHandle = idleWindow.requestIdleCallback(() => {
          runWarmup();
        }, { timeout: PRINTER_PREWARM_IDLE_TIMEOUT_MS });
        return;
      }
      runWarmup();
    };

    delayHandle = window.setTimeout(scheduleIdleWarmup, PRINTER_PREWARM_DELAY_MS);
    return () => {
      cancelled = true;
      if (delayHandle !== null) {
        window.clearTimeout(delayHandle);
      }
      const idleWindow = window as IdleCallbackWindow;
      if (idleHandle !== null && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleHandle);
      }
    };
  }, [refreshSystemPrinters]);

  useEffect(() => {
    if (!printOpen || hasLoadedSystemPrinters) {
      return;
    }
    void refreshSystemPrinters(false);
  }, [hasLoadedSystemPrinters, printOpen, refreshSystemPrinters]);

  useEffect(() => {
    if (availablePrinters.length === 0) {
      return;
    }
    if (availablePrinters.includes(activeDocument.printerId)) {
      return;
    }
    const nextPrinterId = availablePrinters[0];
    if (!isDocumentUnsaved(activeDocument)) {
      const nextSnapshot = {
        ...buildTemplateSnapshot(activeDocument),
        printerId: nextPrinterId,
      };
      markDocumentSavedBySnapshot(activeDocument.id, nextSnapshot);
    }
    setPrinterConfig({ printerId: nextPrinterId });
  }, [
    activeDocument,
    availablePrinters,
    isDocumentUnsaved,
    markDocumentSavedBySnapshot,
    setPrinterConfig,
  ]);

  useEffect(() => {
    const existingIds = new Set(documents.map((item) => item.id));
    for (const id of savedFileHandlesRef.current.keys()) {
      if (!existingIds.has(id)) {
        savedFileHandlesRef.current.delete(id);
      }
    }

    const signatures = savedDocumentSignaturesRef.current;
    for (const id of signatures.keys()) {
      if (!existingIds.has(id)) {
        signatures.delete(id);
      }
    }
    for (const document of documents) {
      if (!signatures.has(document.id)) {
        signatures.set(document.id, toSnapshotSignature(buildTemplateSnapshot(document)));
      }
    }
  }, [documents]);

  const replaceRecentOpenedItems = (items: RecentTemplateItem[]) => {
    const next = items.slice(0, HOME_RECENT_LIMIT);
    setRecentOpenedItems(next);
    void recentTemplateStore.replaceAll(next).catch(() => {
      // Keep the active editor usable when the local database cannot be written.
    });
  };

  const rememberRecentOpened = (
    fileName: string,
    snapshot: TemplateSnapshot,
    options: RememberRecentOpenedOptions = {}
  ) => {
    const source = options.source ?? "local";
    const normalizedName = normalizeRecentFileName(fileName, snapshot.title);
    const normalizedPath = options.source === "cloud" ? null : resolveKnownDocumentPath(options.filePath ?? null);
    const cloudLabelId = options.source === "cloud" ? options.cloudLabelId.trim() : null;
    if (source === "cloud" && !cloudLabelId) {
      return;
    }
    const copiedSnapshot = cloneSnapshot(snapshot);
    const openedAt = Date.now();
    const currentLookupKey = source === "cloud"
      ? `cloud:${cloudLabelId}`
      : buildRecentEntryLookupKey(normalizedName, normalizedPath);

    const remaining = recentOpenedItems.filter(
      (item) => buildRecentItemLookupKey(item) !== currentLookupKey
    );
    replaceRecentOpenedItems([
      {
        id: `${openedAt}-${Math.random().toString(16).slice(2, 8)}`,
        fileName: normalizedName,
        source,
        filePath: normalizedPath,
        cloudLabelId,
        saved: true,
        openedAt,
        snapshot: copiedSnapshot,
      },
      ...remaining,
    ]);
  };

  useEffect(() => {
    if (!titlebarDragStart) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      if ((event.buttons & 1) !== 1) {
        setTitlebarDragStart(null);
        return;
      }

      const movedX = Math.abs(event.clientX - titlebarDragStart.x);
      const movedY = Math.abs(event.clientY - titlebarDragStart.y);
      if (movedX < 2 && movedY < 2) {
        return;
      }

      setTitlebarDragStart(null);
      void startDragWindow();
    };

    const onMouseUp = () => {
      setTitlebarDragStart(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [titlebarDragStart]);

  const openNewLabelModal = () => {
    const existingDocumentCount = hasOnlyInitialUntouchedDocument ? 0 : documents.length;
    setNewLabelTitle(`新建标签${existingDocumentCount + 1}`);
    setNewLabelWidth(lastNewLabelSize.widthMm);
    setNewLabelHeight(lastNewLabelSize.heightMm);
    setNewLabelOpen(true);
  };

  const closeActiveDocumentByShortcut = () => {
    closeDocumentWithPrompt(useEditorStore.getState().activeDocumentId);
  };

  const requestCloseWindow = () => {
    const unsavedDocuments = useEditorStore
      .getState()
      .documents.filter((document) => isDocumentUnsaved(document));
    if (unsavedDocuments.length > 0) {
      setPendingCloseConfirm({
        kind: "app",
        unsavedCount: unsavedDocuments.length,
      });
      return;
    }
    void closeWindow();
  };

  const confirmCreateLabel = () => {
    const existingDocumentCount = hasOnlyInitialUntouchedDocument ? 0 : documents.length;
    const nextTitle = newLabelTitle.trim() || `新建标签${existingDocumentCount + 1}`;
    const nextLabelSize = {
      widthMm: parsePositive(newLabelWidth, DEFAULT_NEW_LABEL_SIZE.widthMm),
      heightMm: parsePositive(newLabelHeight, DEFAULT_NEW_LABEL_SIZE.heightMm),
    };
    const initialDocumentId = hasOnlyInitialUntouchedDocument ? documents[0]?.id : null;

    const createdDocumentId = createDocument({
      title: nextTitle,
      labelSize: nextLabelSize,
    });
    markDocumentSavedBySnapshot(createdDocumentId, {
      title: nextTitle,
      labelSize: nextLabelSize,
      elements: [],
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "Zebra-01",
      copies: 1,
    });
    setLastNewLabelSize(nextLabelSize);
    writeLastNewLabelSize(nextLabelSize);
    if (initialDocumentId) {
      closeDocument(initialDocumentId);
    }

    setNewLabelOpen(false);
    setActivePage("editor");
    setToolbarStatus("标签已创建。");
  };

  const openSettingsModal = () => {
    setSettingsTitle(activeDocument.title);
    setSettingsWidth(activeDocument.labelSize.widthMm);
    setSettingsHeight(activeDocument.labelSize.heightMm);
    setSettingsOpen(true);
  };

  const confirmSettings = () => {
    setDocumentTitle(activeDocument.id, settingsTitle.trim() || activeDocument.title);
    setLabelSize({
      widthMm: parsePositive(settingsWidth, activeDocument.labelSize.widthMm),
      heightMm: parsePositive(settingsHeight, activeDocument.labelSize.heightMm),
    });
    setSettingsOpen(false);
    setToolbarStatus("标签设置已更新。");
  };

  const onSubmitPrint = async (directPrintInput: DirectPrintSubmitInput): Promise<boolean> => {
    if (activePrintTarget.elements.length === 0) {
      setSubmitStatus("打印前请至少添加一个元素。");
      return false;
    }

    const requestedCopies = Math.max(1, Math.floor(directPrintInput.copies));

    setSubmitting(true);
    setSubmitStatus("正在提交到系统打印机...");

    try {
      const payload = buildPrintSubmitPayload({
        templateId: 1,
        templateVersion: 2,
        labelSize: activePrintTarget.labelSize,
        printerId: directPrintInput.printerId,
        copies: requestedCopies,
        calibration: activePrintTarget.calibration,
        elements: activePrintTarget.elements,
        records: printableRows,
      });
      const submitPayload = toSubmitTaskPayload(payload);
      const printResult = await submitDirectPrint({
        templateId: submitPayload.templateId,
        totalItems: submitPayload.totalItems,
        printerId: directPrintInput.printerId,
        copies: submitPayload.copies,
        calibrationJson: JSON.stringify(submitPayload.calibration),
        payloadJson: submitPayload.payload,
        previewPngBase64s: directPrintInput.previewPngBase64s,
        widthMm: directPrintInput.widthMm,
        heightMm: directPrintInput.heightMm,
        title: activePrintTarget.title,
      });
      if (printResult.outputPath) {
        setPdfOutputDialog({
          path: printResult.outputPath,
          directory: getParentDirectory(printResult.outputPath),
        });
        setSubmitStatus(
          `已输出 PDF（${printResult.outputPath}），任务 #${printResult.jobId}，${payload.totalItems} 条数据 × ${requestedCopies} 份。`
        );
      } else {
        setSubmitStatus(
          `已直接提交到打印机“${directPrintInput.printerId}”（任务 #${printResult.jobId}，${payload.totalItems} 条数据 × ${requestedCopies} 份）。`
        );
      }
      return true;
    } catch (error) {
      setSubmitStatus(`提交失败：${toChineseErrorMessage(error)}`);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const onSelectDefaultPrinterForSoftware = (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }
    setSoftwareDefaultPrinterId(normalized);
    writeSoftwareDefaultPrinterId(normalized);
  };

  const onPrintCopiesChange = (value: number) => {
    if (printTarget) {
      setPrintTarget((current) => (current ? { ...current, copies: value } : current));
      return;
    }
    setPrinterConfig({ copies: value });
  };

  const writeTemplateBundleToHandle = async (bundle: Uint8Array, handle: SaveFileHandle) => {
    const writable = await handle.createWritable();
    await writable.write(toOwnedArrayBuffer(bundle));
    await writable.close();
  };

  const saveTemplateBundleWithDialog = async (
    bundle: Uint8Array,
    suggestedBaseName: string
  ): Promise<SaveTemplateResult | null> => {
    const pickerWindow = window as SaveFilePickerWindow;
    const suggestedName = `${sanitizeFileName(suggestedBaseName)}.lpt`;
    const fileBuffer = toOwnedArrayBuffer(bundle);

    const nativeSelection = await pickTemplateSavePath(suggestedName);
    if (nativeSelection.status === "cancelled") {
      return null;
    }
    if (nativeSelection.status === "selected") {
      const saved = await saveTemplateFile(nativeSelection.file.filePath, bundle);
      if (!saved) {
        throw new Error("当前运行环境不支持保存到所选位置。");
      }
      return {
        mode: "path",
        fileName: saved.fileName?.trim() || nativeSelection.file.fileName,
        filePath: nativeSelection.file.filePath,
        replacedExisting: nativeSelection.file.replacingExisting,
      };
    }

    if (typeof pickerWindow.showSaveFilePicker === "function") {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "标签模板",
            accept: {
              "application/octet-stream": [".lpt"],
            },
          },
        ],
      });
      const pickedFileName = handle.name?.trim() || suggestedName;
      await writeTemplateBundleToHandle(bundle, handle);
      return {
        mode: "picker",
        fileName: pickedFileName,
        handle,
      };
    }

    const url = URL.createObjectURL(new Blob([fileBuffer], { type: "application/octet-stream" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return {
      mode: "download",
      fileName: suggestedName,
    };
  };

  const saveTemplateBundleToKnownTarget = async (
    bundle: Uint8Array,
    handle: SaveFileHandle
  ): Promise<SaveTemplateResult> => {
    const targetFileName = handle.name?.trim() || "label-template.lpt";
    await writeTemplateBundleToHandle(bundle, handle);
    return {
      mode: "direct",
      fileName: targetFileName,
      handle,
    };
  };

  const saveTemplateBundleToKnownPath = async (
    bundle: Uint8Array,
    filePath: string
  ): Promise<SaveTemplateResult> => {
    const result = await saveTemplateFile(filePath, bundle);
    if (!result) {
      throw new Error("当前运行环境不支持按路径保存。");
    }
    return {
      mode: "path",
      fileName: result.fileName?.trim() || filePath,
      filePath,
    };
  };

  const onSaveTemplate = async (name?: string, documentId?: string): Promise<boolean> => {
    const targetState = useEditorStore.getState();
    const targetDocumentId = documentId ?? targetState.activeDocumentId;
    const document = targetState.documents.find((item) => item.id === targetDocumentId);
    if (!document) {
      setToolbarStatus("当前标签不存在，无法保存。");
      return false;
    }

    try {
      const explicitName = name?.trim() || "";
      const snapshot = buildTemplateSnapshot(document);
      const packed = packTemplateBundle(snapshot);

      let result: SaveTemplateResult | null;
      if (!explicitName) {
        if (isDdlDocumentPath(document.filePath)) {
          result = await saveTemplateBundleWithDialog(packed, document.title);
        } else {
          const knownHandle = savedFileHandlesRef.current.get(document.id);
          const knownPath = resolveKnownDocumentPath(document.filePath);
          if (knownHandle) {
            result = await saveTemplateBundleToKnownTarget(packed, knownHandle);
          } else if (knownPath) {
            result = await saveTemplateBundleToKnownPath(packed, knownPath);
          } else {
            result = await saveTemplateBundleWithDialog(packed, document.title);
          }
        }
      } else {
        result = await saveTemplateBundleWithDialog(packed, explicitName);
      }

      if (!result) {
        setToolbarStatus("已取消保存。");
        return false;
      }

      if (result.handle) {
        savedFileHandlesRef.current.set(document.id, result.handle);
      }

      const savedTitle = normalizeRecentFileName(result.fileName, explicitName || snapshot.title);
      const savedSnapshot: TemplateSnapshot = {
        ...snapshot,
        title: savedTitle,
      };
      const nextFilePath =
        result.mode === "path"
          ? result.filePath || document.filePath
          : result.handle
            ? result.fileName
            : document.filePath;

      setDocumentFileMeta(
        document.id,
        nextFilePath,
        savedTitle
      );
      markDocumentSavedBySnapshot(document.id, savedSnapshot);
      rememberRecentOpened(savedTitle, savedSnapshot, { filePath: nextFilePath ?? null });

      if (result.replacedExisting) {
        setToolbarStatus(`已确认覆盖同名文件：${result.fileName}`);
      } else if (result.mode === "download") {
        setToolbarStatus("模板已下载。");
      } else if (result.mode === "direct" || result.mode === "path") {
        setToolbarStatus("模板已保存。");
      } else {
        setToolbarStatus("模板已保存到文件。");
      }
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setToolbarStatus("已取消保存。");
        return false;
      }
      setToolbarStatus(`保存失败：${toChineseErrorMessage(error)}`);
      return false;
    }
  };

  const openSaveDialog = (
    destination: "cloud" | "local" = "cloud",
    forceSaveAs = false,
    documentId?: string,
    closeAfterSave = false
  ) => {
    const state = useEditorStore.getState();
    const targetDocumentId = documentId ?? state.activeDocumentId;
    const document = state.documents.find((item) => item.id === targetDocumentId);
    if (!document) {
      setToolbarStatus("当前标签不存在，无法保存。");
      return;
    }
    setSaveDialogRequest({
      documentId: document.id,
      name: document.title,
      destination,
      categoryId: cloudBindingsRef.current.get(document.id)
        ? cloudLabels.find((label) => label.id === cloudBindingsRef.current.get(document.id)?.id)?.categoryId
        : null,
      forceSaveAs,
      closeAfterSave,
    });
    if (destination === "cloud" && cloudSession.user) {
      void Promise.all([refreshCloudLabels("active"), refreshCloudCategories()]);
    }
  };

  const confirmSaveDialog = async () => {
    if (!saveDialogRequest || saveDialogPending) {
      return;
    }
    const name = saveDialogRequest.name.trim();
    if (!name) {
      setToolbarStatus("请输入标签名称。");
      return;
    }
    setSaveDialogPending(true);
    const request = saveDialogRequest;
    try {
      const saved = request.destination === "cloud"
        ? await onSaveToCloud(request.documentId, { name, categoryId: request.categoryId })
        : await onSaveTemplate(
            request.forceSaveAs
            || useEditorStore.getState().documents.find((item) => item.id === request.documentId)?.title !== name
              ? name
              : undefined,
            request.documentId
          );
      if (saved) {
        setSaveDialogRequest(null);
        if (request.closeAfterSave) {
          closeDocumentNow(request.documentId);
        }
      }
    } finally {
      setSaveDialogPending(false);
    }
  };

  const onSaveToCloud = async (
    documentId?: string,
    options?: { name?: string; categoryId?: string | null }
  ): Promise<boolean> => {
    const document = useEditorStore
      .getState()
      .documents.find((item) => item.id === (documentId ?? useEditorStore.getState().activeDocumentId));
    if (!document) {
      setToolbarStatus("当前标签不存在，无法保存到云端。");
      return false;
    }
    if (!cloudSession.user) {
      setCloudAuthError("");
      setCloudAuthDialogOpen(true);
      setToolbarStatus("请先登录后再保存到云端。本地文件不会被自动上传。");
      return false;
    }

    try {
      setToolbarStatus("正在保存到云端...");
      const snapshot = buildTemplateSnapshot(document);
      const desiredName = options?.name?.trim() || document.title;
      const sourceContent = toCloudLabelContent(snapshot);
      let content: CloudLabelContentV1;
      try {
        content = await prepareCloudContentAssets(sourceContent, async (blob, mimeType, kind) =>
          (await cloudAssetRepository.upload({ bytes: blob, mimeType, kind })).id
        );
      } catch (error) {
        if (!isNetworkOrServiceError(error)) throw error;
        // The repository queues this unmodified content locally; syncPending converts data URLs
        // into managed assets before its later server request.
        content = sourceContent;
      }
      const binding = cloudBindingsRef.current.get(document.id);
      const saved = binding
        ? await cloudRepository.update(binding.id, { expectedRevision: binding.revision, content })
        : await cloudRepository.create({ name: desiredName, content });

      let finalBinding: CloudDocumentBinding = {
        id: saved.id,
        revision: saved.revision,
        syncStatus: saved.syncStatus,
      };
      let savedCategoryId = saved.categoryId ?? null;
      if (desiredName !== saved.name) {
        const renamed = await cloudRepository.rename(saved.id, desiredName, saved.revision);
        finalBinding = { id: renamed.id, revision: renamed.revision, syncStatus: renamed.syncStatus };
        savedCategoryId = renamed.categoryId ?? savedCategoryId;
      }
      const desiredCategoryId = options?.categoryId;
      if (desiredCategoryId !== undefined && desiredCategoryId !== savedCategoryId && !finalBinding.id.startsWith("local-")) {
        const categorized = await cloudApi.updateLabelCategory(finalBinding.id, desiredCategoryId, finalBinding.revision);
        finalBinding = { id: categorized.id, revision: categorized.revision, syncStatus: "synced" };
      }
      cloudBindingsRef.current.set(document.id, finalBinding);
      const savedSnapshot = { ...snapshot, title: desiredName };
      if (desiredName !== document.title) setDocumentTitle(document.id, desiredName);
      markDocumentSavedBySnapshot(document.id, savedSnapshot);
      rememberRecentOpened(desiredName, savedSnapshot, {
        source: "cloud",
        cloudLabelId: finalBinding.id,
      });
      await Promise.all([refreshCloudLabels(), refreshCloudProfile()]);
      setToolbarStatus(
        finalBinding.syncStatus === "synced" ? "已保存到云端。" : "已写入本地缓存，离线时将自动同步。"
      );
      return true;
    } catch (error) {
      setToolbarStatus(`云端保存失败：${toCloudErrorMessage(error)}`);
      return false;
    }
  };

  const saveDocumentToOriginOrChoose = async (
    documentId?: string,
    closeAfterSave = false
  ): Promise<boolean> => {
    const state = useEditorStore.getState();
    const targetDocumentId = documentId ?? state.activeDocumentId;
    const document = state.documents.find((item) => item.id === targetDocumentId);
    if (!document) {
      setToolbarStatus("当前标签不存在，无法保存。");
      return false;
    }

    const finishDirectSave = async (save: Promise<boolean>) => {
      const saved = await save;
      if (saved && closeAfterSave) {
        closeDocumentNow(document.id);
      }
      return saved;
    };

    if (cloudBindingsRef.current.has(document.id)) {
      return finishDirectSave(onSaveToCloud(document.id));
    }

    const cloudSourceId = document.filePath?.startsWith("cloud://")
      ? document.filePath.slice("cloud://".length).trim()
      : "";
    if (cloudSourceId) {
      try {
        const sourceLabel =
          cloudLabels.find((label) => label.id === cloudSourceId) ??
          await cloudRepository.get(cloudSourceId);
        cloudBindingsRef.current.set(document.id, {
          id: sourceLabel.id,
          revision: sourceLabel.revision,
          syncStatus: sourceLabel.syncStatus,
        });
        return finishDirectSave(onSaveToCloud(document.id));
      } catch (error) {
        setToolbarStatus(`云端保存失败：${toCloudErrorMessage(error)}`);
        return false;
      }
    }

    const knownPath = resolveKnownDocumentPath(document.filePath);
    const hasKnownHandle = savedFileHandlesRef.current.has(document.id);
    if (hasKnownHandle || (knownPath && !isDdlDocumentPath(knownPath))) {
      return finishDirectSave(onSaveTemplate(undefined, document.id));
    }

    openSaveDialog("cloud", false, document.id, closeAfterSave);
    return false;
  };

  const onOpenCloudLibrary = () => {
    setActivePage("home");
    setHomeLibraryTab("labels");
    if (cloudSession.user) {
      void refreshCloudLabels("active");
    }
  };

  const openLabelChooser = () => {
    setOpenLabelDialogOpen(true);
    setCloudLabelView("active");
    const user = cloudSession.user;
    if (user) {
      // Keep already rendered labels visible while the cloud copy refreshes. If this
      // is the first visit, prime the chooser from SQLite before waiting on network.
      const refreshChooser = () => Promise.all([refreshCloudLabels("active"), refreshCloudCategories()]);
      if (cloudLabelView === "active" && cloudLabels.length > 0) {
        void refreshChooser();
      } else {
        void cloudCache.listLabels(user.id)
          .then((cached) => {
            const active = cached
              .filter((label) => !label.deletedAt)
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
            if (active.length > 0) {
              setCloudLabels(active);
              setCloudSource("cache");
            }
          })
          .catch(() => undefined)
          .finally(() => void refreshChooser());
      }
    }
  };

  useEffect(() => {
    if (!openLabelDialogOpen || !openLabelContentRef.current) return;
    openLabelContentRef.current.scrollTop = openLabelContentScrollTop;
  }, [openLabelDialogOpen]);

  const openLocalLabelFromChooser = () => {
    setOpenLabelDialogOpen(false);
    void onPickTemplateFile();
  };

  const openCloudLabelFromDialog = (label: CachedCloudLabel) => {
    setOpenLabelDialogOpen(false);
    void onOpenCloudLabel(label.id, label);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }
      if (isEditableShortcutTarget(event.target) && key !== "s") {
        return;
      }

      if (key === "n") {
        event.preventDefault();
        openNewLabelModal();
        return;
      }
      if (key === "s") {
        event.preventDefault();
        void saveDocumentToOriginOrChoose();
        return;
      }
      if (key === "p") {
        if (activePage !== "editor") {
          return;
        }
        event.preventDefault();
        openCurrentDocumentPrintDialog();
        return;
      }
      if (key === "w") {
        event.preventDefault();
        closeActiveDocumentByShortcut();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePage, closeActiveDocumentByShortcut, saveDocumentToOriginOrChoose]);

  const openSnapshotAsDocument = (
    snapshot: TemplateSnapshot,
    sourceFileName?: string,
    preferredTitle?: string
  ): string | null => {
    if (sourceFileName && focusOpenedDocumentByFileName(sourceFileName)) {
      return null;
    }

    const initialDocumentId = hasOnlyInitialUntouchedDocument ? documents[0]?.id : null;
    const normalizedTitle = preferredTitle?.trim() || snapshot.title;
    const createdDocumentId = createDocument({
      title: normalizedTitle,
      labelSize: snapshot.labelSize,
      filePath: sourceFileName?.trim() || null,
    });
    if (initialDocumentId) {
      closeDocument(initialDocumentId);
    }
    replaceElements(snapshot.elements.map((element) => cloneElement(element)), [], false);
    setCalibration(snapshot.calibration);
    setPrinterConfig({ printerId: snapshot.printerId, copies: snapshot.copies });
    setSelection([]);
    markDocumentSavedBySnapshot(createdDocumentId, {
      ...snapshot,
      title: normalizedTitle,
    });
    setActivePage("editor");
    return createdDocumentId;
  };

  const loadCloudLabelSnapshot = async (
    labelId: string,
    preferredLabel?: CachedCloudLabel
  ): Promise<{ label: CachedCloudLabel; snapshot: TemplateSnapshot }> => {
    if (!cloudSession.user) {
      throw new AuthenticationRequiredError();
    }
    // The list and SQLite cache normally already contain the full document. Using
    // them first removes a network round-trip from every edit/print click.
    const inMemory = preferredLabel ?? cloudLabels.find((item) => item.id === labelId);
    const cached = inMemory?.content
      ? inMemory
      : await cloudCache.getLabel(cloudSession.user.id, labelId);
    const label = cached?.content ? cached : await cloudRepository.get(labelId);
    if (!label.content) {
      throw new Error("此标签内容尚未缓存，请联网后重试。");
    }
    const restored = toTemplateSnapshot(label.content, {
      calibration: { ...activeDocument.calibration },
      printerId: activeDocument.printerId,
      copies: activeDocument.copies,
    });
    const snapshot: TemplateSnapshot = {
      title: label.name,
      labelSize: restored.labelSize,
      elements: restored.elements as EditorElement[],
      calibration: restored.calibration ?? { ...activeDocument.calibration },
      printerId: restored.printerId ?? activeDocument.printerId,
      copies: restored.copies ?? activeDocument.copies,
    };
    return {
      label,
      snapshot: await restoreSnapshotAssetDataUrls(
        snapshot,
        (assetId) => cloudAssetRepository.downloadAsDataUrl(assetId),
        (assetId) => cloudAssetCache.get(cloudSession.user!.id, assetId),
        (assetId, dataUrl) => cloudAssetCache.put(cloudSession.user!.id, assetId, dataUrl)
      ),
    };
  };

  const onOpenCloudLabel = async (labelId: string, preferredLabel?: CachedCloudLabel) => {
    if (!cloudSession.user) {
      setCloudAuthError("");
      setCloudAuthDialogOpen(true);
      return;
    }
    try {
      setCloudError("");
      const { label, snapshot } = await loadCloudLabelSnapshot(labelId, preferredLabel);
      const documentId = openSnapshotAsDocument(snapshot, `cloud://${label.id}`, label.name);
      if (documentId) {
        cloudBindingsRef.current.set(documentId, {
          id: label.id,
          revision: label.revision,
          syncStatus: label.syncStatus,
        });
      }
      rememberRecentOpened(label.name, snapshot, { source: "cloud", cloudLabelId: label.id });
      setToolbarStatus(label.syncStatus === "synced" ? `已打开云标签：${label.name}` : `已从缓存打开云标签：${label.name}`);
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  };

  const onPrintCloudLabel = async (labelId: string, preferredLabel?: CachedCloudLabel) => {
    if (!cloudSession.user) {
      setCloudAuthError("");
      setCloudAuthDialogOpen(true);
      return;
    }
    try {
      setCloudError("");
      const { label, snapshot } = await loadCloudLabelSnapshot(labelId, preferredLabel);
      rememberRecentOpened(label.name, snapshot, { source: "cloud", cloudLabelId: label.id });
      setPrintTarget({
        title: label.name,
        labelSize: snapshot.labelSize,
        elements: snapshot.elements,
        calibration: snapshot.calibration,
        printerId: snapshot.printerId,
        copies: snapshot.copies,
      });
      setSubmitStatus("");
      setPrintOpen(true);
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  };

  const onMoveCloudLabelToTrash = async (labelId: string) => {
    try {
      const current = cloudLabels.find((item) => item.id === labelId);
      await cloudRepository.moveToTrash(labelId, current?.revision);
      await refreshCloudLabels();
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  };

  const onRestoreCloudLabel = async (labelId: string) => {
    try {
      await cloudRepository.restore(labelId);
      await refreshCloudLabels();
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  };

  const onPermanentlyDeleteCloudLabel = async (labelId: string) => {
    if (!window.confirm("永久删除后无法恢复，并会释放一个标签名额。是否继续？")) return;
    try {
      await cloudRepository.permanentlyDelete(labelId);
      await Promise.all([refreshCloudLabels(), refreshCloudProfile()]);
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  };

  const onCreateCloudCategory = async (name: string) => {
    try {
      setCloudError("");
      await cloudApi.createLabelCategory(name);
      await refreshCloudCategories();
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  };

  const onDeleteCloudCategory = async (categoryId: string) => {
    try {
      setCloudError("");
      await cloudApi.deleteLabelCategory(categoryId);
      await Promise.all([refreshCloudCategories(), refreshCloudLabels()]);
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  };

  const onSetCloudLabelCategory = async (labelId: string, categoryId: string | null) => {
    const label = cloudLabels.find((item) => item.id === labelId);
    if (!label) return;
    try {
      setCloudError("");
      await cloudApi.updateLabelCategory(labelId, categoryId, label.revision);
      await refreshCloudLabels();
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  };

  const onResolveCloudConflict = async (labelId: string, resolution: CloudConflictResolution) => {
    const prompt = resolution === "overwrite"
      ? "将本机内容覆盖云端当前版本。是否继续？"
      : resolution === "discard-local"
        ? "将丢弃本机未同步修改并保留云端版本。是否继续？"
        : "将本机未同步修改保存为新的云标签副本。是否继续？";
    if (!window.confirm(prompt)) return;
    try {
      const resolved = await cloudRepository.resolveConflict(labelId, resolution);
      for (const [documentId, binding] of cloudBindingsRef.current) {
        if (binding.id !== labelId) continue;
        if (resolution === "discard-local") cloudBindingsRef.current.delete(documentId);
        else if (resolved) {
          cloudBindingsRef.current.set(documentId, {
            id: resolved.id,
            revision: resolved.revision,
            syncStatus: resolved.syncStatus,
          });
        }
      }
      await Promise.all([refreshCloudLabels(), refreshCloudProfile()]);
      setToolbarStatus(
        resolution === "overwrite" ? "已使用本机内容覆盖云端版本。"
          : resolution === "discard-local" ? "已保留云端版本，本机文档已解除云端绑定。"
            : "已将本机内容另存为新的云标签副本。"
      );
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  };

  const onLoginToCloud = async (input: { email: string; password: string }) => {
    setCloudAuthPending(true);
    setCloudAuthError("");
    try {
      await cloudSession.login(input);
      setCloudAuthDialogOpen(false);
      setCloudLabelView("active");
      await cloudRepository.syncPending();
      await Promise.all([refreshCloudLabels("active"), refreshCloudCategories()]);
    } catch (error) {
      setCloudAuthError(toCloudErrorMessage(error));
    } finally {
      setCloudAuthPending(false);
    }
  };

  const onRegisterCloudAccount = async (input: { email: string; password: string; displayName?: string }) => {
    setCloudAuthPending(true);
    setCloudAuthError("");
    try {
      await cloudSession.register(input);
      setCloudAuthDialogOpen(false);
      setCloudLabelView("active");
      await Promise.all([refreshCloudLabels("active"), refreshCloudCategories()]);
    } catch (error) {
      setCloudAuthError(toCloudErrorMessage(error));
    } finally {
      setCloudAuthPending(false);
    }
  };

  const onRequestCloudPasswordReset = async (email: string) => {
    setCloudAuthPending(true);
    setCloudAuthError("");
    try {
      await cloudSession.requestPasswordReset(email);
      setCloudAuthError("若该邮箱已注册，重置码已发送；请查看邮箱后粘贴重置码。");
    } catch (error) {
      setCloudAuthError(toCloudErrorMessage(error));
    } finally {
      setCloudAuthPending(false);
    }
  };

  const onResetCloudPassword = async (input: { token: string; password: string }) => {
    setCloudAuthPending(true);
    setCloudAuthError("");
    try {
      await cloudSession.resetPassword(input.token, input.password);
      setCloudAuthError("密码已重置，请使用新密码登录。");
    } catch (error) {
      setCloudAuthError(toCloudErrorMessage(error));
    } finally {
      setCloudAuthPending(false);
    }
  };

  const onLogoutFromCloud = async () => {
    try {
      await cloudSession.logout();
      cloudBindingsRef.current.clear();
      setCloudLabels([]);
      setCloudSource(null);
      setCloudError("");
      setToolbarStatus("已退出个人云空间；本地文件和打印功能仍可继续使用。");
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  };

  const onRequestCloudAccountDeletion = async () => {
    if (!window.confirm("注销后将立即冻结云端账号、退出所有设备，并在 14 天后删除云端数据。本机保存的文件不会被删除。是否继续？")) return;
    const userId = cloudSession.user?.id;
    if (!userId) return;
    try {
      const result = await cloudSession.requestAccountDeletion();
      await Promise.all([cloudCache.clearUser(userId), cloudAssetCache.clearUser(userId)]);
      cloudBindingsRef.current.clear();
      setCloudLabels([]);
      setCloudNextCursor(null);
      setCloudSource(null);
      setCloudError("");
      setToolbarStatus(`账号已冻结，将在 ${new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(result.scheduledFor))} 删除云端数据。`);
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    }
  };

  const onOpenPlanAndQuota = () => {
    const user = cloudSession.user;
    if (!user) {
      setCloudAuthDialogOpen(true);
      return;
    }
    const createHint = user.labelUsage.canCreate ? "当前可以继续新建云标签。" : "当前不能新建云标签，请永久删除标签或升级套餐。";
    setToolbarStatus(`当前为${user.plan === "pro" ? "专业版" : "免费版"}，标签数 ${user.labelUsage.used}/${user.labelUsage.limit}。${createHint}`);
  };

  const onOpenOfficialTemplateLibrary = async () => {
    if (!cloudSession.user) {
      setCloudAuthError("");
      setCloudAuthDialogOpen(true);
      return;
    }
    setOfficialTemplateDialogOpen(true);
    setOfficialTemplateLoading(true);
    try {
      setOfficialTemplates(await cloudApi.listOfficialTemplates());
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
      setOfficialTemplates([]);
    } finally {
      setOfficialTemplateLoading(false);
    }
  };

  const onUseOfficialTemplate = async (template: OfficialTemplateSummary) => {
    const name = window.prompt("输入新标签名称", template.name)?.trim();
    if (!name) return;
    try {
      setOfficialTemplateLoading(true);
      const created = await cloudRepository.createFromOfficialTemplate(template.id, name);
      setOfficialTemplateDialogOpen(false);
      await Promise.all([refreshCloudLabels("active"), refreshCloudProfile()]);
      await onOpenCloudLabel(created.id);
      setToolbarStatus(`已从官方模板创建云标签：${created.name}`);
    } catch (error) {
      setCloudError(toCloudErrorMessage(error));
    } finally {
      setOfficialTemplateLoading(false);
    }
  };

  const onCheckForUpdates = async (automatic = false) => {
    if (!UPDATE_CHECK_ENABLED) {
      if (!automatic) setUpdateStatus("自动更新暂未启用，请从发布渠道获取新版本。");
      return;
    }
    try {
      setUpdateStatus("正在检查更新...");
      if (!updateCoordinatorRef.current) {
        const provider = await createTauriUpdateProvider();
        if (!provider) {
          setUpdateStatus("当前 Web 环境不支持桌面更新检查。");
          return;
        }
        updateCoordinatorRef.current = new UpdateCoordinator(provider);
      }
      const update = await updateCoordinatorRef.current.check();
      if (!update) {
        setUpdateStatus("当前已是最新版本。");
        return;
      }
      const policy = update.mandatory
        ? `当前版本已低于最低支持版本${update.minimumSupportedVersion ? ` ${update.minimumSupportedVersion}` : ""}，云功能需要升级后才能继续使用。`
        : "";
      const artifactSize = update.artifactSize ? `（安装包约 ${formatByteSize(update.artifactSize)}）` : "";
      setUpdateStatus(`发现新版本 ${update.version}${artifactSize}${update.notes ? `：${update.notes}` : ""}${policy ? ` ${policy}` : ""}`);
      const prompt = update.mandatory
        ? `${policy}\n\n仍可继续使用本地文件和打印。${artifactSize}现在下载并安装更新吗？`
        : `发现新版本 ${update.version}${artifactSize}。现在下载并安装吗？`;
      if (automatic || !window.confirm(prompt)) return;
      const installResult = await updateCoordinatorRef.current.install(
        {
          printing: submitting,
          hasUnsyncedChanges:
            documents.some((document) => isDocumentUnsaved(document)) ||
            cloudLabels.some((label) => label.syncStatus !== "synced"),
          importingOrExporting: false,
          uploadingAssets: false,
        },
        (progress) => {
          setUpdateStatus(
            progress.totalBytes
              ? `正在下载更新：${Math.round((progress.downloadedBytes / progress.totalBytes) * 100)}%`
              : `正在下载更新：${Math.round(progress.downloadedBytes / 1024 / 1024)} MB`
          );
        }
      );
      if (!installResult.ok) setUpdateStatus(installResult.message);
    } catch {
      setUpdateStatus("无法连接更新服务，请检查网络后重试。");
    }
  };

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const checkSilently = () => {
      if (automaticUpdateCheckRunningRef.current) return;
      automaticUpdateCheckRunningRef.current = true;
      void onCheckForUpdates(true).finally(() => {
        automaticUpdateCheckRunningRef.current = false;
      });
    };
    // Do not delay the home screen. A manual check remains available at all times.
    const initialTimer = window.setTimeout(checkSilently, 5_000);
    const periodicTimer = window.setInterval(checkSilently, 6 * 60 * 60 * 1_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(periodicTimer);
    };
  }, []);

  const openTemplateRecord = (template: TemplateDto) => {
    const snapshot = parseTemplateSnapshot(template.content, template.name);
    if (!snapshot) {
      setToolbarStatus("模板解析失败。");
      return;
    }
    const preferredTitle = normalizeRecentFileName(template.name, snapshot.title);
    const titledSnapshot: TemplateSnapshot = {
      ...snapshot,
      title: preferredTitle,
    };
    const opened = openSnapshotAsDocument(
      titledSnapshot,
      template.name,
      preferredTitle
    );
    rememberRecentOpened(template.name, titledSnapshot, { filePath: template.name });
    if (!opened) {
      return;
    }
    setToolbarStatus(`已打开模板：${template.name}`);
  };

  const onOpenTemplateLibrary = async () => {
    setTemplateLibraryOpen(true);
    setTemplateLibraryLoading(true);
    try {
      const templates = await listTemplates();
      setTemplateRows(templates);
      if (templates.length === 0) {
        setToolbarStatus("模板库为空。");
      }
    } catch (error) {
      setToolbarStatus(`读取模板库失败：${toChineseErrorMessage(error)}`);
      setTemplateRows([]);
    } finally {
      setTemplateLibraryLoading(false);
    }
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const onExportTemplateLpt = () => {
    try {
      const snapshot = buildTemplateSnapshot(activeDocument);
      const packed = packTemplateBundle(snapshot);
      const packedBytes = Uint8Array.from(packed);
      downloadBlob(
        new Blob([packedBytes], { type: "application/octet-stream" }),
        `${activeDocument.title || "label-template"}.lpt`
      );
      setToolbarStatus("已导出为 .lpt 模板。");
    } catch (error) {
      setToolbarStatus(`导出失败：${toChineseErrorMessage(error)}`);
    }
  };

  const onExportTemplateJson = () => {
    const snapshot = buildTemplateSnapshot(activeDocument);
    const data = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `${activeDocument.title || "label-template"}.json`);
    setToolbarStatus("已导出 JSON。");
  };

  const onPickTemplateFile = async () => {
    const picked = await pickTemplateFile();
    if (picked.status === "selected") {
      await openTemplateFilePayload(
        picked.file.filePath,
        new Uint8Array(picked.file.bytes),
        picked.file.fileName
      );
      return;
    }
    if (picked.status === "cancelled") {
      return;
    }
    templateFileInputRef.current?.click();
  };

  const parseTemplatePayload = (
    fileName: string,
    bytes: Uint8Array
  ): {
    snapshot: TemplateSnapshot;
    ddlImportStats: {
      importedCount: number;
      ignoredCount: number;
      ignoredTypes: Array<{ type: string; count: number }>;
    } | null;
  } | null => {
    const lowerName = fileName.toLowerCase();
    const fallbackName = getTemplateFileBaseName(fileName);

    try {
      if (lowerName.endsWith(".lpt")) {
        try {
          return {
            snapshot: unpackTemplateBundle(bytes),
            ddlImportStats: null,
          };
        } catch {
          const fallbackSnapshot = parseTemplateSnapshot(decodeBytesAsUtf8(bytes), fallbackName);
          if (!fallbackSnapshot) {
            return null;
          }
          return {
            snapshot: fallbackSnapshot,
            ddlImportStats: null,
          };
        }
      }

      if (lowerName.endsWith(".ddl")) {
        const ddlResult = parseDdlTemplate(decodeBytesAsUtf8(bytes), fallbackName);
        if (!ddlResult) {
          return null;
        }
        return {
          snapshot: ddlResult.snapshot,
          ddlImportStats: {
            importedCount: ddlResult.importedCount,
            ignoredCount: ddlResult.ignoredCount,
            ignoredTypes: ddlResult.ignoredTypes,
          },
        };
      }

      const snapshot = parseTemplateSnapshot(decodeBytesAsUtf8(bytes), fallbackName);
      if (!snapshot) {
        return null;
      }
      return {
        snapshot,
        ddlImportStats: null,
      };
    } catch {
      return null;
    }
  };

  const openTemplateFilePayload = async (
    sourcePath: string,
    bytes: Uint8Array,
    displayFileName?: string
  ) => {
    const normalizedSourcePath = sourcePath.trim();
    const pathSegments = normalizedSourcePath.split(/[\\/]/);
    const inferredDisplayName = pathSegments[pathSegments.length - 1] || normalizedSourcePath;
    const normalizedDisplayName = (displayFileName?.trim() || inferredDisplayName || "未命名模板").trim();
    const documentSourcePath = (normalizedSourcePath || normalizedDisplayName).trim();

    if (focusOpenedDocumentByFileName(documentSourcePath)) {
      return;
    }

    const parsed = parseTemplatePayload(normalizedDisplayName, bytes);
    if (!parsed) {
      setToolbarStatus("模板解析失败。");
      return;
    }
    const { snapshot, ddlImportStats } = parsed;
    const preferredTitle = normalizeRecentFileName(normalizedDisplayName, snapshot.title);
    const titledSnapshot: TemplateSnapshot = {
      ...snapshot,
      title: preferredTitle,
    };

    const opened = openSnapshotAsDocument(titledSnapshot, documentSourcePath, preferredTitle);
    rememberRecentOpened(normalizedDisplayName, titledSnapshot, { filePath: documentSourcePath });
    if (!opened) {
      return;
    }
    if (ddlImportStats) {
      const ignoredTypeSummary =
        ddlImportStats.ignoredCount > 0 && ddlImportStats.ignoredTypes.length > 0
          ? `，类型：${ddlImportStats.ignoredTypes.map((item) => `${item.type}×${item.count}`).join("、")}`
          : "";
      setToolbarStatus(
        `已打开模板文件：${normalizedDisplayName}（导入${ddlImportStats.importedCount}个元素，忽略${ddlImportStats.ignoredCount}个${ignoredTypeSummary}）`
      );
    } else {
      setToolbarStatus(`已打开模板文件：${normalizedDisplayName}`);
    }
  };

  useEffect(() => {
    openTemplateFilePayloadRef.current = openTemplateFilePayload;
  }, [openTemplateFilePayload]);

  useEffect(() => {
    let cancelled = false;

    let unlisten: (() => void) | null = null;

    const openLaunchFiles = async (launchFiles: LaunchFilePayload[]) => {
      if (cancelled || launchFiles.length === 0) {
        return;
      }

      for (const item of launchFiles) {
        if (cancelled) {
          return;
        }
        const sourcePath = item.filePath?.trim() || item.fileName;
        try {
          await openTemplateFilePayloadRef.current(sourcePath, new Uint8Array(item.bytes), item.fileName);
        } catch {
          // 继续处理后续文件，避免单个异常中断整批启动文件。
        }
      }
    };

    const drainLaunchFiles = async () => {
      const launchFiles = await consumeLaunchFiles();
      await openLaunchFiles(launchFiles);
    };

    const setupLaunchBridge = async () => {
      unlisten = await subscribeLaunchFiles((payloads) => {
        void openLaunchFiles(payloads);
      });
      await drainLaunchFiles();
    };

    const onWindowFocus = () => {
      void drainLaunchFiles();
    };

    window.addEventListener("focus", onWindowFocus);
    void setupLaunchBridge();
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onWindowFocus);
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const onTemplateFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (focusOpenedDocumentByFileName(file.name)) {
        return;
      }

      const parsed = parseTemplatePayload(file.name, await readFileBytes(file));
      if (!parsed) {
        setToolbarStatus("模板解析失败。");
        return;
      }
      const { snapshot, ddlImportStats } = parsed;
      const preferredTitle = normalizeRecentFileName(file.name, snapshot.title);
      const titledSnapshot: TemplateSnapshot = {
        ...snapshot,
        title: preferredTitle,
      };

      const opened = openSnapshotAsDocument(titledSnapshot, file.name, preferredTitle);
      rememberRecentOpened(file.name, titledSnapshot);
      if (!opened) {
        return;
      }
      if (ddlImportStats) {
        const ignoredTypeSummary =
          ddlImportStats.ignoredCount > 0 && ddlImportStats.ignoredTypes.length > 0
            ? `，类型：${ddlImportStats
                .ignoredTypes
                .map((item) => `${item.type}×${item.count}`)
                .join("、")}`
            : "";
        setToolbarStatus(
          `已打开模板文件：${file.name}（导入${ddlImportStats.importedCount}个元素，忽略${ddlImportStats.ignoredCount}个${ignoredTypeSummary}）`
        );
      } else {
        setToolbarStatus(`已打开模板文件：${file.name}`);
      }
    } catch (error) {
      setToolbarStatus(`打开文件失败：${toChineseErrorMessage(error)}`);
    } finally {
      event.target.value = "";
    }
  };

  const onOpenRecentFromHome = (id: string) => {
    const target = recentOpenedItems.find((item) => item.id === id);
    if (!target) {
      setToolbarStatus("最近记录不存在或已失效。");
      return;
    }
    if (target.source === "cloud") {
      if (!target.cloudLabelId) {
        setToolbarStatus("云端最近记录已失效。");
        return;
      }
      const currentLabel = cloudLabels.find((label) => label.id === target.cloudLabelId);
      if (currentLabel?.content) {
        void onOpenCloudLabel(target.cloudLabelId, currentLabel);
      } else {
        // A cloud item in Recent already owns a complete persisted snapshot. Use it
        // immediately instead of blocking the click on a fresh cloud request.
        const snapshot = cloneSnapshot(target.snapshot);
        const documentId = openSnapshotAsDocument(snapshot, `cloud://${target.cloudLabelId}`, target.fileName);
        if (documentId) {
          rememberRecentOpened(target.fileName, snapshot, {
            source: "cloud",
            cloudLabelId: target.cloudLabelId,
          });
          setToolbarStatus(`已从最近使用打开云标签：${target.fileName}`);
          void cloudRepository.get(target.cloudLabelId).then((label) => {
            cloudBindingsRef.current.set(documentId, {
              id: label.id,
              revision: label.revision,
              syncStatus: label.syncStatus,
            });
          }).catch(() => undefined);
        }
      }
      return;
    }
    const snapshot = cloneSnapshot(target.snapshot);
    const preferredTitle = normalizeRecentFileName(target.fileName, snapshot.title);
    const titledSnapshot: TemplateSnapshot = {
      ...snapshot,
      title: preferredTitle,
    };
    const knownPath = resolveKnownDocumentPath(target.filePath ?? null);
    const sourcePath = knownPath || target.fileName;
    const opened = openSnapshotAsDocument(titledSnapshot, sourcePath, preferredTitle);
    rememberRecentOpened(target.fileName, titledSnapshot, { filePath: target.filePath ?? null });
    if (!opened) {
      return;
    }
    if (knownPath) {
      setToolbarStatus(`已从最近使用打开：${target.fileName}`);
    } else {
      setToolbarStatus("已从最近使用打开（缺少原始路径，保存时会提示另存为，请重新从“打开”选择源文件）。");
    }
  };

  const onPrintRecentFromHome = (id: string) => {
    const target = recentOpenedItems.find((item) => item.id === id);
    if (!target) {
      setToolbarStatus("最近记录不存在或已失效。");
      return;
    }
    if (target.source === "cloud") {
      if (!target.cloudLabelId) {
        setToolbarStatus("云端最近记录已失效。");
        return;
      }
      const snapshot = cloneSnapshot(target.snapshot);
      const title = normalizeRecentFileName(target.fileName, snapshot.title);
      setPrintTarget({
        title,
        labelSize: snapshot.labelSize,
        elements: snapshot.elements,
        calibration: snapshot.calibration,
        printerId: snapshot.printerId,
        copies: snapshot.copies,
      });
      setSubmitStatus("");
      setPrintOpen(true);
      rememberRecentOpened(target.fileName, snapshot, {
        source: "cloud",
        cloudLabelId: target.cloudLabelId,
      });
      return;
    }
    const snapshot = cloneSnapshot(target.snapshot);
    const title = normalizeRecentFileName(target.fileName, snapshot.title);
    setPrintTarget({
      title,
      labelSize: snapshot.labelSize,
      elements: snapshot.elements,
      calibration: snapshot.calibration,
      printerId: snapshot.printerId,
      copies: snapshot.copies,
    });
    setSubmitStatus("");
    setPrintOpen(true);
  };

  const onDeleteRecentFromHome = (id: string) => {
    const target = recentOpenedItems.find((item) => item.id === id);
    if (!target) {
      setToolbarStatus("最近记录不存在或已失效。");
      return;
    }
    const next = recentOpenedItems.filter((item) => item.id !== id);
    replaceRecentOpenedItems(next);
    setToolbarStatus(`已删除最近记录：${target.fileName}`);
  };

  const onCopySelection = () => {
    const currentDocument = selectActiveDocument(useEditorStore.getState());
    const selected = currentDocument.elements.filter((element) =>
      currentDocument.selectedIds.includes(element.id)
    );
    if (selected.length === 0) {
      setToolbarStatus("请至少选择一个元素再复制。");
      return;
    }
    copiedElementsRef.current = selected.map((element) => cloneElement(element));
    setToolbarStatus(`已复制 ${selected.length} 个元素。`);
  };

  const onPasteSelection = () => {
    const currentDocument = selectActiveDocument(useEditorStore.getState());
    const copiedElements = copiedElementsRef.current;
    if (copiedElements.length === 0) {
      setToolbarStatus("剪贴板为空。");
      return;
    }

    const copiedAt = Date.now();
    const nextElements = copiedElements.map((element, index) =>
      cloneForPaste(element, index, currentDocument.labelSize, copiedAt)
    );
    replaceElements([...currentDocument.elements, ...nextElements], [], true);
    setSelection(nextElements.map((item) => item.id));
    setToolbarStatus(`已粘贴 ${nextElements.length} 个元素。`);
  };

  const onCutSelection = () => {
    const currentDocument = selectActiveDocument(useEditorStore.getState());
    const selected = currentDocument.elements.filter((element) =>
      currentDocument.selectedIds.includes(element.id)
    );
    if (selected.length === 0) {
      setToolbarStatus("请至少选择一个元素再剪切。");
      return;
    }
    copiedElementsRef.current = selected.map((element) => cloneElement(element));
    deleteSelection();
    setToolbarStatus(`已剪切 ${selected.length} 个元素。`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        activePage !== "editor" ||
        isEditableShortcutTarget(event.target) ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        onCopySelection();
        return;
      }
      if (key === "x") {
        event.preventDefault();
        onCutSelection();
        return;
      }
      if (key === "v") {
        event.preventDefault();
        onPasteSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePage, onCopySelection, onCutSelection, onPasteSelection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) {
        return;
      }

      if (event.key === "Enter") {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, select, textarea")) {
          return;
        }
        if (saveDialogRequest && !saveDialogPending) {
          event.preventDefault();
          void confirmSaveDialog();
          return;
        }
        if (pendingCloseConfirm) {
          event.preventDefault();
          if (pendingCloseConfirm.kind === "tab") {
            void saveAndCloseConfirmTab();
          } else {
            acceptCloseConfirm();
          }
        }
        return;
      }

      if (event.key !== "Escape") {
        return;
      }

      if (saveDialogRequest) {
        if (!saveDialogPending) {
          event.preventDefault();
          setSaveDialogRequest(null);
        }
        return;
      }
      if (pendingCloseConfirm) {
        event.preventDefault();
        dismissCloseConfirm();
        return;
      }
      if (openLabelDialogOpen) {
        event.preventDefault();
        setOpenLabelDialogOpen(false);
        return;
      }
      if (templateLibraryOpen) {
        event.preventDefault();
        setTemplateLibraryOpen(false);
        return;
      }
      if (officialTemplateDialogOpen) {
        if (!officialTemplateLoading) {
          event.preventDefault();
          setOfficialTemplateDialogOpen(false);
        }
        return;
      }
      if (fileMenuOpen) {
        event.preventDefault();
        setFileMenuOpen(false);
        return;
      }
      if (document.querySelector(".modal-mask")) {
        // Feature-owned dialogs handle Escape themselves. Never let Escape
        // pass through an open dialog and close the whole application.
        return;
      }

      event.preventDefault();
      requestCloseWindow();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    acceptCloseConfirm,
    confirmSaveDialog,
    dismissCloseConfirm,
    fileMenuOpen,
    officialTemplateDialogOpen,
    officialTemplateLoading,
    openLabelDialogOpen,
    pendingCloseConfirm,
    requestCloseWindow,
    saveAndCloseConfirmTab,
    saveDialogPending,
    saveDialogRequest,
    templateLibraryOpen,
  ]);

  const onTitlebarBlankMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    if (shouldIgnoreTitlebarAction(event.target)) {
      return;
    }
    setTitlebarDragStart({ x: event.clientX, y: event.clientY });
  };

  const onTitlebarBlankDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (shouldIgnoreTitlebarAction(event.target)) {
      return;
    }
    setTitlebarDragStart(null);
    void toggleMaximizeWindow();
  };

  return (
    <main className={`app-shell ${activePage === "home" ? "home-mode" : ""}`}>
      <input
        ref={templateFileInputRef}
        type="file"
        accept=".lpt,.json,.ddl,application/json,application/xml,text/xml"
        onChange={onTemplateFileChange}
        style={{ display: "none" }}
      />
      <header className="shell-titlebar" onMouseDown={onTitlebarBlankMouseDown} onDoubleClick={onTitlebarBlankDoubleClick}>
        <button
          type="button"
          className="brand brand-home"
          onClick={() => {
            setFileMenuOpen(false);
            setActivePage("home");
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            <img src={appLogo} alt="" draggable={false} />
          </span>
          <span className="brand-name">恒策标签条码打印软件</span>
        </button>

        <div className="titlebar-main">
          <div className="title-tabs">
            {visibleDocuments.map((document) => (
              <div
                key={document.id}
                className={`doc-tab ${document.id === activeDocument.id ? "active" : ""}`}
                data-no-titlebar-action
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveDocument(document.id);
                    setActivePage("editor");
                  }}
                >
                  {document.title}
                </button>
                <button
                  type="button"
                  className="close-tab"
                  onClick={() => closeDocumentWithPrompt(document.id)}
                  aria-label={`关闭${document.title}`}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="new-tab" onClick={openNewLabelModal}>
              + 新建标签
            </button>
          </div>

          <div className="titlebar-spacer" />
        </div>

        <div className="titlebar-actions">
          {cloudAuthState.status === "authenticated" ? (
            <div className="cloud-account-summary" aria-label="云端账号摘要">
              <span className="cloud-account-quota">已使用 {cloudAuthState.user.labelUsage.used} / {cloudAuthState.user.labelUsage.limit} · {cloudAuthState.user.plan === "pro" ? "专业版" : "免费版"}</span>
              <span className="cloud-account-name" title={cloudAuthState.user.displayName ?? "云端账号"}>{cloudAuthState.user.displayName ?? "云端账号"}</span>
              <button type="button" className="cloud-account-action" onClick={() => { setActivePage("home"); setHomeLibraryTab("labels"); }}>我的标签</button>
              <button type="button" className="cloud-account-action" onClick={() => void onLogoutFromCloud()}>退出</button>
            </div>
          ) : (
            <button
              type="button"
              className="cloud-account-button"
              onClick={() => {
                setCloudAuthError("");
                setCloudAuthDialogOpen(true);
              }}
              aria-label="登录或注册云端账号"
            >
              <span aria-hidden="true">☁</span>
              <span>登录 / 注册</span>
            </button>
          )}
          <span className="app-version" title="软件版本">v{desktopPackage.version}</span>
          <button type="button" className="win-btn" aria-label="最小化" onClick={() => void minimizeWindow()}>
            <span className="win-icon win-icon-minimize" aria-hidden="true" />
          </button>
          <button type="button" className="win-btn" aria-label="最大化" onClick={() => void toggleMaximizeWindow()}>
            <span className="win-icon win-icon-maximize" aria-hidden="true" />
          </button>
          <button type="button" className="win-btn close" aria-label="关闭" onClick={requestCloseWindow}>
            <span className="win-icon win-icon-close" aria-hidden="true" />
          </button>
        </div>
      </header>

      {activePage === "editor" ? (
        <section className="shell-commandbar">
        <div className="command-group">
          <div className="file-menu-root" ref={fileMenuRef}>
            <button type="button" className="tool-ghost" onClick={() => setFileMenuOpen((value) => !value)}>
              文件
            </button>
            {fileMenuOpen ? (
              <div className="file-menu-panel">
                <button
                  type="button"
                  className="tool-ghost file-menu-item"
                  onClick={() => {
                    setFileMenuOpen(false);
                    openNewLabelModal();
                  }}
                >
                  新建
                </button>
                <button
                  type="button"
                  className="tool-ghost file-menu-item"
                  onClick={() => {
                    setFileMenuOpen(false);
                    openLabelChooser();
                  }}
                >
                  打开
                </button>
                <button
                  type="button"
                  className="tool-ghost file-menu-item"
                  onClick={() => {
                    setFileMenuOpen(false);
                    templateFileInputRef.current?.click();
                  }}
                >
                  导入
                </button>
                <button
                  type="button"
                  className="tool-ghost file-menu-item"
                  onClick={() => {
                    setFileMenuOpen(false);
                    void saveDocumentToOriginOrChoose();
                  }}
                >
                  保存
                </button>
                <button
                  type="button"
                  className="tool-ghost file-menu-item"
                  data-testid="cmd-export-local"
                  onClick={() => {
                    setFileMenuOpen(false);
                    openSaveDialog("local", true);
                  }}
                >
                  另存为...
                </button>
                <button
                  type="button"
                  className="tool-ghost file-menu-item"
                  onClick={() => {
                    setFileMenuOpen(false);
                    openCurrentDocumentPrintDialog();
                  }}
                >
                  打印
                </button>
              </div>
            ) : null}
          </div>

          <button type="button" className="tool-ghost" onClick={openNewLabelModal}>
            新建
          </button>
          <button type="button" className="tool-ghost" data-testid="cmd-open" onClick={openLabelChooser}>
            打开
          </button>
          <button type="button" className="tool-ghost" data-testid="cmd-save" onClick={() => void saveDocumentToOriginOrChoose()}>
            保存
          </button>
          <button type="button" className="tool-ghost" onClick={openCurrentDocumentPrintDialog}>
            打印
          </button>
        </div>

        <div className="command-separator" />

        <div className="command-group">
          <button type="button" className="tool-ghost" onClick={undo} disabled={!canUndo}>
            后退
          </button>
          <button type="button" className="tool-ghost" onClick={redo} disabled={!canRedo}>
            前进
          </button>
          <button type="button" className="tool-ghost" onClick={onCopySelection} title="Ctrl+C">
            复制
          </button>
          <button type="button" className="tool-ghost" onClick={onCutSelection} title="Ctrl+X">
            剪切
          </button>
          <button type="button" className="tool-ghost" onClick={onPasteSelection} title="Ctrl+V">
            粘贴
          </button>
          <button type="button" className="tool-ghost" onClick={deleteSelection}>
            删除
          </button>
          <button type="button" className="tool-ghost" onClick={openSettingsModal}>
            设置
          </button>
        </div>

        <div className="command-separator" />

        <div className="command-group size-group">
          <label className="size-input">
            宽度
            <input
              type="number"
              min={LABEL_MIN_SIZE_MM}
              value={activeDocument.labelSize.widthMm}
              onChange={(event) => setLabelSize({ widthMm: Number(event.target.value) })}
            />
          </label>
          <label className="size-input">
            高度
            <input
              type="number"
              min={LABEL_MIN_SIZE_MM}
              value={activeDocument.labelSize.heightMm}
              onChange={(event) => setLabelSize({ heightMm: Number(event.target.value) })}
            />
          </label>
        </div>

        <p className={`command-status ${toolbarStatus.includes("失败") ? "warning" : "muted"}`}>
          {toolbarStatus}
        </p>
        </section>
      ) : null}

      {activePage === "editor" ? (
        <EditorPage systemFonts={systemFonts} />
      ) : (
        <HomePage
          searchKeyword={homeSearchKeyword}
          activeLibraryTab={homeLibraryTab}
          onLibraryTabChange={setHomeLibraryTab}
          selectedCategoryId={homeSelectedCategoryId}
          onSelectedCategoryIdChange={setHomeSelectedCategoryId}
          cloudLabelListScrollTop={homeCloudLabelListScrollTop}
          onCloudLabelListScrollTopChange={setHomeCloudLabelListScrollTop}
          recentItems={homeVisibleItems}
          onSearchKeywordChange={onChangeHomeSearchKeyword}
          onCreateLabel={openNewLabelModal}
          onOpenLabel={openLabelChooser}
          onOpenRecent={onOpenRecentFromHome}
          onPrintRecent={onPrintRecentFromHome}
          onDeleteRecent={onDeleteRecentFromHome}
          cloud={{
            state: cloudAuthState.status,
            user: cloudAuthState.status === "authenticated" ? cloudAuthState.user : null,
            labels: cloudLabels,
            categories: cloudCategories,
            view: cloudLabelView,
            loading: cloudLoading,
            loadingMore: cloudLoadingMore,
            hasMore: Boolean(cloudNextCursor && cloudSource === "cloud"),
            error: cloudError,
            source: cloudSource,
            updateStatus,
            onRequestLogin: () => {
              setCloudAuthError("");
              setCloudAuthDialogOpen(true);
            },
            onOpenLocalFile: () => void onPickTemplateFile(),
            onOpenLabel: (id) => void onOpenCloudLabel(id),
            onPrintLabel: (id) => void onPrintCloudLabel(id),
            onRefresh: () => void refreshCloudLabels(),
            onLoadMore: () => void loadMoreCloudLabels(),
            onSetView: selectCloudLabelView,
            onMoveToTrash: (id) => void onMoveCloudLabelToTrash(id),
            onRestore: (id) => void onRestoreCloudLabel(id),
            onPermanentlyDelete: (id) => void onPermanentlyDeleteCloudLabel(id),
            onCreateCategory: (name) => void onCreateCloudCategory(name),
            onDeleteCategory: (id) => void onDeleteCloudCategory(id),
            onSetLabelCategory: (id, categoryId) => void onSetCloudLabelCategory(id, categoryId),
            onResolveConflict: (id, resolution) => void onResolveCloudConflict(id, resolution),
            onOpenPlan: onOpenPlanAndQuota,
            onOpenOfficialTemplates: () => void onOpenOfficialTemplateLibrary(),
            onLogout: () => void onLogoutFromCloud(),
            onRequestAccountDeletion: () => void onRequestCloudAccountDeletion(),
            onCheckForUpdates: () => void onCheckForUpdates(),
          }}
        />
      )}

      <CloudAuthModal
        open={cloudAuthDialogOpen}
        pending={cloudAuthPending}
        error={cloudAuthError}
        onClose={() => setCloudAuthDialogOpen(false)}
        onLogin={onLoginToCloud}
        onRegister={onRegisterCloudAccount}
        onRequestPasswordReset={onRequestCloudPasswordReset}
        onResetPassword={onResetCloudPassword}
      />

      <NewLabelModal
        open={newLabelOpen}
        title={newLabelTitle}
        widthMm={newLabelWidth}
        heightMm={newLabelHeight}
        onClose={() => setNewLabelOpen(false)}
        onTitleChange={setNewLabelTitle}
        onWidthChange={(value) =>
          setNewLabelWidth(Number.isFinite(value) ? value : lastNewLabelSize.widthMm)
        }
        onHeightChange={(value) =>
          setNewLabelHeight(Number.isFinite(value) ? value : lastNewLabelSize.heightMm)
        }
        onConfirm={confirmCreateLabel}
      />

      <NewLabelModal
        open={settingsOpen}
        heading="标签设置"
        confirmText="保存设置"
        title={settingsTitle}
        widthMm={settingsWidth}
        heightMm={settingsHeight}
        onClose={() => setSettingsOpen(false)}
        onTitleChange={setSettingsTitle}
        onWidthChange={(value) => setSettingsWidth(Number.isFinite(value) ? value : activeDocument.labelSize.widthMm)}
        onHeightChange={(value) =>
          setSettingsHeight(Number.isFinite(value) ? value : activeDocument.labelSize.heightMm)
        }
        onConfirm={confirmSettings}
      />

      {openLabelDialogOpen ? (
        <div className="modal-mask" onClick={() => setOpenLabelDialogOpen(false)}>
          <section
            className="modal-card open-label-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="open-label-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <h3 id="open-label-title">打开标签</h3>
              <button type="button" onClick={() => setOpenLabelDialogOpen(false)} aria-label="关闭打开标签窗口">
                ×
              </button>
            </header>
            <div className="open-label-library">
              <aside className="open-label-sidebar" aria-label="标签分类">
                <button type="button" className="primary" onClick={openLocalLabelFromChooser}>
                  从本机打开
                </button>
                <button
                  type="button"
                  className={openLabelCategoryFilter === OPEN_LABEL_ALL_CATEGORIES ? "open-label-category active" : "open-label-category"}
                  onClick={() => setOpenLabelCategoryFilter(OPEN_LABEL_ALL_CATEGORIES)}
                >
                  全部标签
                </button>
                <button
                  type="button"
                  className={openLabelCategoryFilter === OPEN_LABEL_UNCATEGORIZED ? "open-label-category active" : "open-label-category"}
                  onClick={() => setOpenLabelCategoryFilter(OPEN_LABEL_UNCATEGORIZED)}
                >
                  未分类
                </button>
                {cloudCategories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    className={openLabelCategoryFilter === category.id ? "open-label-category active" : "open-label-category"}
                    onClick={() => setOpenLabelCategoryFilter(category.id)}
                    title={category.name}
                  >
                    {category.name}
                  </button>
                ))}
              </aside>
              <section
                className="open-label-content"
                aria-label="我的标签"
                ref={openLabelContentRef}
                onScroll={(event) => setOpenLabelContentScrollTop(event.currentTarget.scrollTop)}
              >
                <header className="open-label-content-header">
                  <div>
                    <strong>我的标签</strong>
                    {cloudLoading && cloudLabels.length > 0
                      ? <span className="muted">正在同步...</span>
                      : cloudSource === "cache" ? <span className="muted">离线缓存</span> : null}
                  </div>
                  {cloudSession.user ? (
                    <button type="button" className="tool-ghost" onClick={() => void refreshCloudLabels("active")}>刷新</button>
                  ) : null}
                </header>
                {!cloudSession.user ? (
                  <div className="open-label-empty">
                    <p className="muted">登录后可在这里查看和打开云端标签。</p>
                    <button type="button" className="primary" onClick={() => {
                      setOpenLabelDialogOpen(false);
                      setCloudAuthError("");
                      setCloudAuthDialogOpen(true);
                    }}>登录 / 注册</button>
                  </div>
                ) : cloudLoading && cloudLabels.length === 0 ? <p className="muted">正在加载标签...</p> : null}
                {cloudSession.user && cloudError ? <p className="warning">{cloudError}</p> : null}
                {cloudSession.user && !cloudError ? (
                  (() => {
                    const labels = cloudLabels.filter((label) => {
                      if (openLabelCategoryFilter === OPEN_LABEL_ALL_CATEGORIES) return true;
                      if (openLabelCategoryFilter === OPEN_LABEL_UNCATEGORIZED) return !label.categoryId;
                      return label.categoryId === openLabelCategoryFilter;
                    });
                    if (labels.length === 0) return <p className="muted">此分类暂无标签。</p>;
                    return (
                      <div className="open-label-grid">
                        {labels.map((label) => (
                          <article className="open-label-card" key={label.id}>
                            <button
                              type="button"
                              className="open-label-thumbnail"
                              onClick={() => openCloudLabelFromDialog(label)}
                              title={`打开标签：${label.name}`}
                            >
                              <CloudLabelThumbnail label={label} />
                            </button>
                            <strong className="open-label-name" title={label.name}>{label.name}</strong>
                            <label className="open-label-move">
                              <span>移动到分类</span>
                              <select
                                value={label.categoryId ?? ""}
                                onChange={(event) => void onSetCloudLabelCategory(label.id, event.target.value || null)}
                              >
                                <option value="">未分类</option>
                                {cloudCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
                              </select>
                            </label>
                          </article>
                        ))}
                      </div>
                    );
                  })()
                ) : null}
              </section>
            </div>
          </section>
        </div>
      ) : null}

      {templateLibraryOpen ? (
        <div className="modal-mask" onClick={() => setTemplateLibraryOpen(false)}>
          <section className="modal-card import-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>模板库</h3>
              <button
                type="button"
                onClick={() => setTemplateLibraryOpen(false)}
                aria-label="关闭模板库"
              >
                ×
              </button>
            </header>
            {templateLibraryLoading ? <p className="muted">正在加载模板...</p> : null}
            {!templateLibraryLoading && templateRows.length === 0 ? (
              <p className="muted">模板库为空，请先保存模板。</p>
            ) : null}
            {!templateLibraryLoading && templateRows.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>模板名称</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {templateRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>
                        <button
                          type="button"
                          className="tool-ghost"
                          onClick={() => {
                            openTemplateRecord(row);
                            setTemplateLibraryOpen(false);
                          }}
                        >
                          打开
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        </div>
      ) : null}

      {officialTemplateDialogOpen ? (
        <div className="modal-mask" onClick={() => !officialTemplateLoading && setOfficialTemplateDialogOpen(false)}>
          <section className="modal-card import-modal" onClick={(event) => event.stopPropagation()} aria-label="官方模板">
            <header className="modal-header">
              <h3>官方模板</h3>
              <button type="button" onClick={() => setOfficialTemplateDialogOpen(false)} disabled={officialTemplateLoading} aria-label="关闭官方模板">×</button>
            </header>
            {officialTemplateLoading ? <p className="muted">正在加载模板...</p> : null}
            {!officialTemplateLoading && officialTemplates.length === 0 ? <p className="muted">暂时没有可用的官方模板。</p> : null}
            {!officialTemplateLoading && officialTemplates.length > 0 ? (
              <table className="table">
                <thead><tr><th>模板</th><th>套餐</th><th>操作</th></tr></thead>
                <tbody>
                  {officialTemplates.map((template) => (
                    <tr key={template.id}>
                      <td><strong>{template.name}</strong><br /><span className="muted">{template.category} · {template.description}</span></td>
                      <td>{template.requiredPlan === "pro" ? "专业版" : "免费"}</td>
                      <td><button type="button" className="tool-ghost" onClick={() => void onUseOfficialTemplate(template)}>使用</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        </div>
      ) : null}

      {saveDialogRequest ? (
        <div className="modal-mask" onClick={() => !saveDialogPending && setSaveDialogRequest(null)}>
          <section
            className="modal-card save-dialog-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <h3 id="save-dialog-title">保存标签</h3>
              <button
                type="button"
                onClick={() => setSaveDialogRequest(null)}
                aria-label="关闭保存标签弹窗"
                disabled={saveDialogPending}
              >
                ×
              </button>
            </header>
            <div className="save-dialog-body">
              <aside className="save-dialog-sidebar" aria-label="保存位置">
                <button
                  type="button"
                  className={saveDialogRequest.destination === "cloud" ? "save-dialog-destination active" : "save-dialog-destination"}
                  onClick={() => {
                    setSaveDialogRequest((current) => current ? { ...current, destination: "cloud" } : current);
                    if (cloudSession.user) void Promise.all([refreshCloudLabels("active"), refreshCloudCategories()]);
                  }}
                >
                  <span className="save-dialog-destination-icon" aria-hidden="true">☁</span>
                  <span><strong>云端标签</strong><small>保存到个人云空间</small></span>
                </button>
                <button
                  type="button"
                  className={saveDialogRequest.destination === "local" ? "save-dialog-destination active" : "save-dialog-destination"}
                  onClick={() => setSaveDialogRequest((current) => current ? { ...current, destination: "local" } : current)}
                >
                  <span className="save-dialog-destination-icon" aria-hidden="true">▣</span>
                  <span><strong>本地保存</strong><small>保存为 .lpt 文件</small></span>
                </button>
              </aside>
              <section className="save-dialog-content">
                {saveDialogRequest.destination === "cloud" ? (
                  !cloudSession.user ? (
                    <div className="save-dialog-empty">
                      <p>登录后可选择云端分类并保存标签。</p>
                      <button type="button" className="primary" onClick={() => {
                        setCloudAuthError("");
                        setCloudAuthDialogOpen(true);
                      }}>登录 / 注册</button>
                    </div>
                  ) : cloudLoading && cloudLabels.length === 0 ? (
                    <p className="muted">正在加载云端标签...</p>
                  ) : (
                    <div className="save-dialog-folders" aria-label="云端标签文件夹">
                      {[{ id: null, name: "未分类" } as const, ...cloudCategories].map((category) => {
                        const labels = cloudLabels.filter((label) => (label.categoryId ?? null) === category.id);
                        const selected = saveDialogRequest.categoryId === category.id;
                        return (
                          <section
                            className={selected ? "save-folder selected open" : "save-folder"}
                            key={category.id ?? OPEN_LABEL_UNCATEGORIZED}
                          >
                            <button
                              type="button"
                              className="save-folder-header"
                              onClick={() => setSaveDialogRequest((current) => current ? { ...current, categoryId: category.id } : current)}
                              aria-pressed={selected}
                              aria-expanded={selected}
                            >
                              <span aria-hidden="true">{selected ? "📂" : "📁"}</span>
                              <strong>{category.name}</strong>
                              <span className="save-folder-state">
                                {selected ? "✓ 当前保存位置" : `${labels.length} 个标签`}
                              </span>
                            </button>
                            {selected && labels.length > 0 ? (
                              <div className="save-folder-labels">
                                {labels.map((label) => <span key={label.id} title={label.name}>{label.name}</span>)}
                              </div>
                            ) : selected ? <p className="muted">文件夹为空</p> : null}
                          </section>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="save-dialog-local-info">
                    <span aria-hidden="true">▣</span>
                    <strong>保存到这台电脑</strong>
                    <p>点击保存后，在系统窗口中选择文件夹。若已有同名文件，系统会先请求覆盖确认。</p>
                  </div>
                )}
              </section>
            </div>
            <footer className="save-dialog-footer">
              <label className="save-dialog-name-field">
                <span>标签名称</span>
                <input
                  type="text"
                  value={saveDialogRequest.name}
                  autoFocus
                  maxLength={120}
                  disabled={saveDialogPending}
                  onChange={(event) => setSaveDialogRequest((current) => current ? { ...current, name: event.target.value } : current)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void confirmSaveDialog();
                    }
                  }}
                />
              </label>
              <button type="button" className="tool-ghost" onClick={() => setSaveDialogRequest(null)} disabled={saveDialogPending}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void confirmSaveDialog()}
                disabled={saveDialogPending || !saveDialogRequest.name.trim() || (saveDialogRequest.destination === "cloud" && !cloudSession.user)}
              >
                {saveDialogPending ? "正在保存..." : "保存"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {pdfOutputDialog ? (
        <div className="modal-mask" onClick={() => setPdfOutputDialog(null)}>
          <section
            className="modal-card confirm-modal pdf-output-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-output-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header confirm-modal-header">
              <h3 id="pdf-output-title">PDF 已保存</h3>
            </header>
            <p className="confirm-modal-lead">打印预览已直接保存为 PDF，可打开文件夹核对实际输出。</p>
            <label className="pdf-output-path-field">
              <span>保存目录</span>
              <input type="text" value={pdfOutputDialog.directory} readOnly aria-label="PDF 保存目录" onFocus={(event) => event.currentTarget.select()} />
            </label>
            <label className="pdf-output-path-field">
              <span>PDF 文件</span>
              <input type="text" value={pdfOutputDialog.path} readOnly aria-label="PDF 文件路径" onFocus={(event) => event.currentTarget.select()} />
            </label>
            <div className="confirm-modal-actions">
              <button type="button" className="tool-ghost" onClick={() => setPdfOutputDialog(null)}>
                关闭
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  void revealPdfOutput(pdfOutputDialog.path).catch((error) => {
                    setToolbarStatus(`打开 PDF 文件夹失败：${toChineseErrorMessage(error)}`);
                  });
                }}
              >
                打开所在文件夹
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingCloseConfirm ? (
        <div className="modal-mask" onClick={dismissCloseConfirm}>
          <section
            className="modal-card confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header confirm-modal-header">
              <h3 id="close-confirm-title">
                {pendingCloseConfirm.kind === "app" ? "关闭程序确认" : "关闭标签确认"}
              </h3>
            </header>
            <p className="confirm-modal-lead">
              {pendingCloseConfirm.kind === "app"
                ? `检测到 ${pendingCloseConfirm.unsavedCount} 个标签存在未保存变更。`
                : `标签“${pendingCloseConfirm.documentTitle}”存在未保存变更。`}
            </p>
            <p className="confirm-modal-detail">继续关闭将丢失本次编辑内容，且无法直接恢复。</p>
            <div className="confirm-modal-actions">
              <button type="button" className="tool-ghost confirm-cancel" onClick={dismissCloseConfirm}>
                返回继续编辑
              </button>
              {pendingCloseConfirm.kind === "tab" ? (
                <button type="button" className="tool-ghost confirm-save-close" onClick={() => void saveAndCloseConfirmTab()}>
                  保存并关闭
                </button>
              ) : null}
              <button type="button" className="primary confirm-confirm confirm-modal-danger" onClick={acceptCloseConfirm}>
                {pendingCloseConfirm.kind === "app" ? "确认关闭程序" : "仍要关闭标签"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <PrintSubmitModal
        open={printOpen}
        title={activePrintTarget.title}
        labelSize={activePrintTarget.labelSize}
        printers={printDialogPrinters}
        printerHint={
          loadingPrinters
            ? "正在读取本机打印机列表..."
            : hasLoadedSystemPrinters
              ? `已读取到 ${systemPrinterCount} 台系统打印机。`
              : usingCachedPrinters
                ? "已加载缓存打印机列表，后台同步中..."
                : "未读取到本机系统打印机，当前仅显示模板中保存的打印机。请在桌面版环境点击“刷新系统打印机”。"
        }
        printerId={activePrintDialogPrinterId}
        copies={activePrintTarget.copies}
        elements={activePrintTarget.elements}
        printRecords={printableRows}
        submitStatus={submitStatus}
        submitting={submitting}
        loadingPrinters={loadingPrinters}
        onClose={() => {
          setPrintOpen(false);
          setPrintTarget(null);
        }}
        onRefreshPrinters={() => void refreshSystemPrinters(false)}
        onPrinterChange={onSelectDefaultPrinterForSoftware}
        onCopiesChange={onPrintCopiesChange}
        onConfirm={onSubmitPrint}
      />
    </main>
  );
}


