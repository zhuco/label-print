import { useMemo, useState, type ReactNode } from "react";

import { INDUSTRY_TEMPLATES, type IndustryTemplate } from "./core/industry-templates";
import { ICON_PRESETS, PresetGlyph, SHAPE_PRESETS, type VisualPresetKind } from "./core/visual-presets";

type LeftPaletteProps = {
  onAddText: () => void;
  onAddBarcode: () => void;
  onAddImage: () => void;
  onRecognizeImage: () => void;
  onAddQrcode: () => void;
  onAddShape: (presetId: string) => void;
  onAddIcon: (presetId: string) => void;
  onApplyIndustryTemplate: (templateId: string) => void;
  onApplyCustomPreset: (presetId: string) => void;
  customPresets: Array<{
    id: string;
    name: string;
    category: string;
    elementCount: number;
    createdAt: number;
  }>;
};

type ToolItem = {
  id: string;
  label: string;
  onClick: () => void;
  icon: ReactNode;
};

type PickerKind = VisualPresetKind | "industry" | "custom";

type PickerOption = {
  id: string;
  label: string;
  category: string;
  description?: string;
  kind: PickerKind;
  previewPresetId?: string;
};

export function LeftPalette({
  onAddText,
  onAddBarcode,
  onAddImage,
  onRecognizeImage,
  onAddQrcode,
  onAddShape,
  onAddIcon,
  onApplyIndustryTemplate,
  onApplyCustomPreset,
  customPresets,
}: LeftPaletteProps) {
  const [pickerKind, setPickerKind] = useState<PickerKind | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState("全部");

  const pickerOptions = useMemo<PickerOption[]>(() => {
    if (!pickerKind) {
      return [];
    }
    if (pickerKind === "industry") {
      return INDUSTRY_TEMPLATES.map((template) => toIndustryOption(template));
    }
    if (pickerKind === "custom") {
      return customPresets.map((item) => ({
        id: item.id,
        label: item.name,
        category: item.category,
        kind: "custom",
        description: `${item.elementCount} 个元素`,
      }));
    }
    const visualOptions = pickerKind === "shape" ? SHAPE_PRESETS : ICON_PRESETS;
    return visualOptions.map((item) => ({
      id: item.id,
      label: item.label,
      category: item.category,
      kind: pickerKind,
      previewPresetId: item.id,
    }));
  }, [customPresets, pickerKind]);

  const pickerCategories = useMemo(() => {
    const source = new Set(pickerOptions.map((item) => item.category));
    return ["全部", ...source];
  }, [pickerOptions]);

  const visibleOptions = useMemo(() => {
    const keyword = searchKeyword.trim().toLocaleLowerCase("zh-CN");
    return pickerOptions.filter((item) => {
      const matchCategory = activeCategory === "全部" || item.category === activeCategory;
      if (!matchCategory) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const haystack = `${item.label} ${item.id} ${item.category} ${item.description ?? ""}`.toLocaleLowerCase("zh-CN");
      return haystack.includes(keyword);
    });
  }, [activeCategory, pickerOptions, searchKeyword]);

  const openPresetPicker = (kind: PickerKind) => {
    setPickerKind(kind);
    setSearchKeyword("");
    setActiveCategory("全部");
  };

  const closePresetPicker = () => {
    setPickerKind(null);
  };

  const choosePreset = (option: PickerOption) => {
    if (option.kind === "shape") {
      onAddShape(option.id);
    } else if (option.kind === "icon") {
      onAddIcon(option.id);
    } else if (option.kind === "custom") {
      onApplyCustomPreset(option.id);
    } else if (option.kind === "industry") {
      onApplyIndustryTemplate(option.id);
    }
    closePresetPicker();
  };

  const items: ToolItem[] = [
    { id: "text", label: "文本", onClick: onAddText, icon: <IconText /> },
    { id: "barcode", label: "条码", onClick: onAddBarcode, icon: <IconBarcode /> },
    { id: "image", label: "图片", onClick: onAddImage, icon: <IconImage /> },
    { id: "image-recognition", label: "图片识别", onClick: onRecognizeImage, icon: <IconScanImage /> },
    { id: "qrcode", label: "二维码", onClick: onAddQrcode, icon: <IconQrcode /> },
    { id: "shape", label: "图形", onClick: () => openPresetPicker("shape"), icon: <IconShape /> },
    { id: "icon", label: "图标", onClick: () => openPresetPicker("icon"), icon: <IconStar /> },
    { id: "custom-template", label: "自定义图形", onClick: () => openPresetPicker("custom"), icon: <IconCustomTemplate /> },
    { id: "industry-template", label: "行业模板", onClick: () => openPresetPicker("industry"), icon: <IconTemplate /> },
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
              <h3>{resolvePickerTitle(pickerKind)}</h3>
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
                  placeholder={resolveSearchPlaceholder(pickerKind)}
                />
              </label>
            </div>

            <div className="preset-picker-categories">
              {pickerCategories.map((category) => (
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
              {visibleOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="preset-card"
                  onClick={() => choosePreset(option)}
                  data-testid={
                    option.kind === "industry"
                      ? `industry-template-${option.id}`
                      : option.kind === "custom"
                        ? `custom-template-${option.id}`
                        : `preset-card-${option.id}`
                  }
                >
                  <span className="preset-card-preview" aria-hidden="true">
                    {option.kind === "custom" ? (
                      <span className="preset-custom-mark">自定义</span>
                    ) : (
                      <PresetGlyph
                        kind={option.kind === "shape" ? "shape" : "icon"}
                        presetId={option.previewPresetId ?? "rectangle"}
                        className="preset-glyph"
                      />
                    )}
                  </span>
                  <span className="preset-card-label">{option.label}</span>
                  <span className="preset-card-meta">{option.category}</span>
                  {option.description ? <span className="preset-card-desc">{option.description}</span> : null}
                </button>
              ))}
              {visibleOptions.length === 0 ? <p className="muted">没有匹配的预设。</p> : null}
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

function IconScanImage() {
  return (
    <IconShell>
      <rect x="4.5" y="5" width="15" height="14" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.2 8.5h2.4M14.4 8.5h2.4M7.2 15.5h2.4M14.4 15.5h2.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 13l2-2 2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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

function IconTemplate() {
  return (
    <IconShell>
      <rect x="4" y="4.5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 9h8M8 12h8M8 15h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15.8 6.8l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </IconShell>
  );
}

function IconCustomTemplate() {
  return (
    <IconShell>
      <rect x="4" y="4.5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 9h8M8 12h8M8 15h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15 6.4l1.1 2.2 2.4.3-1.7 1.6.4 2.4-2.2-1.1-2.2 1.1.4-2.4-1.7-1.6 2.4-.3z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </IconShell>
  );
}

function resolvePickerTitle(kind: PickerKind): string {
  if (kind === "shape") {
    return "选择图形";
  }
  if (kind === "icon") {
    return "选择图标";
  }
  if (kind === "custom") {
    return "选择自定义图形";
  }
  return "选择行业模板";
}

function resolveSearchPlaceholder(kind: PickerKind): string {
  if (kind === "shape") {
    return "输入图形名称";
  }
  if (kind === "icon") {
    return "输入图标名称";
  }
  if (kind === "custom") {
    return "输入模板名称或分类";
  }
  return "输入行业模板名称";
}

function toIndustryOption(template: IndustryTemplate): PickerOption {
  return {
    id: template.id,
    label: template.label,
    category: template.category,
    description: template.description,
    kind: "industry",
    previewPresetId: template.iconPresetId,
  };
}

