import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";

import appLogo from "./assets/icons/logo.png";
import { useDataImportStore } from "./features/data-import/data-import.store";
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
import { HomePage, type HomeRecentItem } from "./features/home/HomePage";
import { listSystemFonts } from "./services/ipc/fonts";
import { consumeLaunchFiles, subscribeLaunchFiles, type LaunchFilePayload } from "./services/ipc/launch-files";
import { getCachedSystemPrinters, listSystemPrinters, submitDirectPrint } from "./services/ipc/print";
import { type TemplateDto, listTemplates, pickTemplateFile, saveTemplate, saveTemplateFile } from "./services/ipc/template";
import {
  closeWindow,
  minimizeWindow,
  startDragWindow,
  toggleMaximizeWindow,
} from "./services/ipc/window-controls";

const LABEL_MIN_SIZE_MM = 10;
const DEFAULT_NEW_LABEL_SIZE: LabelSize = { widthMm: 40, heightMm: 30 };
const HOME_RECENT_STORAGE_KEY = "label-print.recent-opened";
const HOME_RECENT_LIMIT = 24;
const LAST_NEW_LABEL_SIZE_STORAGE_KEY = "label-print.last-new-label-size";
const SOFTWARE_DEFAULT_PRINTER_STORAGE_KEY = "label-print.default-printer";
const TITLEBAR_IGNORE_SELECTOR = "button, input, textarea, select, a, [data-no-titlebar-action]";
const PRINTER_PREWARM_DELAY_MS = 4000;
const PRINTER_PREWARM_IDLE_TIMEOUT_MS = 2000;

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

function parseRecentOpenedItems(raw: string): HomeRecentItem[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const output = parsed
      .map<HomeRecentItem | null>((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const row = entry as Partial<HomeRecentItem> & { snapshot?: unknown };
        if (row.saved !== true || typeof row.fileName !== "string" || !Number.isFinite(row.openedAt)) {
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
          filePath: typeof row.filePath === "string" && row.filePath.trim().length > 0 ? row.filePath.trim() : null,
          saved: true,
          openedAt: Number(row.openedAt),
          snapshot: cloneSnapshot(snapshot),
        };
      })
      .filter((item): item is HomeRecentItem => item !== null)
      .sort((left, right) => right.openedAt - left.openedAt);

    return output.slice(0, HOME_RECENT_LIMIT);
  } catch {
    return [];
  }
}

