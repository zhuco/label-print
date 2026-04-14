import { create } from "zustand";

import { alignSelectedElements } from "./core/layout";
import {
  createBarcodeElement,
  createIconElement,
  createImageElement,
  createQrcodeElement,
  createShapeElement,
  createTextElement,
} from "./core/model";
import { buildIndustryTemplateElements } from "./core/industry-templates";
import {
  getIconPreset,
  getVisualPresetAspectRatio,
  getShapePreset,
  toIconPresetBindingValue,
  toShapePresetBindingValue,
} from "./core/visual-presets";
import {
  normalizeVisualDashArray,
  normalizeVisualDashOffset,
  normalizeVisualFillRule,
  normalizeVisualLineCap,
  normalizeVisualLineJoin,
  normalizeVisualMiterLimit,
  normalizeVisualOpacity,
  normalizeVisualStrokeWidth,
} from "./core/visual-style";
import { readCustomPresets, type CustomPreset, writeCustomPresets } from "./core/custom-presets";
import type {
  AlignMode,
  BarcodeConfig,
  ContentBinding,
  EditorElement,
  LabelSize,
  PrintDirection,
  SnapGuide,
  TextStyle,
} from "./core/types";

const HISTORY_LIMIT = 120;

export type Calibration = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type DocumentSnapshot = {
  title: string;
  filePath: string | null;
  labelSize: LabelSize;
  elements: EditorElement[];
  selectedIds: string[];
  calibration: Calibration;
  printerId: string;
  copies: number;
  printDirection: PrintDirection;
};

export type EditorDocument = {
  id: string;
  title: string;
  filePath: string | null;
  labelSize: LabelSize;
  elements: EditorElement[];
  selectedIds: string[];
  snapGuides: SnapGuide[];
  printerId: string;
  copies: number;
  printDirection: PrintDirection;
  calibration: Calibration;
  undoStack: DocumentSnapshot[];
  redoStack: DocumentSnapshot[];
};

type CreateDocumentInput = {
  title?: string;
  labelSize?: LabelSize;
  filePath?: string | null;
  printDirection?: PrintDirection;
};

type RectPatch = Partial<{
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
}>;

type AddImageElementInput = {
  name?: string;
  dataUrl?: string;
};

type AddShapeElementInput = {
  presetId?: string;
};

type AddIconElementInput = {
  presetId?: string;
};

type EditorState = {
  documents: EditorDocument[];
  activeDocumentId: string;
  customPresets: CustomPreset[];
  createDocument: (input?: CreateDocumentInput) => string;
  closeDocument: (id: string) => void;
  setActiveDocument: (id: string) => void;
  setDocumentTitle: (id: string, title: string) => void;
  setDocumentFileMeta: (id: string, filePath: string | null, fileName?: string | null) => void;
  addTextElement: () => void;
  addBarcodeElement: () => void;
  addImageElement: (input?: AddImageElementInput) => void;
  addQrcodeElement: () => void;
  addShapeElement: (input?: AddShapeElementInput) => void;
  addIconElement: (input?: AddIconElementInput) => void;
  applyIndustryTemplate: (templateId: string) => void;
  saveSelectionAsCustomPreset: (input: { name: string; category: string }) => boolean;
  applyCustomPreset: (id: string) => void;
  setLabelSize: (patch: Partial<LabelSize>) => void;
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  replaceElements: (elements: EditorElement[], guides?: SnapGuide[], recordHistory?: boolean) => void;
  updateElementRect: (id: string, patch: RectPatch, recordHistory?: boolean) => void;
  updateSelectedBinding: (patch: Partial<ContentBinding> & { mode?: ContentBinding["mode"] }) => void;
  updateSelectedTextStyle: (patch: Partial<TextStyle>) => void;
  updateSelectedBarcode: (patch: Partial<BarcodeConfig>) => void;
  alignSelection: (mode: AlignMode) => void;
  deleteSelection: () => void;
  setCalibration: (patch: Partial<Calibration>) => void;
  setPrinterConfig: (patch: { printerId?: string; copies?: number; printDirection?: PrintDirection }) => void;
  pushHistoryCheckpoint: () => void;
  undo: () => void;
  redo: () => void;
};

