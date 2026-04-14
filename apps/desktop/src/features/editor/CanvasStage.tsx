import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent,
} from "react";

import { useDataImportStore } from "../data-import/data-import.store";
import { BarcodePreview } from "./BarcodePreview";
import { QrcodePreview } from "./QrcodePreview";
import { resolveBindingValue } from "./core/binding";
import { buildBarcodeTextStyle } from "./core/barcode-text-style";
import { DEFAULT_FONT_OPTIONS, type FontOption, withCurrentFont } from "./core/font-options";
import { buildSnapTargets, selectElementsByRect, snapElementPosition, type SnapTargets } from "./core/layout";
import { buildRulerTicks, isMajorRulerTick, shouldShowRulerLabel } from "./core/ruler";
import { buildTextDecoration, computeSingleLineScaleX } from "./core/text-style";
import type { EditorElement, TextStyle } from "./core/types";
import { normalizeVisualDashArray, normalizeVisualStrokeWidth, toAlphaColor, toShapeBorderWidthPx } from "./core/visual-style";
import { TextStyleIcon } from "./TextStyleIcon";
import { PresetGlyph, readIconPresetIdFromBinding, readShapePresetIdFromBinding } from "./core/visual-presets";
import { selectActiveDocument, useEditorStore } from "./editor.store";

const MM_TO_PX = 8;
const SNAP_THRESHOLD_MM = 0.9;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const MIN_ELEMENT_MM = 1;
const DEFAULT_CUSTOM_PRESET_CATEGORIES = ["常用", "物流", "生产", "零售", "医药", "其他"];

type DragState = {
  startClientX: number;
  startClientY: number;
  dragIds: string[];
  primaryId: string;
  basePositionMap: Record<string, { xMm: number; yMm: number }>;
  baseMetaMap: Record<string, { widthMm: number; heightMm: number }>;
  targets: SnapTargets;
};

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type ResizeState = {
  elementId: string;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  baseRect: {
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
  };
};

type EditingState = {
  elementId: string;
  value: string;
};

type MarqueeState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  baseSelectedIds: string[];
};

type ContextMenuState = {
  clientX: number;
  clientY: number;
};

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];

type CanvasStageProps = {
  systemFonts: FontOption[];
};