function readRecentOpenedItems(): HomeRecentItem[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  const raw = localStorage.getItem(HOME_RECENT_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  return parseRecentOpenedItems(raw);
}

function writeRecentOpenedItems(items: HomeRecentItem[]) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(HOME_RECENT_STORAGE_KEY, JSON.stringify(items.slice(0, HOME_RECENT_LIMIT)));
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

function padRecentDateUnit(value: number): string {
  return value.toString().padStart(2, "0");
}

function buildRecentDateSearchTokens(openedAt: number): string[] {
  if (!Number.isFinite(openedAt)) {
    return [];
  }
  const date = new Date(openedAt);
  if (Number.isNaN(date.getTime())) {
    return [];
  }

  const year = date.getFullYear().toString();
  const month = padRecentDateUnit(date.getMonth() + 1);
  const day = padRecentDateUnit(date.getDate());

  return [
    `${year}-${month}-${day}`,
    `${year}/${month}/${day}`,
    `${year}${month}${day}`,
    `${month}-${day}`,
    `${month}/${day}`,
    `${year}年${month}月${day}日`,
  ];
}

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
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState<string[]>(initialCachedPrinters);
  const [softwareDefaultPrinterId, setSoftwareDefaultPrinterId] = useState<string>(() => readSoftwareDefaultPrinterId());
  const [hasLoadedSystemPrinters, setHasLoadedSystemPrinters] = useState(false);
  const [systemPrinterCount, setSystemPrinterCount] = useState(0);
  const [usingCachedPrinters, setUsingCachedPrinters] = useState(initialCachedPrinters.length > 0);
  const [toolbarStatus, setToolbarStatus] = useState("");
  const [copiedElements, setCopiedElements] = useState<EditorElement[]>([]);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [templateLibraryLoading, setTemplateLibraryLoading] = useState(false);
  const [templateRows, setTemplateRows] = useState<TemplateDto[]>([]);
  const [systemFonts, setSystemFonts] = useState<FontOption[]>(DEFAULT_FONT_OPTIONS);
  const [titlebarDragStart, setTitlebarDragStart] = useState<{ x: number; y: number } | null>(null);
  const [activePage, setActivePage] = useState<"editor" | "home">("home");
  const [pendingCloseConfirm, setPendingCloseConfirm] = useState<CloseConfirmRequest | null>(null);
  const [recentOpenedItems, setRecentOpenedItems] = useState<HomeRecentItem[]>(() => readRecentOpenedItems());
  const [homeSearchKeyword, setHomeSearchKeyword] = useState("");

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
    return activeDocument.printerId;
  }, [activeDocument.printerId, availablePrinters, softwareDefaultPrinterId]);
  const canUndo = activeDocument.undoStack.length > 0;
  const canRedo = activeDocument.redoStack.length > 0;
  const homeVisibleItems = useMemo(() => {
    const keyword = homeSearchKeyword.trim().toLocaleLowerCase("zh-CN");
    if (!keyword) {
      return recentOpenedItems;
    }
    return recentOpenedItems.filter((item) => {
      const fileName = item.fileName.toLocaleLowerCase("zh-CN");
      const title = item.snapshot.title.toLocaleLowerCase("zh-CN");
      const dateTokens = buildRecentDateSearchTokens(item.openedAt);
      return (
        fileName.includes(keyword) ||
        title.includes(keyword) ||
        dateTokens.some((token) => token.toLocaleLowerCase("zh-CN").includes(keyword))
      );
    });
  }, [homeSearchKeyword, recentOpenedItems]);
  const hasOnlyInitialUntouchedDocument = documents.length === 1 && isInitialUntouchedDocument(documents[0]);
  const visibleDocuments = activePage === "home" && hasOnlyInitialUntouchedDocument ? [] : documents;

  const markDocumentSavedBySnapshot = (documentId: string, snapshot: TemplateSnapshot) => {
    savedDocumentSignaturesRef.current.set(documentId, toSnapshotSignature(cloneSnapshot(snapshot)));
  };

  const isDocumentUnsaved = (document: EditorDocument): boolean => {
    const savedSignature = savedDocumentSignaturesRef.current.get(document.id);
    if (!savedSignature) {
      return !isInitialUntouchedDocument(document);
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
    const saved = await onSaveTemplate(undefined, request.documentId);
    if (!saved) {
      return;
    }
    closeDocumentNow(request.documentId);
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
    void refreshSystemPrinters(true);
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

  const rememberRecentOpened = (fileName: string, snapshot: TemplateSnapshot, filePath: string | null = null) => {
    const normalizedName = normalizeRecentFileName(fileName, snapshot.title);
    const normalizedPath = resolveKnownDocumentPath(filePath);
    const copiedSnapshot = cloneSnapshot(snapshot);
    const openedAt = Date.now();
    const currentLookupKey = buildRecentEntryLookupKey(normalizedName, normalizedPath);

    setRecentOpenedItems((previous) => {
      const remaining = previous.filter(
        (item) => buildRecentEntryLookupKey(item.fileName, item.filePath ?? null) !== currentLookupKey
      );
      const next: HomeRecentItem[] = [
        {
          id: `${openedAt}-${Math.random().toString(16).slice(2, 8)}`,
          fileName: normalizedName,
          filePath: normalizedPath,
          saved: true,
          openedAt,
          snapshot: copiedSnapshot,
        },
        ...remaining,
      ].slice(0, HOME_RECENT_LIMIT);
      writeRecentOpenedItems(next);
      return next;
    });
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
    if (activeDocument.elements.length === 0) {
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
        labelSize: activeDocument.labelSize,
        printerId: directPrintInput.printerId,
        copies: requestedCopies,
        calibration: activeDocument.calibration,
        elements: activeDocument.elements,
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
        previewPngBase64: directPrintInput.previewPngBase64,
        widthMm: directPrintInput.widthMm,
        heightMm: directPrintInput.heightMm,
        title: activeDocument.title,
      });
      if (printResult.outputPath) {
        setSubmitStatus(
          `已输出 PDF（${printResult.outputPath}），任务 #${printResult.jobId}，共 ${payload.totalItems} 项。`
        );
      } else {
        setSubmitStatus(
          `已直接提交到打印机“${directPrintInput.printerId}”（任务 #${printResult.jobId}，共 ${payload.totalItems} 项）。`
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

  const writeTemplateBundleToHandle = async (bundle: Uint8Array, handle: SaveFileHandle) => {
    const writable = await handle.createWritable();
    await writable.write(toOwnedArrayBuffer(bundle));
    await writable.close();
  };

  const saveTemplateBundleWithDialog = async (
    bundle: Uint8Array,
    suggestedBaseName: string
  ): Promise<SaveTemplateResult> => {
    const pickerWindow = window as SaveFilePickerWindow;
    const suggestedName = `${sanitizeFileName(suggestedBaseName)}.lpt`;
    const fileBuffer = toOwnedArrayBuffer(bundle);

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
      await writeTemplateBundleToHandle(bundle, handle);
      return {
        mode: "picker",
        fileName: handle.name?.trim() || suggestedName,
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
    await writeTemplateBundleToHandle(bundle, handle);
    return {
      mode: "direct",
      fileName: handle.name?.trim() || "label-template.lpt",
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

      let result: SaveTemplateResult;
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
      rememberRecentOpened(savedTitle, savedSnapshot, nextFilePath ?? null);

      if (result.mode === "download") {
        setToolbarStatus("模板已下载。");
      } else if (result.mode === "direct" || result.mode === "path") {
        setToolbarStatus("模板已保存。");
      } else {
        setToolbarStatus("模板已保存到文件。");
      }
      return true;
    } catch (error) {
      setToolbarStatus(`保存失败：${toChineseErrorMessage(error)}`);
      return false;
    }
  };
  const onSaveAsTemplate = async () => {
    const name = window.prompt("请输入模板名称", activeDocument.title)?.trim();
    if (!name) {
      return;
    }
    await onSaveTemplate(name);
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
        void onSaveTemplate();
        return;
      }
      if (key === "p") {
        if (activePage !== "editor") {
          return;
        }
        event.preventDefault();
        setPrintOpen(true);
        return;
      }
      if (key === "w") {
        event.preventDefault();
        closeActiveDocumentByShortcut();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePage, closeActiveDocumentByShortcut, onSaveTemplate]);

  const openSnapshotAsDocument = (
    snapshot: TemplateSnapshot,
    sourceFileName?: string,
    preferredTitle?: string
  ): boolean => {
    if (sourceFileName && focusOpenedDocumentByFileName(sourceFileName)) {
      return false;
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
    return true;
  };

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
    rememberRecentOpened(template.name, titledSnapshot, template.name);
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
    rememberRecentOpened(normalizedDisplayName, titledSnapshot, documentSourcePath);
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
      rememberRecentOpened(file.name, titledSnapshot, null);
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
    const snapshot = cloneSnapshot(target.snapshot);
    const preferredTitle = normalizeRecentFileName(target.fileName, snapshot.title);
    const titledSnapshot: TemplateSnapshot = {
      ...snapshot,
      title: preferredTitle,
    };
    const knownPath = resolveKnownDocumentPath(target.filePath ?? null);
    const sourcePath = knownPath || target.fileName;
    const opened = openSnapshotAsDocument(titledSnapshot, sourcePath, preferredTitle);
    rememberRecentOpened(target.fileName, titledSnapshot, target.filePath ?? null);
    if (!opened) {
      return;
    }
    if (knownPath) {
      setToolbarStatus(`已从最近使用打开：${target.fileName}`);
    } else {
      setToolbarStatus("已从最近使用打开（缺少原始路径，保存时会提示另存为，请重新从“打开”选择源文件）。");
    }
  };

  const onDeleteRecentFromHome = (id: string) => {
    const target = recentOpenedItems.find((item) => item.id === id);
    if (!target) {
      setToolbarStatus("最近记录不存在或已失效。");
      return;
    }
    const next = recentOpenedItems.filter((item) => item.id !== id);
    setRecentOpenedItems(next);
    writeRecentOpenedItems(next);
    setToolbarStatus(`已删除最近记录：${target.fileName}`);
  };

  const onCopySelection = () => {
    const selected = activeDocument.elements.filter((element) =>
      activeDocument.selectedIds.includes(element.id)
    );
    if (selected.length === 0) {
      setToolbarStatus("请至少选择一个元素再复制。");
      return;
    }
    setCopiedElements(selected.map((element) => cloneElement(element)));
    setToolbarStatus(`已复制 ${selected.length} 个元素。`);
  };

  const onPasteSelection = () => {
    if (copiedElements.length === 0) {
      setToolbarStatus("剪贴板为空。");
      return;
    }

    const copiedAt = Date.now();
    const nextElements = copiedElements.map((element, index) =>
      cloneForPaste(element, index, activeDocument.labelSize, copiedAt)
    );
    replaceElements([...activeDocument.elements, ...nextElements], [], true);
    setSelection(nextElements.map((item) => item.id));
    setToolbarStatus(`已粘贴 ${nextElements.length} 个元素。`);
  };

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
                    void onPickTemplateFile();
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
                    void onSaveTemplate();
                  }}
                >
                  保存
                </button>
                <button
                  type="button"
                  className="tool-ghost file-menu-item"
                  onClick={() => {
                    setFileMenuOpen(false);
                    void onSaveAsTemplate();
                  }}
                >
                  另存为
                </button>
                <button
                  type="button"
                  className="tool-ghost file-menu-item"
                  onClick={() => {
                    setFileMenuOpen(false);
                    setPrintOpen(true);
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
          <button type="button" className="tool-ghost" data-testid="cmd-open" onClick={onPickTemplateFile}>
            打开
          </button>
          <button type="button" className="tool-ghost" data-testid="cmd-save" onClick={() => void onSaveTemplate()}>
            保存
          </button>
          <button type="button" className="tool-ghost" onClick={() => setPrintOpen(true)}>
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
          <button type="button" className="tool-ghost" onClick={onCopySelection}>
            复制
          </button>
          <button type="button" className="tool-ghost" onClick={onPasteSelection}>
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
          recentItems={homeVisibleItems}
          onSearchKeywordChange={setHomeSearchKeyword}
          onCreateLabel={openNewLabelModal}
          onOpenLabel={onPickTemplateFile}
          onOpenRecent={onOpenRecentFromHome}
          onDeleteRecent={onDeleteRecentFromHome}
        />
      )}

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
        title={activeDocument.title}
        labelSize={activeDocument.labelSize}
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
        copies={activeDocument.copies}
        elements={activeDocument.elements}
        previewRecord={printableRows[0] ?? {}}
        submitStatus={submitStatus}
        submitting={submitting}
        loadingPrinters={loadingPrinters}
        onClose={() => setPrintOpen(false)}
        onRefreshPrinters={() => void refreshSystemPrinters(false)}
        onPrinterChange={onSelectDefaultPrinterForSoftware}
        onCopiesChange={(value) => setPrinterConfig({ copies: value })}
        onConfirm={onSubmitPrint}
      />
    </main>
  );
}


