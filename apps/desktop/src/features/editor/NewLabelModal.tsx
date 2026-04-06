import { ChangeEvent, useMemo } from "react";

type NewLabelModalProps = {
  open: boolean;
  title: string;
  widthMm: number;
  heightMm: number;
  heading?: string;
  confirmText?: string;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onConfirm: () => void;
};

import { COMMON_LABEL_SIZES } from "./core/new-label-sizes";

const PREVIEW_MAX = 260;

export function NewLabelModal({
  open,
  title,
  widthMm,
  heightMm,
  heading = "新建标签",
  confirmText = "确认创建",
  onClose,
  onTitleChange,
  onWidthChange,
  onHeightChange,
  onConfirm,
}: NewLabelModalProps) {
  const selectedPresetLabel = useMemo(
    () =>
      COMMON_LABEL_SIZES.find((item) => item.widthMm === widthMm && item.heightMm === heightMm)?.label ?? "",
    [heightMm, widthMm]
  );

  const onPresetChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextPreset = COMMON_LABEL_SIZES.find((item) => item.label === event.target.value);
    if (!nextPreset) {
      return;
    }
    onWidthChange(nextPreset.widthMm);
    onHeightChange(nextPreset.heightMm);
  };

  const preview = useMemo(() => {
    const ratio = Math.min(PREVIEW_MAX / Math.max(widthMm, 1), PREVIEW_MAX / Math.max(heightMm, 1));
    return {
      width: Math.max(60, widthMm * ratio),
      height: Math.max(40, heightMm * ratio),
    };
  }, [heightMm, widthMm]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <section className="modal-card new-label-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h3>{heading}</h3>
          <button type="button" onClick={onClose} aria-label="关闭新建标签弹窗">
            ×
          </button>
        </header>
        <div className="new-label-body">
          <section className="new-label-form">
            <h4>标签参数</h4>
            <label>
              标签标题
              <input value={title} onChange={(event) => onTitleChange(event.target.value)} />
            </label>
            <label>
              常用尺寸
              <select value={selectedPresetLabel} onChange={onPresetChange}>
                <option value="">自定义</option>
                {COMMON_LABEL_SIZES.map((item) => (
                  <option key={item.label} value={item.label}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              宽度(mm)
              <input
                type="number"
                min={10}
                value={widthMm}
                onChange={(event) => onWidthChange(Number(event.target.value))}
              />
            </label>
            <label>
              高度(mm)
              <input
                type="number"
                min={10}
                value={heightMm}
                onChange={(event) => onHeightChange(Number(event.target.value))}
              />
            </label>
            <button type="button" className="primary" onClick={onConfirm}>
              {confirmText}
            </button>
          </section>
          <section className="new-label-preview">
            <h4>尺寸预览</h4>
            <div className="new-label-stage">
              <div
                className="new-label-shape"
                style={{
                  width: preview.width,
                  height: preview.height,
                }}
              />
            </div>
            <p className="muted">
              {widthMm}mm × {heightMm}mm
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
