import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";

import { useDataImportStore } from "./features/data-import/data-import.store";
import { EditorPage } from "./features/editor/EditorPage";
import { NewLabelModal } from "./features/editor/NewLabelModal";
import { PrintSubmitModal } from "./features/editor/PrintSubmitModal";
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
import { submitPrintTask } from "./services/ipc/print";
import { type TemplateDto, listTemplates, saveTemplate } from "./services/ipc/template";
import {
  closeWindow,
  minimizeWindow,
  startDragWindow,
  toggleMaximizeWindow,
} from "./services/ipc/window-controls";

const DEFAULT_PRINTERS = ["Zebra-01", "Brother MFC-7360", "TSC TTP-244"];
const LABEL_MIN_SIZE_MM = 10;
const HOME_RECENT_STORAGE_KEY = "label-print.recent-opened";
const HOME_RECENT_LIMIT = 24;
const TITLEBAR_IGNORE_SELECTOR = "button, input, textarea, select, a, [data-no-titlebar-action]";

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

type SaveTemplateResult = {
  mode: "picker" | "download" | "direct";
  fileName: string;
  handle?: SaveFileHandle;
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

function cloneSnapshot(snapshot: TemplateSnapshot): TemplateSnapshot {
  return {
    ...snapshot,
    labelSize: { ...snapshot.labelSize },
    elements: cloneElements(snapshot.elements),
    calibration: { ...snapshot.calibration },
  };
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
    document.labelSize.widthMm === 40 &&
    document.labelSize.heightMm === 30 &&
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
  return normalizeRecentFileName(fileName, fileName).trim().toLocaleLowerCase("zh-CN");
}

function toChineseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "未知错误";
  }

  const rawMessage = error.message.trim();
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

  return "系统异常";
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
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

  const [newLabelOpen, setNewLabelOpen] = useState(false);
  const [newLabelTitle, setNewLabelTitle] = useState("新建标签");
  const [newLabelWidth, setNewLabelWidth] = useState(40);
  const [newLabelHeight, setNewLabelHeight] = useState(30);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTitle, setSettingsTitle] = useState("");
  const [settingsWidth, setSettingsWidth] = useState(40);
  const [settingsHeight, setSettingsHeight] = useState(30);

  const [printOpen, setPrintOpen] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toolbarStatus, setToolbarStatus] = useState("");
  const [copiedElements, setCopiedElements] = useState<EditorElement[]>([]);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [templateLibraryLoading, setTemplateLibraryLoading] = useState(false);
  const [templateRows, setTemplateRows] = useState<TemplateDto[]>([]);
  const [systemFonts, setSystemFonts] = useState<FontOption[]>(DEFAULT_FONT_OPTIONS);
  const [titlebarDragStart, setTitlebarDragStart] = useState<{ x: number; y: number } | null>(null);
  const [activePage, setActivePage] = useState<"editor" | "home">("home");
  const [recentOpenedItems, setRecentOpenedItems] = useState<HomeRecentItem[]>(() => readRecentOpenedItems());
  const [homeSearchKeyword, setHomeSearchKeyword] = useState("");

  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);
  const savedFileHandlesRef = useRef<Map<string, SaveFileHandle>>(new Map());

  const printableRows = useMemo(() => (rows.length > 0 ? rows : [{ code: "123456789" }]), [rows]);
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
      return fileName.includes(keyword) || title.includes(keyword);
    });
  }, [homeSearchKeyword, recentOpenedItems]);
  const hasOnlyInitialUntouchedDocument = documents.length === 1 && isInitialUntouchedDocument(documents[0]);
  const visibleDocuments = activePage === "home" && hasOnlyInitialUntouchedDocument ? [] : documents;

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
    const existingIds = new Set(documents.map((item) => item.id));
    for (const id of savedFileHandlesRef.current.keys()) {
      if (!existingIds.has(id)) {
        savedFileHandlesRef.current.delete(id);
      }
    }
  }, [documents]);

  const rememberRecentOpened = (fileName: string, snapshot: TemplateSnapshot) => {
    const normalizedName = normalizeRecentFileName(fileName, snapshot.title);
    const copiedSnapshot = cloneSnapshot(snapshot);
    const openedAt = Date.now();

    setRecentOpenedItems((previous) => {
      const remaining = previous.filter(
        (item) => item.fileName.toLocaleLowerCase("zh-CN") !== normalizedName.toLocaleLowerCase("zh-CN")
      );
      const next: HomeRecentItem[] = [
        {
          id: `${openedAt}-${Math.random().toString(16).slice(2, 8)}`,
          fileName: normalizedName,
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
    setNewLabelWidth(40);
    setNewLabelHeight(30);
    setNewLabelOpen(true);
  };

  const confirmCreateLabel = () => {
    const existingDocumentCount = hasOnlyInitialUntouchedDocument ? 0 : documents.length;
    const nextTitle = newLabelTitle.trim() || `新建标签${existingDocumentCount + 1}`;
    const nextLabelSize = {
      widthMm: parsePositive(newLabelWidth, 40),
      heightMm: parsePositive(newLabelHeight, 30),
    };
    const initialDocumentId = hasOnlyInitialUntouchedDocument ? documents[0]?.id : null;

    createDocument({
      title: nextTitle,
      labelSize: nextLabelSize,
    });
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

  const onSubmitPrint = async (overrideCopies?: number) => {
    if (activeDocument.elements.length === 0) {
      setSubmitStatus("打印前请至少添加一个元素。");
      return;
    }

    const requestedCopies =
      typeof overrideCopies === "number" && Number.isFinite(overrideCopies)
        ? Math.max(1, Math.floor(overrideCopies))
        : activeDocument.copies;

    setSubmitting(true);
    setSubmitStatus("");

    try {
      const payload = buildPrintSubmitPayload({
        templateId: 1,
        templateVersion: 2,
        labelSize: activeDocument.labelSize,
        printerId: activeDocument.printerId,
        copies: requestedCopies,
        calibration: activeDocument.calibration,
        elements: activeDocument.elements,
        records: printableRows,
      });
      const submitPayload = toSubmitTaskPayload(payload);
      const jobId = await submitPrintTask(submitPayload);
      setSubmitStatus(`打印任务已提交（#${jobId}），共 ${payload.totalItems} 项。`);
    } catch (error) {
      setSubmitStatus(`提交失败：${toChineseErrorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
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

  const onSaveTemplate = async (name?: string) => {
    try {
      const explicitName = name?.trim() || "";
      const snapshot = buildTemplateSnapshot(activeDocument);
      const packed = packTemplateBundle(snapshot);

      let result: SaveTemplateResult;
      if (!explicitName) {
        const knownHandle = savedFileHandlesRef.current.get(activeDocument.id);
        result = knownHandle
          ? await saveTemplateBundleToKnownTarget(packed, knownHandle)
          : await saveTemplateBundleWithDialog(packed, activeDocument.title);
      } else {
        result = await saveTemplateBundleWithDialog(packed, explicitName);
      }

      if (result.handle) {
        savedFileHandlesRef.current.set(activeDocument.id, result.handle);
      }

      const savedTitle = normalizeRecentFileName(result.fileName, explicitName || snapshot.title);
      const savedSnapshot: TemplateSnapshot = {
        ...snapshot,
        title: savedTitle,
      };

      setDocumentFileMeta(
        activeDocument.id,
        result.handle ? result.fileName : activeDocument.filePath,
        savedTitle
      );
      rememberRecentOpened(savedTitle, savedSnapshot);

      if (result.mode === "download") {
        setToolbarStatus("模板已下载。");
      } else if (result.mode === "direct") {
        setToolbarStatus("模板已保存。");
      } else {
        setToolbarStatus("模板已保存到文件。");
      }
    } catch (error) {
      setToolbarStatus(`保存失败：${toChineseErrorMessage(error)}`);
    }
  };
  const onSaveAsTemplate = async () => {
    const name = window.prompt("请输入模板名称", activeDocument.title)?.trim();
    if (!name) {
      return;
    }
    await onSaveTemplate(name);
  };

  const openSnapshotAsDocument = (snapshot: TemplateSnapshot, sourceFileName?: string): boolean => {
    if (sourceFileName && focusOpenedDocumentByFileName(sourceFileName)) {
      return false;
    }

    const initialDocumentId = hasOnlyInitialUntouchedDocument ? documents[0]?.id : null;
    createDocument({
      title: snapshot.title,
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
    setActivePage("editor");
    return true;
  };

  const openTemplateRecord = (template: TemplateDto) => {
    const snapshot = parseTemplateSnapshot(template.content, template.name);
    if (!snapshot) {
      setToolbarStatus("模板解析失败。");
      return;
    }
    const opened = openSnapshotAsDocument(snapshot, template.name);
    rememberRecentOpened(template.name, snapshot);
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

  const onPickTemplateFile = () => {
    templateFileInputRef.current?.click();
  };

  const onTemplateFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (focusOpenedDocumentByFileName(file.name)) {
        return;
      }

      const lowerName = file.name.toLowerCase();
      const fallbackName = getTemplateFileBaseName(file.name);

      let snapshot: TemplateSnapshot | null = null;
      let ddlImportStats:
        | {
            importedCount: number;
            ignoredCount: number;
            ignoredTypes: Array<{ type: string; count: number }>;
          }
        | null = null;
      if (lowerName.endsWith(".lpt")) {
        snapshot = unpackTemplateBundle(new Uint8Array(await file.arrayBuffer()));
      } else if (lowerName.endsWith(".ddl")) {
        const ddlResult = parseDdlTemplate(await file.text(), fallbackName);
        if (ddlResult) {
          snapshot = ddlResult.snapshot;
          ddlImportStats = {
            importedCount: ddlResult.importedCount,
            ignoredCount: ddlResult.ignoredCount,
            ignoredTypes: ddlResult.ignoredTypes,
          };
        }
      } else {
        snapshot = parseTemplateSnapshot(await file.text(), fallbackName);
      }

      if (!snapshot) {
        setToolbarStatus("模板解析失败。");
        return;
      }

      const opened = openSnapshotAsDocument(snapshot, file.name);
      rememberRecentOpened(file.name, snapshot);
      if (!opened) {
        return;
      }
      if (ddlImportStats) {
        const ignoredTypeSummary =
          ddlImportStats.ignoredCount > 0 && ddlImportStats.ignoredTypes.length > 0
            ? `，类型：${ddlImportStats.ignoredTypes
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
    const opened = openSnapshotAsDocument(snapshot, target.fileName);
    rememberRecentOpened(target.fileName, snapshot);
    if (!opened) {
      return;
    }
    setToolbarStatus(`已从最近使用打开：${target.fileName}`);
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
          <span className="brand-mark">HC</span>
          <span className="brand-name">恒策标签条码打印软件</span>
        </button>

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
              {visibleDocuments.length > 1 ? (
                <button
                  type="button"
                  className="close-tab"
                  onClick={() => closeDocument(document.id)}
                  aria-label={`关闭${document.title}`}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
          <button type="button" className="new-tab" onClick={openNewLabelModal}>
            + 新建标签
          </button>
        </div>

        <div className="titlebar-spacer" />

        <div className="titlebar-actions">
          <button type="button" className="win-btn" aria-label="最小化" onClick={() => void minimizeWindow()}>
            <span className="win-icon win-icon-minimize" aria-hidden="true" />
          </button>
          <button type="button" className="win-btn" aria-label="最大化" onClick={() => void toggleMaximizeWindow()}>
            <span className="win-icon win-icon-maximize" aria-hidden="true" />
          </button>
          <button type="button" className="win-btn close" aria-label="关闭" onClick={() => void closeWindow()}>
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
                  新建标签
                </button>
                <button
                  type="button"
                  className="tool-ghost file-menu-item"
                  onClick={() => {
                    setFileMenuOpen(false);
                    onPickTemplateFile();
                  }}
                >
                  打开
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
                    onExportTemplateLpt();
                  }}
                >
                  导出 .lpt
                </button>

                <button
                  type="button"
                  className="tool-ghost file-menu-item"
                  onClick={() => {
                    setFileMenuOpen(false);
                    onExportTemplateJson();
                  }}
                >
                  导出 JSON
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
        />
      )}

      <NewLabelModal
        open={newLabelOpen}
        title={newLabelTitle}
        widthMm={newLabelWidth}
        heightMm={newLabelHeight}
        onClose={() => setNewLabelOpen(false)}
        onTitleChange={setNewLabelTitle}
        onWidthChange={(value) => setNewLabelWidth(Number.isFinite(value) ? value : 40)}
        onHeightChange={(value) => setNewLabelHeight(Number.isFinite(value) ? value : 30)}
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

      <PrintSubmitModal
        open={printOpen}
        title={activeDocument.title}
        labelSize={activeDocument.labelSize}
        printers={DEFAULT_PRINTERS}
        printerId={activeDocument.printerId}
        copies={activeDocument.copies}
        elements={activeDocument.elements}
        previewRecord={printableRows[0] ?? {}}
        submitStatus={submitStatus}
        submitting={submitting}
        onClose={() => setPrintOpen(false)}
        onPrinterChange={(value) => setPrinterConfig({ printerId: value })}
        onCopiesChange={(value) => setPrinterConfig({ copies: value })}
        onConfirm={onSubmitPrint}
      />
    </main>
  );
}