export function CanvasStage({ systemFonts }: CanvasStageProps) {
  const activeDocument = useEditorStore(selectActiveDocument);
  const elements = activeDocument.elements;
  const labelSize = activeDocument.labelSize;
  const selectedIds = activeDocument.selectedIds;
  const snapGuides = activeDocument.snapGuides;

  const setSelection = useEditorStore((state) => state.setSelection);
  const toggleSelection = useEditorStore((state) => state.toggleSelection);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const replaceElements = useEditorStore((state) => state.replaceElements);
  const updateSelectedBinding = useEditorStore((state) => state.updateSelectedBinding);
  const updateSelectedTextStyle = useEditorStore((state) => state.updateSelectedTextStyle);
  const updateElementRect = useEditorStore((state) => state.updateElementRect);
  const pushHistoryCheckpoint = useEditorStore((state) => state.pushHistoryCheckpoint);
  const saveSelectionAsCustomPreset = useEditorStore((state) => state.saveSelectionAsCustomPreset);
  const customPresets = useEditorStore((state) => state.customPresets);

  const rows = useDataImportStore((state) => state.rows);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [marqueeState, setMarqueeState] = useState<MarqueeState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);
  const [customPresetName, setCustomPresetName] = useState("");
  const [customPresetCategory, setCustomPresetCategory] = useState(DEFAULT_CUSTOM_PRESET_CATEGORIES[0]);
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const editingRef = useRef<EditingState | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const elementsRef = useRef(elements);
  const labelSizeRef = useRef(labelSize);
  const selectedIdsRef = useRef(selectedIds);
  const mmToPx = MM_TO_PX * zoom;

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    labelSizeRef.current = labelSize;
  }, [labelSize]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const onAnyMouseDown = () => setContextMenu(null);
    window.addEventListener("mousedown", onAnyMouseDown);
    return () => window.removeEventListener("mousedown", onAnyMouseDown);
  }, [contextMenu]);

  const previewRecord = rows[0] ?? {};
  const hasSelection = selectedIds.length > 0;
  const selectedElement =
    selectedIds.length === 1
      ? elements.find((element) => element.id === selectedIds[0]) ?? null
      : null;
  const selectedTextStyle = selectedElement?.textStyle;
  const currentFontWeight = selectedTextStyle?.fontWeight ?? 400;
  const currentItalic = selectedTextStyle?.italic ?? false;
  const currentUnderline = selectedTextStyle?.underline ?? false;
  const currentStrikeThrough = selectedTextStyle?.strikeThrough ?? false;
  const currentAlign = selectedTextStyle?.align ?? "left";
  const currentWrapMode = selectedTextStyle?.wrapMode ?? "auto";
  const toolbarFonts = useMemo(() => {
    const base = systemFonts.length > 0 ? systemFonts : DEFAULT_FONT_OPTIONS;
    return withCurrentFont(base, selectedElement?.textStyle.fontFamily ?? "");
  }, [selectedElement?.textStyle.fontFamily, systemFonts]);
  const customPresetCategories = useMemo(() => {
    const fromSaved = customPresets.map((item) => item.category.trim()).filter((item) => item.length > 0);
    return [...new Set([...DEFAULT_CUSTOM_PRESET_CATEGORIES, ...fromSaved])];
  }, [customPresets]);

  const stageStyle = useMemo(
    () => ({
      width: labelSize.widthMm * mmToPx,
      height: labelSize.heightMm * mmToPx,
    }),
    [labelSize.heightMm, labelSize.widthMm, mmToPx]
  );

  const xTicks = useMemo(() => buildRulerTicks(labelSize.widthMm), [labelSize.widthMm]);
  const yTicks = useMemo(() => buildRulerTicks(labelSize.heightMm), [labelSize.heightMm]);

  const fitToViewport = useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const availableWidth = container.clientWidth - 64;
    const availableHeight = container.clientHeight - 64;
    if (availableWidth <= 0 || availableHeight <= 0) {
      return;
    }

    const ratioX = availableWidth / (labelSizeRef.current.widthMm * MM_TO_PX);
    const ratioY = availableHeight / (labelSizeRef.current.heightMm * MM_TO_PX);
    const fitZoom = Math.min(ratioX, ratioY);
    setZoom(clamp(fitZoom, MIN_ZOOM, MAX_ZOOM));
  }, []);

  useEffect(() => {
    fitToViewport();
  }, [fitToViewport, labelSize.heightMm, labelSize.widthMm]);

  useEffect(() => {
    const onResize = () => fitToViewport();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitToViewport]);

  const commitEditing = useCallback(() => {
    const current = editingRef.current;
    if (!current) {
      return;
    }

    const element = elementsRef.current.find((item) => item.id === current.elementId);
    if (!element) {
      setEditing(null);
      return;
    }

    setSelection([current.elementId]);
    updateSelectedBinding({
      mode: "fixed",
      fixedValue: current.value,
    });
    setEditing(null);
  }, [setSelection, updateSelectedBinding]);

  const startDrag = useCallback(
    (event: ReactMouseEvent, element: EditorElement) => {
      if (editingRef.current || resizeState) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      if (event.shiftKey) {
        toggleSelection(element.id);
        return;
      }

      const currentSelected = selectedIdsRef.current;
      const dragIds =
        currentSelected.length > 1 && currentSelected.includes(element.id)
          ? currentSelected
          : [element.id];
      setSelection(dragIds);
      pushHistoryCheckpoint();

      const dragIdSet = new Set(dragIds);
      const basePositionMap: DragState["basePositionMap"] = {};
      const baseMetaMap: DragState["baseMetaMap"] = {};

      for (const item of elementsRef.current) {
        if (!dragIdSet.has(item.id)) {
          continue;
        }
        basePositionMap[item.id] = { xMm: item.xMm, yMm: item.yMm };
        baseMetaMap[item.id] = { widthMm: item.widthMm, heightMm: item.heightMm };
      }

      const stationary = elementsRef.current.filter((item) => !dragIdSet.has(item.id));
      const targets = buildSnapTargets(stationary, labelSizeRef.current);

      setDragState({
        startClientX: event.clientX,
        startClientY: event.clientY,
        dragIds,
        primaryId: element.id,
        basePositionMap,
        baseMetaMap,
        targets,
      });
    },
    [pushHistoryCheckpoint, resizeState, setSelection, toggleSelection]
  );

  const startResize = (
    event: ReactMouseEvent,
    element: EditorElement,
    handle: ResizeHandle
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSelection([element.id]);
    pushHistoryCheckpoint();
    setResizeState({
      elementId: element.id,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseRect: {
        xMm: element.xMm,
        yMm: element.yMm,
        widthMm: element.widthMm,
        heightMm: element.heightMm,
      },
    });
  };

  const startEditing = (event: ReactMouseEvent, element: EditorElement) => {
    event.preventDefault();
    event.stopPropagation();
    const previewValue = resolveBindingValue(element.binding, previewRecord);
    setSelection([element.id]);
    setEditing({
      elementId: element.id,
      value: previewValue,
    });
  };

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      const dxMm = (event.clientX - dragState.startClientX) / mmToPx;
      const dyMm = (event.clientY - dragState.startClientY) / mmToPx;

      const primaryBase = dragState.basePositionMap[dragState.primaryId];
      const primaryMeta = dragState.baseMetaMap[dragState.primaryId];

      const movingPrimary = {
        id: dragState.primaryId,
        type: "text" as const,
        name: "",
        xMm: primaryBase.xMm + dxMm,
        yMm: primaryBase.yMm + dyMm,
        widthMm: primaryMeta.widthMm,
        heightMm: primaryMeta.heightMm,
        rotation: 0,
        binding: { mode: "fixed" as const, fixedValue: "" },
        textStyle: {
          fontFamily: "",
          fontSize: 0,
          fontWeight: 0,
          italic: false,
          underline: false,
          strikeThrough: false,
          align: "left" as const,
          color: "",
          letterSpacing: 0,
          lineHeight: 1,
        },
      };

      const snapped = snapElementPosition(movingPrimary, dragState.targets, SNAP_THRESHOLD_MM);
      const deltaX = snapped.xMm - primaryBase.xMm;
      const deltaY = snapped.yMm - primaryBase.yMm;
      const dragIdSet = new Set(dragState.dragIds);

      const nextElements = elementsRef.current.map((element) => {
        if (!dragIdSet.has(element.id)) {
          return element;
        }
        const basePosition = dragState.basePositionMap[element.id];
        const xMm = round1(basePosition.xMm + deltaX);
        const yMm = round1(basePosition.yMm + deltaY);
        return { ...element, xMm, yMm };
      });

      replaceElements(nextElements, snapped.guides, false);
    };

    const onUp = () => {
      replaceElements(elementsRef.current, [], false);
      setDragState(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState, mmToPx, replaceElements]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      const dxMm = (event.clientX - resizeState.startClientX) / mmToPx;
      const dyMm = (event.clientY - resizeState.startClientY) / mmToPx;
      const nextRect = resizeRect(resizeState.baseRect, resizeState.handle, dxMm, dyMm);
      updateElementRect(
        resizeState.elementId,
        {
          xMm: round1(nextRect.xMm),
          yMm: round1(nextRect.yMm),
          widthMm: round1(nextRect.widthMm),
          heightMm: round1(nextRect.heightMm),
        },
        false
      );
    };

    const onUp = () => {
      setResizeState(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [mmToPx, resizeState, updateElementRect]);

  const onWheelZoom = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const ratio = event.deltaY < 0 ? 1.08 : 0.92;
    setZoom((value) =>
            clamp(value * ratio, MIN_ZOOM, MAX_ZOOM));
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commitEditing();
    }
    if (event.key === "Escape") {
      setEditing(null);
    }
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(null);
      return;
    }
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      commitEditing();
    }
  };

  const selectAllOnFocus = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    event.currentTarget.select();
  };

  const onStyleChange = (patch: Partial<TextStyle>) => {
    if (!hasSelection) {
      return;
    }
    updateSelectedTextStyle(patch);
  };

  const rotateSelection = (delta: number) => {
    if (!hasSelection) {
      return;
    }
    pushHistoryCheckpoint();
    for (const id of selectedIds) {
      const element = elements.find((item) => item.id === id);
      if (!element) {
        continue;
      }
      updateElementRect(id, { rotation: normalizeRotation(element.rotation + delta) }, false);
    }
  };

  const onStageMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    if (editingRef.current || resizeState || dragState) {
      return;
    }

    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const point = toStagePoint(event.clientX, event.clientY, stage);
    const baseSelectedIds = event.shiftKey ? [...selectedIdsRef.current] : [];
    if (!event.shiftKey) {
      clearSelection();
    }
    setContextMenu(null);
    setMarqueeState({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      baseSelectedIds,
    });
  };

  const onStageContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (selectedIdsRef.current.length === 0) {
      return;
    }
    event.preventDefault();
    setContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  const onElementContextMenu = (event: ReactMouseEvent, element: EditorElement) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedIdsRef.current.includes(element.id)) {
      setSelection([element.id]);
    }
    setContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  const openSavePresetModal = () => {
    const selected = selectedIdsRef.current;
    if (selected.length === 0) {
      setContextMenu(null);
      return;
    }
    const defaultName =
      selected.length === 1
        ? elementsRef.current.find((element) => element.id === selected[0])?.name ?? "自定义图形"
        : `组合图形(${selected.length})`;
    setCustomPresetName(defaultName);
    setCustomPresetCategory(customPresetCategories[0] ?? "常用");
    setSavePresetModalOpen(true);
    setContextMenu(null);
  };

  const confirmSavePreset = () => {
    const saved = saveSelectionAsCustomPreset({
      name: customPresetName,
      category: customPresetCategory,
    });
    if (!saved) {
      return;
    }
    setSavePresetModalOpen(false);
  };

  useEffect(() => {
    if (!marqueeState) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }
      const point = toStagePoint(event.clientX, event.clientY, stage);
      setMarqueeState((current) =>
        current
          ? {
              ...current,
              currentX: point.x,
              currentY: point.y,
            }
          : current
      );
    };

    const onUp = () => {
      const widthPx = Math.abs(marqueeState.currentX - marqueeState.startX);
      const heightPx = Math.abs(marqueeState.currentY - marqueeState.startY);
      if (widthPx >= 2 || heightPx >= 2) {
        const selected = selectElementsByRect(elementsRef.current, {
          leftMm: Math.min(marqueeState.startX, marqueeState.currentX) / mmToPx,
          topMm: Math.min(marqueeState.startY, marqueeState.currentY) / mmToPx,
          rightMm: Math.max(marqueeState.startX, marqueeState.currentX) / mmToPx,
          bottomMm: Math.max(marqueeState.startY, marqueeState.currentY) / mmToPx,
        });
        const merged =
          marqueeState.baseSelectedIds.length > 0
            ? [...new Set([...marqueeState.baseSelectedIds, ...selected])]
            : selected;
        setSelection(merged);
      }
      setMarqueeState(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [marqueeState, mmToPx, setSelection]);

  return (
    <div className="canvas-stage-wrap">
      <div className="canvas-toolbar">
        <div className="canvas-text-toolbar">
          <label className="toolbar-inline compact-control">
            <span className="visually-hidden">字体</span>
            <select
              value={selectedElement?.textStyle.fontFamily ?? toolbarFonts[0]?.value ?? DEFAULT_FONT_OPTIONS[0].value}
              aria-label="字体"
              title="字体"
              onChange={(event) => onStyleChange({ fontFamily: event.target.value })}
              disabled={!hasSelection}
            >
              {toolbarFonts.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>

          <label className="toolbar-inline compact-control compact">
            <span className="visually-hidden">字号</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={selectedTextStyle?.fontSize ?? 24}
              aria-label="字号"
              title="字号"
              onChange={(event) => onStyleChange({ fontSize: Number(event.target.value) || 1 })}
              disabled={!hasSelection}
            />
          </label>

          <button
            type="button"
            className={`tool-ghost toolbar-btn icon-square-btn ${currentFontWeight >= 700 ? "active" : ""}`}
            onClick={() =>
              onStyleChange({
                fontWeight: currentFontWeight >= 700 ? 400 : 700,
              })
            }
            disabled={!hasSelection}
            title="加粗"
            aria-label="加粗"
          >
            <TextStyleIcon kind="bold" className="text-style-icon" />
          </button>
          <button
            type="button"
            className={`tool-ghost toolbar-btn icon-square-btn ${currentItalic ? "active" : ""}`}
            onClick={() => onStyleChange({ italic: !currentItalic })}
            disabled={!hasSelection}
            title="斜体"
            aria-label="斜体"
          >
            <TextStyleIcon kind="italic" className="text-style-icon" />
          </button>
          <button
            type="button"
            className={`tool-ghost toolbar-btn icon-square-btn ${currentUnderline ? "active" : ""}`}
            onClick={() => onStyleChange({ underline: !currentUnderline })}
            disabled={!hasSelection}
            title="下划线"
            aria-label="下划线"
          >
            <TextStyleIcon kind="underline" className="text-style-icon" />
          </button>
          <button
            type="button"
            className={`tool-ghost toolbar-btn icon-square-btn ${currentStrikeThrough ? "active" : ""}`}
            onClick={() => onStyleChange({ strikeThrough: !currentStrikeThrough })}
            disabled={!hasSelection}
            title="删除线"
            aria-label="删除线"
          >
            <TextStyleIcon kind="strike-through" className="text-style-icon" />
          </button>
          <button
            type="button"
            className={`tool-ghost toolbar-btn icon-square-btn ${currentAlign === "left" ? "active" : ""}`}
            onClick={() => onStyleChange({ align: "left" })}
            disabled={!hasSelection}
            title="左对齐"
            aria-label="左对齐"
          >
            <TextStyleIcon kind="align-left" className="text-style-icon" />
          </button>
          <button
            type="button"
            className={`tool-ghost toolbar-btn icon-square-btn ${currentAlign === "center" ? "active" : ""}`}
            onClick={() => onStyleChange({ align: "center" })}
            disabled={!hasSelection}
            title="居中对齐"
            aria-label="居中对齐"
          >
            <TextStyleIcon kind="align-center" className="text-style-icon" />
          </button>
          <button
            type="button"
            className={`tool-ghost toolbar-btn icon-square-btn ${currentAlign === "right" ? "active" : ""}`}
            onClick={() => onStyleChange({ align: "right" })}
            disabled={!hasSelection}
            title="右对齐"
            aria-label="右对齐"
          >
            <TextStyleIcon kind="align-right" className="text-style-icon" />
          </button>
          <button
            type="button"
            className={`tool-ghost toolbar-btn ${currentWrapMode === "auto" ? "active" : ""}`}
            onClick={() =>
              onStyleChange({
                wrapMode: currentWrapMode === "auto" ? "singleLine" : "auto",
              })
            }
            disabled={!hasSelection}
            title={currentWrapMode === "auto" ? "Auto wrap enabled" : "Single-line transform"}
            aria-label="Toggle wrap mode"
          >
            换行
          </button>
          <button type="button"
            className="tool-ghost toolbar-btn"
            onClick={() => rotateSelection(-90)}
            disabled={!hasSelection}
            title="Rotate -90"
          >
            -90
          </button>
          <button
            type="button"
            className="tool-ghost toolbar-btn"
            onClick={() => rotateSelection(90)}
            disabled={!hasSelection}
            title="Rotate +90"
          >
            +90
          </button>
        </div>

        <div className="canvas-toolbar-right">
          <p className="muted">
            尺寸 {labelSize.widthMm} × {labelSize.heightMm} mm
          </p>
          <button type="button" className="tool-ghost toolbar-btn" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="tool-ghost toolbar-btn" onClick={fitToViewport}>
            适配
          </button>
        </div>
      </div>

      <div className="canvas-scroll" onWheel={onWheelZoom} ref={scrollRef}>
        <div className="canvas-center">
          <div className="ruler-shell">
            <div className="ruler-corner" />
            <div className="ruler horizontal" style={{ width: stageStyle.width }}>
              {xTicks.map((tick) => (
                <div
                  key={`x-${tick}`}
                  className={`tick ${isMajorRulerTick(tick) ? "major" : "minor"}`}
                  style={{ left: tick * mmToPx }}
                >
                  {shouldShowRulerLabel(tick, labelSize.widthMm) ? <span>{tick}</span> : null}
                </div>
              ))}
            </div>

            <div className="ruler vertical" style={{ height: stageStyle.height }}>
              {yTicks.map((tick) => (
                <div
                  key={`y-${tick}`}
                  className={`tick ${isMajorRulerTick(tick) ? "major" : "minor"}`}
                  style={{ top: tick * mmToPx }}
                >
                  {shouldShowRulerLabel(tick, labelSize.heightMm) ? <span>{tick}</span> : null}
                </div>
              ))}
            </div>

            <div
              ref={stageRef}
              className="canvas-stage"
              style={stageStyle}
              onMouseDown={onStageMouseDown}
              onContextMenu={onStageContextMenu}
            >
              {elements.map((element) => {
                const isSelected = selectedIds.includes(element.id);
                const preview = resolveBindingValue(element.binding, previewRecord);
                const isEditing = editing?.elementId === element.id;
                const showResizeHandles = isSelected && selectedIds.length === 1;
                const isAutoWrap = element.textStyle.wrapMode !== "singleLine";
                const noWrapScaleX =
                  element.type === "text" && !isAutoWrap
                    ? computeSingleLineScaleX({
                        text: preview,
                        textStyle: element.textStyle,
                        widthMm: element.widthMm,
                        mmToPx,
                      })
                    : 1;

                return (
                  <div
                    key={element.id}
                    className={`canvas-element ${isSelected ? "selected" : ""} ${isEditing ? "editing" : ""}`}
                    style={{
                      left: element.xMm * mmToPx,
                      top: element.yMm * mmToPx,
                      width: element.widthMm * mmToPx,
                      height: element.heightMm * mmToPx,
                      transform: `rotate(${element.rotation}deg)`,
                    }}
                    onMouseDown={(event) => startDrag(event, element)}
                    onContextMenu={(event) => onElementContextMenu(event, element)}
                    onDoubleClick={(event) => startEditing(event, element)}
                  >
                    {isEditing ? (
                      element.type === "text" ? (
                        <textarea
                          autoFocus
                          className="inline-editor inline-editor-multiline"
                          value={editing.value}
                          rows={3}
                          onMouseDown={(event) => event.stopPropagation()}
                          style={{
                            fontFamily: element.textStyle.fontFamily,
                            fontSize: `${Math.max(1, element.textStyle.fontSize * mmToPx)}px`,
                            fontWeight: element.textStyle.fontWeight,
                            fontStyle: element.textStyle.italic ? "italic" : "normal",
                            textDecoration: buildTextDecoration(element.textStyle),
                            textAlign: element.textStyle.align,
                            color: element.textStyle.color,
                            letterSpacing: `${element.textStyle.letterSpacing * mmToPx}px`,
                            lineHeight: element.textStyle.lineHeight,
                          }}
                          onChange={(event) =>
                            setEditing((current) =>
                              current
                                ? {
                                    ...current,
                                    value: event.target.value,
                                  }
                                : current
                            )
                          }
                          onBlur={commitEditing}
                          onKeyDown={onTextareaKeyDown}
                          onFocus={selectAllOnFocus}
                        />
                      ) : (
                        <input
                          autoFocus
                          className="inline-editor"
                          value={editing.value}
                          onMouseDown={(event) => event.stopPropagation()}
                          style={{
                            fontFamily: element.textStyle.fontFamily,
                            fontSize: `${Math.max(1, element.textStyle.fontSize * mmToPx)}px`,
                            fontWeight: element.textStyle.fontWeight,
                            fontStyle: element.textStyle.italic ? "italic" : "normal",
                            textDecoration: buildTextDecoration(element.textStyle),
                            textAlign: element.textStyle.align,
                            color: element.textStyle.color,
                            letterSpacing: `${element.textStyle.letterSpacing * mmToPx}px`,
                            lineHeight: element.textStyle.lineHeight,
                          }}
                          onChange={(event) =>
                            setEditing((current) =>
                              current
                                ? {
                                    ...current,
                                    value: event.target.value,
                                  }
                                : current
                            )
                          }
                          onBlur={commitEditing}
                          onKeyDown={onInputKeyDown}
                          onFocus={selectAllOnFocus}
                        />
                      )
                    ) : element.type === "text" ? (
                      <div
                        className="element-content"
                        style={{
                          fontFamily: element.textStyle.fontFamily,
                          fontSize: `${Math.max(1, element.textStyle.fontSize * mmToPx)}px`,
                          fontWeight: element.textStyle.fontWeight,
                          fontStyle: element.textStyle.italic ? "italic" : "normal",
                          textDecoration: buildTextDecoration(element.textStyle),
                          textAlign: element.textStyle.align,
                          color: element.textStyle.color,
                          letterSpacing: `${element.textStyle.letterSpacing * mmToPx}px`,
                          lineHeight: element.textStyle.lineHeight,
                          whiteSpace: isAutoWrap ? "pre-wrap" : "nowrap",
                          overflowWrap: isAutoWrap ? "anywhere" : "normal",
                          wordBreak: isAutoWrap ? "break-word" : "normal",
                          textOverflow: "clip",
                          transform: !isAutoWrap ? `scaleX(${noWrapScaleX})` : undefined,
                          transformOrigin: !isAutoWrap
                            ? `${getAlignTransformOrigin(element.textStyle.align)} center`
                            : undefined,
                        }}
                      >
                        {preview}
                      </div>
                    ) : element.type === "barcode" ? (
                      <div
                        className={`barcode-preview ${
                          element.barcode.textPosition === "none" ? "is-text-hidden" : "is-text-visible"
                        }`}
                        style={
                          {
                            "--barcode-gap": `${Math.max(1, element.barcode.textGap * mmToPx)}px`,
                          } as CSSProperties
                        }
                      >
                        {element.barcode.textPosition === "top" ? (
                          <span
                            className="barcode-preview-text"
                            style={buildBarcodeTextStyle(element.textStyle, {
                              mmToPx,
                              heightMm: element.heightMm,
                              widthMm: element.widthMm,
                              text: preview || "123456789",
                              minBarcodeHeightMm: element.barcode.minHeight,
                              textGapMm: element.barcode.textGap,
                            })}
                          >
                            {preview || "123456789"}
                          </span>
                        ) : null}
                        <div className="barcode-preview-core">
                          <BarcodePreview
                            value={preview || "123456789"}
                            symbology={element.barcode.symbology}
                            className="barcode-svg"
                            showText={false}
                            mmToPx={mmToPx}
                            moduleWidthMm={element.barcode.moduleWidth}
                            quietZoneMm={element.barcode.quietZone}
                            heightMm={Math.max(3, element.heightMm)}
                          />
                        </div>
                        {element.barcode.textPosition === "bottom" ? (
                          <span
                            className="barcode-preview-text"
                            style={buildBarcodeTextStyle(element.textStyle, {
                              mmToPx,
                              heightMm: element.heightMm,
                              widthMm: element.widthMm,
                              text: preview || "123456789",
                              minBarcodeHeightMm: element.barcode.minHeight,
                              textGapMm: element.barcode.textGap,
                            })}
                          >
                            {preview || "123456789"}
                          </span>
                        ) : null}
                      </div>
                    ) : element.type === "qrcode" ? (
                      <div className="qrcode-preview">
                        <QrcodePreview value={preview || "https://label.local"} className="qrcode-svg" />
                      </div>
                    ) : element.type === "image" ? (
                      preview.startsWith("data:image/") ? (
                        <div className="image-preview image-preview-has-image">
                          <img
                            src={preview}
                            alt={element.name}
                            className="image-preview-img"
                            draggable={false}
                          />
                        </div>
                      ) : (
                        <div className="image-preview">
                          <div className="image-preview-frame">
                            <span className="image-preview-mark">IMG</span>
                          </div>
                          <p className="image-preview-text">{preview || "Image"}</p>
                        </div>
                      )
                    ) : element.type === "shape" ? (
                      (() => {
                        const strokeWidth = normalizeVisualStrokeWidth(element.textStyle.strokeWidth);
                        const strokeDashArray = normalizeVisualDashArray(element.textStyle.strokeDashArray);
                        const strokeColor = toAlphaColor(
                          element.textStyle.strokeColor || element.textStyle.color,
                          element.textStyle.strokeOpacity,
                          element.textStyle.color
                        );
                        const fillColor = toAlphaColor(
                          element.textStyle.fillColor || element.textStyle.color,
                          element.textStyle.fillOpacity,
                          element.textStyle.color
                        );
                        const shapeStyle = {
                          borderColor: strokeColor,
                          borderWidth: `${toShapeBorderWidthPx(strokeWidth)}px`,
                          borderStyle: strokeDashArray.length > 0 ? "dashed" : "solid",
                          backgroundColor: fillColor,
                        };
                        const presetId =
                          element.binding.mode === "fixed"
                            ? readShapePresetIdFromBinding(element.binding.fixedValue)
                            : null;
                        if (presetId) {
                          return (
                            <div
                              className="shape-preview shape-preview-preset"
                              style={shapeStyle}
                            >
                              <PresetGlyph
                                kind="shape"
                                presetId={presetId}
                                className="shape-preset-svg"
                                strokeColor={strokeColor}
                                fillColor={element.textStyle.fillColor}
                                strokeWidth={strokeWidth}
                                strokeOpacity={element.textStyle.strokeOpacity}
                                fillOpacity={element.textStyle.fillOpacity}
                                strokeLineCap={element.textStyle.strokeLineCap}
                                strokeLineJoin={element.textStyle.strokeLineJoin}
                                strokeDashArray={strokeDashArray}
                                strokeDashOffset={element.textStyle.strokeDashOffset}
                                strokeMiterLimit={element.textStyle.strokeMiterLimit}
                                fillRule={element.textStyle.fillRule}
                              />
                            </div>
                          );
                        }
                        if (preview.startsWith("data:image/")) {
                          return (
                            <div className="shape-preview shape-preview-has-image">
                              <img src={preview} alt={element.name} className="shape-preview-img" draggable={false} />
                            </div>
                          );
                        }
                        return (
                          <div className="shape-preview" style={shapeStyle}>
                            <span className="shape-preview-text">{preview || "Shape"}</span>
                          </div>
                        );
                      })()
                    ) : (
                      (() => {
                        const presetId =
                          element.binding.mode === "fixed"
                            ? readIconPresetIdFromBinding(element.binding.fixedValue)
                            : null;
                        if (presetId) {
                          return (
                            <div className="icon-preview icon-preview-preset">
                              <PresetGlyph
                                kind="icon"
                                presetId={presetId}
                                className="icon-preset-svg"
                                strokeColor={element.textStyle.strokeColor || element.textStyle.color}
                                fillColor={element.textStyle.fillColor}
                                strokeWidth={element.textStyle.strokeWidth}
                                strokeOpacity={element.textStyle.strokeOpacity}
                                fillOpacity={element.textStyle.fillOpacity}
                                strokeLineCap={element.textStyle.strokeLineCap}
                                strokeLineJoin={element.textStyle.strokeLineJoin}
                                strokeDashArray={element.textStyle.strokeDashArray}
                                strokeDashOffset={element.textStyle.strokeDashOffset}
                                strokeMiterLimit={element.textStyle.strokeMiterLimit}
                                fillRule={element.textStyle.fillRule}
                              />
                            </div>
                          );
                        }
                        if (preview.startsWith("data:image/")) {
                          return (
                            <div className="icon-preview icon-preview-has-image">
                              <img src={preview} alt={element.name} className="icon-preview-img" draggable={false} />
                            </div>
                          );
                        }
                        return (
                          <div className="icon-preview">
                            <span
                              className="icon-preview-glyph"
                              style={{
                                fontFamily: element.textStyle.fontFamily,
                                color: toAlphaColor(
                                  element.textStyle.strokeColor || element.textStyle.color,
                                  element.textStyle.strokeOpacity,
                                  element.textStyle.color
                                ),
                                fontWeight: element.textStyle.fontWeight,
                              }}
                            >
                              {preview || "@"}
                            </span>
                          </div>
                        );
                      })()
                    )}

                    {showResizeHandles
                      ? RESIZE_HANDLES.map((handle) => (
                          <span
                            key={`${element.id}-${handle}`}
                            className={`resize-handle ${handle}`}
                            onMouseDown={(event) => startResize(event, element, handle)}
                          />
                        ))
                      : null}
                  </div>
                );
              })}

              {snapGuides.map((guide, index) => (
                <div
                  key={`${guide.axis}-${guide.value}-${index}`}
                  className={`snap-guide ${guide.axis}`}
                  style={
                    guide.axis === "x"
                      ? { left: guide.value * mmToPx }
                      : { top: guide.value * mmToPx }
                  }
                />
              ))}

              {marqueeState ? (
                <div
                  className="selection-marquee"
                  style={{
                    left: Math.min(marqueeState.startX, marqueeState.currentX),
                    top: Math.min(marqueeState.startY, marqueeState.currentY),
                    width: Math.abs(marqueeState.currentX - marqueeState.startX),
                    height: Math.abs(marqueeState.currentY - marqueeState.startY),
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {contextMenu ? (
        <div
          className="canvas-context-menu"
          style={{ left: contextMenu.clientX, top: contextMenu.clientY }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" className="tool-ghost canvas-context-item" onClick={openSavePresetModal}>
            添加到自定义图形...
          </button>
        </div>
      ) : null}

      {savePresetModalOpen ? (
        <div className="modal-mask" onClick={() => setSavePresetModalOpen(false)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>保存为自定义图形</h3>
              <button type="button" onClick={() => setSavePresetModalOpen(false)} aria-label="关闭弹窗">
                ×
              </button>
            </header>
            <div className="form-grid">
              <label>
                名称
                <input
                  value={customPresetName}
                  onChange={(event) => setCustomPresetName(event.target.value)}
                  placeholder="输入自定义图形名称"
                />
              </label>
              <label>
                分类
                <select
                  value={customPresetCategory}
                  onChange={(event) => setCustomPresetCategory(event.target.value)}
                >
                  {customPresetCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="inline-actions">
              <button type="button" className="tool-ghost" onClick={() => setSavePresetModalOpen(false)}>
                取消
              </button>
              <button type="button" className="primary" onClick={confirmSavePreset}>
                保存
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) {
    return 0;
  }
  const value = rotation % 360;
  return value < 0 ? value + 360 : value;
}

function getAlignTransformOrigin(align: TextStyle["align"]): "left" | "center" | "right" {
  if (align === "center") {
    return "center";
  }
  if (align === "right") {
    return "right";
  }
  return "left";
}

function toStagePoint(clientX: number, clientY: number, stage: HTMLDivElement) {
  const rect = stage.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  return {
    x: clamp(clientX - rect.left, 0, width),
    y: clamp(clientY - rect.top, 0, height),
  };
}

function resizeRect(
  base: { xMm: number; yMm: number; widthMm: number; heightMm: number },
  handle: ResizeHandle,
  dxMm: number,
  dyMm: number
) {
  let xMm = base.xMm;
  let yMm = base.yMm;
  let widthMm = base.widthMm;
  let heightMm = base.heightMm;

  if (handle.includes("e")) {
    widthMm = base.widthMm + dxMm;
  }
  if (handle.includes("w")) {
    widthMm = base.widthMm - dxMm;
    xMm = base.xMm + dxMm;
  }
  if (handle.includes("s")) {
    heightMm = base.heightMm + dyMm;
  }
  if (handle.includes("n")) {
    heightMm = base.heightMm - dyMm;
    yMm = base.yMm + dyMm;
  }

  if (widthMm < MIN_ELEMENT_MM) {
    if (handle.includes("w")) {
      xMm -= MIN_ELEMENT_MM - widthMm;
    }
    widthMm = MIN_ELEMENT_MM;
  }
  if (heightMm < MIN_ELEMENT_MM) {
    if (handle.includes("n")) {
      yMm -= MIN_ELEMENT_MM - heightMm;
    }
    heightMm = MIN_ELEMENT_MM;
  }

  widthMm = Math.max(MIN_ELEMENT_MM, widthMm);
  heightMm = Math.max(MIN_ELEMENT_MM, heightMm);

  return { xMm, yMm, widthMm, heightMm };
}