let elementSequence = 1;
let documentSequence = 1;

function nextElementId(type: "text" | "barcode" | "image" | "qrcode" | "shape" | "icon"): string {
  const value = elementSequence;
  elementSequence += 1;
  return `${type}-${Date.now()}-${value}`;
}

function nextDocumentId(): string {
  const value = documentSequence;
  documentSequence += 1;
  return `doc-${Date.now()}-${value}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function cloneElement(element: EditorElement): EditorElement {
  if (element.type === "barcode") {
    return {
      ...element,
      binding: { ...element.binding },
      textStyle: { ...element.textStyle },
      barcode: { ...element.barcode },
    };
  }
  return {
    ...element,
    binding: { ...element.binding },
    textStyle: { ...element.textStyle },
  };
}

function cloneElements(elements: EditorElement[]): EditorElement[] {
  return elements.map((item) => cloneElement(item));
}

function createSnapshot(document: EditorDocument): DocumentSnapshot {
  return {
    title: document.title,
    filePath: document.filePath,
    labelSize: { ...document.labelSize },
    elements: cloneElements(document.elements),
    selectedIds: [...document.selectedIds],
    calibration: { ...document.calibration },
    printerId: document.printerId,
    copies: document.copies,
    printDirection: document.printDirection,
  };
}

function isSnapshotEqual(a: DocumentSnapshot, b: DocumentSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function appendHistory(stack: DocumentSnapshot[], snapshot: DocumentSnapshot): DocumentSnapshot[] {
  const next = [...stack, snapshot];
  if (next.length <= HISTORY_LIMIT) {
    return next;
  }
  return next.slice(next.length - HISTORY_LIMIT);
}

function recordHistory(before: EditorDocument, after: EditorDocument): EditorDocument {
  const beforeSnapshot = createSnapshot(before);
  const afterSnapshot = createSnapshot(after);
  if (isSnapshotEqual(beforeSnapshot, afterSnapshot)) {
    return after;
  }
  return {
    ...after,
    undoStack: appendHistory(before.undoStack, beforeSnapshot),
    redoStack: [],
  };
}

function checkpoint(document: EditorDocument): EditorDocument {
  const current = createSnapshot(document);
  const last = document.undoStack[document.undoStack.length - 1];
  if (last && isSnapshotEqual(last, current)) {
    return document;
  }
  return {
    ...document,
    undoStack: appendHistory(document.undoStack, current),
    redoStack: [],
  };
}

function restoreSnapshot(document: EditorDocument, snapshot: DocumentSnapshot): EditorDocument {
  return {
    ...document,
    title: snapshot.title,
    filePath: snapshot.filePath,
    labelSize: { ...snapshot.labelSize },
    elements: cloneElements(snapshot.elements),
    selectedIds: [...snapshot.selectedIds],
    calibration: { ...snapshot.calibration },
    printerId: snapshot.printerId,
    copies: snapshot.copies,
    printDirection: snapshot.printDirection,
    snapGuides: [],
  };
}

function calcAdaptiveTextElement(labelSize: LabelSize) {
  const shortEdge = Math.min(labelSize.widthMm, labelSize.heightMm);
  const fontSize = round1(clamp(shortEdge * 0.22 * 0.65, 2, 10));
  const widthMm = round1(clamp(labelSize.widthMm * 0.55, 10, Math.max(10, labelSize.widthMm - 2)));
  const heightMm = round1(clamp(fontSize * 1.8, 4, Math.max(4, labelSize.heightMm * 0.45)));
  const xMm = round1(clamp((labelSize.widthMm - widthMm) / 2, 0, Math.max(0, labelSize.widthMm - widthMm)));
  const yMm = round1(clamp(labelSize.heightMm * 0.15, 0, Math.max(0, labelSize.heightMm - heightMm)));
  return { xMm, yMm, widthMm, heightMm, fontSize };
}

function calcAdaptiveBarcodeElement(labelSize: LabelSize) {
  const widthMm = round1(clamp(labelSize.widthMm * 0.78, 16, Math.max(16, labelSize.widthMm - 2)));
  const heightMm = round1(clamp(labelSize.heightMm * 0.42, 8, Math.max(8, labelSize.heightMm - 2)));
  const xMm = round1(clamp((labelSize.widthMm - widthMm) / 2, 0, Math.max(0, labelSize.widthMm - widthMm)));
  const yMm = round1(clamp(labelSize.heightMm * 0.45, 0, Math.max(0, labelSize.heightMm - heightMm)));
  return { xMm, yMm, widthMm, heightMm };
}

function calcAdaptiveVisualElement(labelSize: LabelSize, ratio = 0.42, min = 10, max = 24) {
  const shortEdge = Math.min(labelSize.widthMm, labelSize.heightMm);
  const sideMm = round1(clamp(shortEdge * ratio, min, max));
  const widthMm = sideMm;
  const heightMm = sideMm;
  const xMm = round1(clamp((labelSize.widthMm - widthMm) / 2, 0, Math.max(0, labelSize.widthMm - widthMm)));
  const yMm = round1(clamp((labelSize.heightMm - heightMm) / 2, 0, Math.max(0, labelSize.heightMm - heightMm)));
  return { xMm, yMm, widthMm, heightMm };
}

function fitRectToAspect(
  rect: { xMm: number; yMm: number; widthMm: number; heightMm: number },
  aspectRatio: number
): { xMm: number; yMm: number; widthMm: number; heightMm: number } {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return rect;
  }

  const baseWidth = Math.max(1, rect.widthMm);
  const baseHeight = Math.max(1, rect.heightMm);
  let widthMm = baseWidth;
  let heightMm = baseHeight;

  if (aspectRatio >= 1) {
    heightMm = baseWidth / aspectRatio;
    if (heightMm > baseHeight) {
      heightMm = baseHeight;
      widthMm = baseHeight * aspectRatio;
    }
  } else {
    widthMm = baseHeight * aspectRatio;
    if (widthMm > baseWidth) {
      widthMm = baseWidth;
      heightMm = baseWidth / aspectRatio;
    }
  }

  widthMm = round1(Math.max(1, widthMm));
  heightMm = round1(Math.max(1, heightMm));
  const centerX = rect.xMm + rect.widthMm / 2;
  const centerY = rect.yMm + rect.heightMm / 2;

  return {
    xMm: round1(centerX - widthMm / 2),
    yMm: round1(centerY - heightMm / 2),
    widthMm,
    heightMm,
  };
}

function buildCustomPresetId(): string {
  return `custom-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getElementsBounds(elements: EditorElement[]) {
  const left = Math.min(...elements.map((item) => item.xMm));
  const top = Math.min(...elements.map((item) => item.yMm));
  const right = Math.max(...elements.map((item) => item.xMm + item.widthMm));
  const bottom = Math.max(...elements.map((item) => item.yMm + item.heightMm));
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function normalizePresetElements(elements: EditorElement[]): EditorElement[] {
  if (elements.length === 0) {
    return [];
  }
  const bounds = getElementsBounds(elements);
  return elements.map((element) => {
    const cloned = cloneElement(element);
    return {
      ...cloned,
      xMm: round1(cloned.xMm - bounds.left),
      yMm: round1(cloned.yMm - bounds.top),
    };
  });
}

function createDocument(input?: CreateDocumentInput): EditorDocument {
  return {
    id: nextDocumentId(),
    title: input?.title || `新建标签${documentSequence}`,
    filePath: input?.filePath ?? null,
    labelSize: {
      widthMm: input?.labelSize?.widthMm ?? 40,
      heightMm: input?.labelSize?.heightMm ?? 30,
    },
    elements: [],
    selectedIds: [],
    snapGuides: [],
    printerId: "Zebra-01",
    copies: 1,
    printDirection: input?.printDirection ?? "normal",
    calibration: {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    },
    undoStack: [],
    redoStack: [],
  };
}

function normalizeBinding(
  current: ContentBinding,
  patch: Partial<ContentBinding> & { mode?: ContentBinding["mode"] }
): ContentBinding {
  const next: ContentBinding = {
    ...current,
    ...patch,
    mode: patch.mode ?? current.mode,
  };

  if (next.mode === "fixed" && next.fixedValue === undefined) {
    next.fixedValue = "";
  }
  if (next.mode === "column" && !next.column) {
    next.column = "";
  }
  if (next.mode === "expression" && next.expression === undefined) {
    next.expression = "";
  }

  return next;
}

function updateActiveDocument(
  state: EditorState,
  updater: (document: EditorDocument) => EditorDocument,
  record = false
): EditorDocument[] {
  return state.documents.map((document) => {
    if (document.id !== state.activeDocumentId) {
      return document;
    }
    const updated = updater(document);
    return record ? recordHistory(document, updated) : updated;
  });
}

export function selectActiveDocument(state: EditorState): EditorDocument {
  return state.documents.find((item) => item.id === state.activeDocumentId) ?? state.documents[0];
}

function createInitialDocument(): EditorDocument {
  return createDocument({ title: "新建标签1", labelSize: { widthMm: 40, heightMm: 30 } });
}

const initialDocument = createInitialDocument();
const initialCustomPresets = readCustomPresets();

export const useEditorStore = create<EditorState>((set) => ({
  documents: [initialDocument],
  activeDocumentId: initialDocument.id,
  customPresets: initialCustomPresets,

  createDocument: (input) => {
    let newId = "";
    set((state) => {
      const defaultTitle = `新建标签${state.documents.length + 1}`;
      const next = createDocument({
        title: input?.title || defaultTitle,
        labelSize: input?.labelSize,
        filePath: input?.filePath ?? null,
        printDirection: input?.printDirection,
      });
      newId = next.id;
      return {
        documents: [...state.documents, next],
        activeDocumentId: next.id,
      };
    });
    return newId;
  },

  closeDocument: (id) =>
    set((state) => {
      if (!state.documents.some((document) => document.id === id)) {
        return state;
      }

      if (state.documents.length <= 1) {
        const fresh = createInitialDocument();
        return {
          documents: [fresh],
          activeDocumentId: fresh.id,
        };
      }

      const nextDocuments = state.documents.filter((document) => document.id !== id);
      const nextActiveId =
        state.activeDocumentId === id
          ? nextDocuments[Math.max(0, nextDocuments.length - 1)].id
          : state.activeDocumentId;

      return {
        documents: nextDocuments,
        activeDocumentId: nextActiveId,
      };
    }),

  setActiveDocument: (id) =>
    set((state) => ({
      activeDocumentId: state.documents.some((item) => item.id === id) ? id : state.activeDocumentId,
    })),

  setDocumentTitle: (id, title) =>
    set((state) => ({
      documents: state.documents.map((item) =>
        item.id === id
          ? recordHistory(item, {
              ...item,
              title: title.trim() || item.title,
            })
          : item
      ),
    })),

  setDocumentFileMeta: (id, filePath, fileName) =>
    set((state) => ({
      documents: state.documents.map((item) =>
        item.id === id
          ? {
              ...item,
              filePath,
              title: fileName && fileName.trim() ? fileName.trim() : item.title,
            }
          : item
      ),
    })),

  addTextElement: () =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => {
          const adaptive = calcAdaptiveTextElement(document.labelSize);
          const element = createTextElement({
            id: nextElementId("text"),
            xMm: adaptive.xMm,
            yMm: adaptive.yMm,
            widthMm: adaptive.widthMm,
            heightMm: adaptive.heightMm,
            textStyle: {
              fontSize: adaptive.fontSize,
            },
          });
          return {
            ...document,
            elements: [...document.elements, element],
            selectedIds: [element.id],
          };
        },
        true
      ),
    })),

  addBarcodeElement: () =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => {
          const adaptive = calcAdaptiveBarcodeElement(document.labelSize);
          const element = createBarcodeElement({
            id: nextElementId("barcode"),
            xMm: adaptive.xMm,
            yMm: adaptive.yMm,
            widthMm: adaptive.widthMm,
            heightMm: adaptive.heightMm,
          });
          return {
            ...document,
            elements: [...document.elements, element],
            selectedIds: [element.id],
          };
        },
        true
      ),
    })),

  addImageElement: (input) =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => {
          const adaptive = calcAdaptiveVisualElement(document.labelSize, 0.58, 14, 28);
          const element = createImageElement({
            id: nextElementId("image"),
            name: input?.name?.trim() ? input.name.trim() : undefined,
            xMm: adaptive.xMm,
            yMm: adaptive.yMm,
            widthMm: adaptive.widthMm,
            heightMm: adaptive.heightMm * 0.72,
            binding:
              input?.dataUrl && input.dataUrl.trim()
                ? {
                    mode: "fixed",
                    fixedValue: input.dataUrl.trim(),
                  }
                : undefined,
          });
          return {
            ...document,
            elements: [...document.elements, element],
            selectedIds: [element.id],
          };
        },
        true
      ),
    })),

  addQrcodeElement: () =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => {
          const adaptive = calcAdaptiveVisualElement(document.labelSize, 0.42, 10, 20);
          const element = createQrcodeElement({
            id: nextElementId("qrcode"),
            xMm: adaptive.xMm,
            yMm: adaptive.yMm,
            widthMm: adaptive.widthMm,
            heightMm: adaptive.heightMm,
          });
          return {
            ...document,
            elements: [...document.elements, element],
            selectedIds: [element.id],
          };
        },
        true
      ),
    })),

  addShapeElement: (input) =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => {
          const preset = input?.presetId ? getShapePreset(input.presetId) : null;
          const adaptive = calcAdaptiveVisualElement(document.labelSize, 0.56, 12, 26);
          const aspectRatio = preset ? getVisualPresetAspectRatio("shape", preset.id) : null;
          const fitted = aspectRatio
            ? fitRectToAspect(
                {
                  xMm: adaptive.xMm,
                  yMm: adaptive.yMm,
                  widthMm: adaptive.widthMm,
                  heightMm: adaptive.heightMm,
                },
                aspectRatio
              )
            : adaptive;
          const element = createShapeElement({
            id: nextElementId("shape"),
            name: preset?.label ?? undefined,
            xMm: fitted.xMm,
            yMm: fitted.yMm,
            widthMm: fitted.widthMm,
            heightMm: fitted.heightMm,
            binding: preset
              ? {
                  mode: "fixed",
                  fixedValue: toShapePresetBindingValue(preset.id),
                }
              : undefined,
          });
          return {
            ...document,
            elements: [...document.elements, element],
            selectedIds: [element.id],
          };
        },
        true
      ),
    })),

  addIconElement: (input) =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => {
          const preset = input?.presetId ? getIconPreset(input.presetId) : null;
          const adaptive = calcAdaptiveVisualElement(document.labelSize, 0.34, 8, 14);
          const aspectRatio = preset ? getVisualPresetAspectRatio("icon", preset.id) : null;
          const fitted = aspectRatio
            ? fitRectToAspect(
                {
                  xMm: adaptive.xMm,
                  yMm: adaptive.yMm,
                  widthMm: adaptive.widthMm,
                  heightMm: adaptive.heightMm,
                },
                aspectRatio
              )
            : adaptive;
          const element = createIconElement({
            id: nextElementId("icon"),
            name: preset?.label ?? undefined,
            xMm: fitted.xMm,
            yMm: fitted.yMm,
            widthMm: fitted.widthMm,
            heightMm: fitted.heightMm,
            binding: preset
              ? {
                  mode: "fixed",
                  fixedValue: toIconPresetBindingValue(preset.id),
                }
              : undefined,
          });
          return {
            ...document,
            elements: [...document.elements, element],
            selectedIds: [element.id],
          };
        },
        true
      ),
    })),

  applyIndustryTemplate: (templateId) =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => {
          const built = buildIndustryTemplateElements(templateId, document.labelSize, nextElementId);
          if (built.length === 0) {
            return document;
          }
          return {
            ...document,
            elements: [...document.elements, ...built],
            selectedIds: built.map((item) => item.id),
          };
        },
        true
      ),
    })),

  saveSelectionAsCustomPreset: (input) => {
    let saved = false;
    set((state) => {
      const active = selectActiveDocument(state);
      if (!active || active.selectedIds.length === 0) {
        return state;
      }
      const selectedIdSet = new Set(active.selectedIds);
      const selectedElements = active.elements
        .filter((element) => selectedIdSet.has(element.id))
        .map((element) => cloneElement(element));
      if (selectedElements.length === 0) {
        return state;
      }

      const name = (input.name || "").trim() || `自定义图形-${state.customPresets.length + 1}`;
      const category = (input.category || "").trim() || "未分类";
      const now = Date.now();
      const preset: CustomPreset = {
        id: buildCustomPresetId(),
        name,
        category,
        elements: normalizePresetElements(selectedElements),
        elementCount: selectedElements.length,
        createdAt: now,
        updatedAt: now,
      };
      const nextCustomPresets = [preset, ...state.customPresets].slice(0, 200);
      writeCustomPresets(nextCustomPresets);
      saved = true;
      return {
        customPresets: nextCustomPresets,
      };
    });
    return saved;
  },

  applyCustomPreset: (id) =>
    set((state) => {
      const preset = state.customPresets.find((item) => item.id === id);
      if (!preset || preset.elements.length === 0) {
        return state;
      }

      return {
        documents: updateActiveDocument(
          state,
          (document) => {
            const normalized = preset.elements.map((element) => cloneElement(element));
            const bounds = getElementsBounds(normalized);
            const anchorX = round1(
              clamp(
                (document.labelSize.widthMm - bounds.width) / 2,
                0,
                Math.max(0, document.labelSize.widthMm - bounds.width)
              )
            );
            const anchorY = round1(
              clamp(
                (document.labelSize.heightMm - bounds.height) / 2,
                0,
                Math.max(0, document.labelSize.heightMm - bounds.height)
              )
            );
            const inserted = normalized.map((element) => {
              const nextX = round1(
                clamp(anchorX + element.xMm, 0, Math.max(0, document.labelSize.widthMm - element.widthMm))
              );
              const nextY = round1(
                clamp(anchorY + element.yMm, 0, Math.max(0, document.labelSize.heightMm - element.heightMm))
              );
              return {
                ...cloneElement(element),
                id: nextElementId(element.type),
                xMm: nextX,
                yMm: nextY,
              };
            });
            return {
              ...document,
              elements: [...document.elements, ...inserted],
              selectedIds: inserted.map((item) => item.id),
            };
          },
          true
        ),
      };
    }),

  setLabelSize: (patch) =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => ({
          ...document,
          labelSize: {
            widthMm:
              patch.widthMm !== undefined && Number.isFinite(patch.widthMm)
                ? Math.max(10, patch.widthMm)
                : document.labelSize.widthMm,
            heightMm:
              patch.heightMm !== undefined && Number.isFinite(patch.heightMm)
                ? Math.max(10, patch.heightMm)
                : document.labelSize.heightMm,
          },
        }),
        true
      ),
    })),

  setSelection: (ids) =>
    set((state) => ({
      documents: updateActiveDocument(state, (document) => ({
        ...document,
        selectedIds: [...new Set(ids)],
      })),
    })),

  toggleSelection: (id) =>
    set((state) => ({
      documents: updateActiveDocument(state, (document) => {
        if (document.selectedIds.includes(id)) {
          return {
            ...document,
            selectedIds: document.selectedIds.filter((item) => item !== id),
          };
        }
        return {
          ...document,
          selectedIds: [...document.selectedIds, id],
        };
      }),
    })),

  clearSelection: () =>
    set((state) => ({
      documents: updateActiveDocument(state, (document) => ({
        ...document,
        selectedIds: [],
        snapGuides: [],
      })),
    })),

  replaceElements: (elements, guides = [], recordHistory = false) =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => ({
          ...document,
          elements,
          snapGuides: guides,
        }),
        recordHistory
      ),
    })),

  updateElementRect: (id, patch, recordHistory = true) =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => ({
          ...document,
          elements: document.elements.map((element) => {
            if (element.id !== id) {
              return element;
            }
            const minWidthMm =
              element.type === "barcode"
                ? Math.max(8, round1(Math.max(0.1, element.barcode.moduleWidth) * 12))
                : 1;
            const minHeightMm =
              element.type === "barcode"
                ? 3
                : 1;
            return {
              ...element,
              xMm: patch.xMm ?? element.xMm,
              yMm: patch.yMm ?? element.yMm,
              widthMm: Math.max(minWidthMm, patch.widthMm ?? element.widthMm),
              heightMm: Math.max(minHeightMm, patch.heightMm ?? element.heightMm),
              rotation: patch.rotation ?? element.rotation,
            };
          }),
        }),
        recordHistory
      ),
    })),

  updateSelectedBinding: (patch) =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => {
          const selected = new Set(document.selectedIds);
          return {
            ...document,
            elements: document.elements.map((element) => {
              if (!selected.has(element.id)) {
                return element;
              }
              return {
                ...element,
                binding: normalizeBinding(element.binding, patch),
              };
            }),
          };
        },
        true
      ),
    })),

  updateSelectedTextStyle: (patch) =>
    set((state) => {
      const normalizedPatch: Partial<TextStyle> = {
        ...patch,
      };
      if (typeof normalizedPatch.fontSize === "number" && Number.isFinite(normalizedPatch.fontSize)) {
        normalizedPatch.fontSize = round1(Math.max(0.1, normalizedPatch.fontSize));
      }
      if (typeof normalizedPatch.strokeWidth === "number" && Number.isFinite(normalizedPatch.strokeWidth)) {
        normalizedPatch.strokeWidth = normalizeVisualStrokeWidth(normalizedPatch.strokeWidth);
      }
      if (normalizedPatch.strokeOpacity !== undefined) {
        normalizedPatch.strokeOpacity = normalizeVisualOpacity(normalizedPatch.strokeOpacity);
      }
      if (normalizedPatch.fillOpacity !== undefined) {
        normalizedPatch.fillOpacity = normalizeVisualOpacity(normalizedPatch.fillOpacity);
      }
      if (normalizedPatch.strokeLineCap !== undefined) {
        normalizedPatch.strokeLineCap = normalizeVisualLineCap(normalizedPatch.strokeLineCap);
      }
      if (normalizedPatch.strokeLineJoin !== undefined) {
        normalizedPatch.strokeLineJoin = normalizeVisualLineJoin(normalizedPatch.strokeLineJoin);
      }
      if (normalizedPatch.strokeDashArray !== undefined) {
        normalizedPatch.strokeDashArray = normalizeVisualDashArray(normalizedPatch.strokeDashArray);
      }
      if (normalizedPatch.strokeDashOffset !== undefined) {
        normalizedPatch.strokeDashOffset = normalizeVisualDashOffset(normalizedPatch.strokeDashOffset);
      }
      if (normalizedPatch.strokeMiterLimit !== undefined) {
        normalizedPatch.strokeMiterLimit = normalizeVisualMiterLimit(normalizedPatch.strokeMiterLimit);
      }
      if (normalizedPatch.fillRule !== undefined) {
        normalizedPatch.fillRule = normalizeVisualFillRule(normalizedPatch.fillRule);
      }
      return {
        documents: updateActiveDocument(
          state,
          (document) => {
            const selected = new Set(document.selectedIds);
            return {
              ...document,
              elements: document.elements.map((element) => {
                if (!selected.has(element.id)) {
                  return element;
                }
                return {
                  ...element,
                  textStyle: {
                    ...element.textStyle,
                    ...normalizedPatch,
                  },
                };
              }),
            };
          },
          true
        ),
      };
    }),

  updateSelectedBarcode: (patch) =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => {
          const selected = new Set(document.selectedIds);
          return {
            ...document,
            elements: document.elements.map((element) => {
              if (!selected.has(element.id) || element.type !== "barcode") {
                return element;
              }
              return {
                ...element,
                barcode: {
                  ...element.barcode,
                  ...patch,
                },
              };
            }),
          };
        },
        true
      ),
    })),

  alignSelection: (mode) =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => ({
          ...document,
          elements: alignSelectedElements(document.elements, document.selectedIds, mode),
          snapGuides: [],
        }),
        true
      ),
    })),

  deleteSelection: () =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => {
          if (document.selectedIds.length === 0) {
            return document;
          }
          const selected = new Set(document.selectedIds);
          return {
            ...document,
            elements: document.elements.filter((element) => !selected.has(element.id)),
            selectedIds: [],
            snapGuides: [],
          };
        },
        true
      ),
    })),

  setCalibration: (patch) =>
    set((state) => ({
      documents: updateActiveDocument(
        state,
        (document) => ({
          ...document,
          calibration: {
            offsetX: patch.offsetX ?? document.calibration.offsetX,
            offsetY: patch.offsetY ?? document.calibration.offsetY,
            scale: patch.scale ?? document.calibration.scale,
          },
        }),
        true
      ),
    })),

  setPrinterConfig: (patch) =>
    set((state) => ({
      documents: updateActiveDocument(state, (document) => ({
        ...document,
        printerId: patch.printerId ?? document.printerId,
        copies:
          patch.copies !== undefined && Number.isFinite(patch.copies)
            ? Math.max(1, Math.trunc(patch.copies))
            : document.copies,
        printDirection: patch.printDirection ?? document.printDirection,
      })),
    })),

  pushHistoryCheckpoint: () =>
    set((state) => ({
      documents: updateActiveDocument(state, (document) => checkpoint(document)),
    })),

  undo: () =>
    set((state) => ({
      documents: updateActiveDocument(state, (document) => {
        if (document.undoStack.length === 0) {
          return document;
        }
        const previous = document.undoStack[document.undoStack.length - 1];
        const current = createSnapshot(document);
        const restored = restoreSnapshot(document, previous);
        return {
          ...restored,
          undoStack: document.undoStack.slice(0, -1),
          redoStack: [current, ...document.redoStack].slice(0, HISTORY_LIMIT),
        };
      }),
    })),

  redo: () =>
    set((state) => ({
      documents: updateActiveDocument(state, (document) => {
        if (document.redoStack.length === 0) {
          return document;
        }
        const next = document.redoStack[0];
        const current = createSnapshot(document);
        const restored = restoreSnapshot(document, next);
        return {
          ...restored,
          undoStack: appendHistory(document.undoStack, current),
          redoStack: document.redoStack.slice(1),
        };
      }),
    })),
}));

export function resetEditorStoreForTests() {
  elementSequence = 1;
  documentSequence = 1;
  const first = createInitialDocument();
  useEditorStore.setState({
    documents: [first],
    activeDocumentId: first.id,
    customPresets: [],
  });
}
