import { useMemo, useState, type ReactNode } from "react";

import {
  ICON_PRESETS,
  PresetGlyph,
  SHAPE_PRESETS,
  type VisualPreset,
  type VisualPresetKind,
} from "./core/visual-presets";

type LeftPaletteProps = {
  onAddText: () => void;
  onAddBarcode: () => void;
  onAddImage: () => void;
  onAddQrcode: () => void;
  onAddShape: (presetId: string) => void;
  onAddIcon: (presetId: string) => void;
};

type ToolItem = {
  id: string;
  label: string;
  onClick: () => void;
  icon: ReactNode;
};

export function LeftPalette({
  onAddText,
  onAddBarcode,
  onAddImage,
  onAddQrcode,
  onAddShape,
  onAddIcon,
}: LeftPaletteProps) {
  const [pickerKind, setPickerKind] = useState<VisualPresetKind | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const presetOptions = pickerKind === "shape" ? SHAPE_PRESETS : ICON_PRESETS;
  const presetCategories = useMemo(() => {
    const source = new Set(presetOptions.map((item) => item.category));
    return ["All", ...source];
  }, [presetOptions]);
  const visiblePresets = useMemo(() => {
    const keyword = searchKeyword.trim().toLocaleLowerCase("en-US");
    return presetOptions.filter((item) => {
      const matchCategory = activeCategory === "All" || item.category === activeCategory;
      if (!matchCategory) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const haystack = `${item.label} ${item.id} ${item.category}`.toLocaleLowerCase("en-US");
      return haystack.includes(keyword);
    });
  }, [activeCategory, presetOptions, searchKeyword]);

  const openPresetPicker = (kind: VisualPresetKind) => {
    setPickerKind(kind);
    setSearchKeyword("");
    setActiveCategory("All");
  };

  const closePresetPicker = () => {
    setPickerKind(null);
  };

  const choosePreset = (preset: VisualPreset) => {
    if (pickerKind === "shape") {
      onAddShape(preset.id);
    } else if (pickerKind === "icon") {
      onAddIcon(preset.id);
    }
    closePresetPicker();
  };

  const items: ToolItem[] = [
    {
      id: "text",
      label: "文本",
      onClick: onAddText,
      icon: <IconText />,
    },
    {
      id: "barcode",
      label: "条码",
      onClick: onAddBarcode,
      icon: <IconBarcode />,
    },
    {
      id: "image",
      label: "图片",
      onClick: onAddImage,
      icon: <IconImage />,
    },
    {
      id: "qrcode",
      label: "二维码",
      onClick: onAddQrcode,
      icon: <IconQrcode />,
    },
    {
      id: "shape",
      label: "图形",
      onClick: () => openPresetPicker("shape"),
      icon: <IconShape />,
    },
    {
      id: "icon",
      label: "图标",
      onClick: () => openPresetPicker("icon"),
      icon: <IconStar />,
    },
  ];

  return (
    <>
      <div className="tool-column">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="palette-tool"
            onClick={item.onClick}
            data-testid={`tool-${item.id}`}
          >
            <span className="palette-tool-icon">{item.icon}</span>
            <span className="palette-tool-label">{item.label}</span>
          </button>
        ))}
      </div>

      {pickerKind ? (
        <div className="modal-mask preset-picker-mask" onClick={closePresetPicker}>
          <section className="modal-card preset-picker-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>{pickerKind === "shape" ? "选择图形" : "选择图标"}</h3>
              <button type="button" onClick={closePresetPicker} aria-label="关闭选择弹窗">
                ×
              </button>
            </header>

            <div className="preset-picker-toolbar">
              <label>
                搜索
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder={pickerKind === "shape" ? "输入图形名称" : "输入图标名称"}
                />
              </label>
            </div>

            <div className="preset-picker-categories">
              {presetCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`tool-ghost preset-category-btn ${activeCategory === category ? "active" : ""}`}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="preset-picker-grid">
              {visiblePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="preset-card"
                  onClick={() => choosePreset(preset)}
                  data-testid={`preset-card-${preset.id}`}
                >
                  <span className="preset-card-preview" aria-hidden="true">
                    <PresetGlyph kind={pickerKind} presetId={preset.id} className="preset-glyph" />
                  </span>
                  <span className="preset-card-label">{preset.label}</span>
                  <span className="preset-card-meta">{preset.category}</span>
                </button>
              ))}
              {visiblePresets.length === 0 ? <p className="muted">没有匹配的预设。</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function IconShell({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      {children}
    </svg>
  );
}

function IconText() {
  return (
    <IconShell>
      <path d="M4 6h16M8 6v12M16 6v12M6 18h12" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </IconShell>
  );
}

function IconBarcode() {
  return (
    <IconShell>
      <rect x="3" y="5" width="1.5" height="14" fill="currentColor" />
      <rect x="6" y="5" width="2.5" height="14" fill="currentColor" />
      <rect x="10" y="5" width="1" height="14" fill="currentColor" />
      <rect x="12.5" y="5" width="3" height="14" fill="currentColor" />
      <rect x="17" y="5" width="1.2" height="14" fill="currentColor" />
      <rect x="19.4" y="5" width="1.8" height="14" fill="currentColor" />
    </IconShell>
  );
}

function IconImage() {
  return (
    <IconShell>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" />
      <path d="M5.8 17l4.2-4 2.8 2.6 3.8-3.7 1.8 1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </IconShell>
  );
}

function IconQrcode() {
  return (
    <IconShell>
      <rect x="4" y="4" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="4" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="14" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="2" height="2" fill="currentColor" />
      <rect x="18" y="14" width="2" height="2" fill="currentColor" />
      <rect x="16" y="18" width="4" height="2" fill="currentColor" />
    </IconShell>
  );
}

function IconShape() {
  return (
    <IconShell>
      <rect x="4" y="6" width="8" height="12" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.5" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </IconShell>
  );
}

function IconStar() {
  return (
    <IconShell>
      <path
        d="M12 4.2l2.3 4.6 5.1.7-3.7 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.6 9.5l5.1-.7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </IconShell>
  );
}

