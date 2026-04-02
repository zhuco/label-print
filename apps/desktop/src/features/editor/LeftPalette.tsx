type LeftPaletteProps = {
  onAddText: () => void;
  onAddBarcode: () => void;
};

export function LeftPalette({ onAddText, onAddBarcode }: LeftPaletteProps) {
  return (
    <div>
      <h2>元素</h2>
      <p className="muted">快速添加常用标签元素</p>
      <div style={{ display: "grid", gap: 8 }}>
        <button type="button" onClick={onAddText}>添加文本</button>
        <button type="button" onClick={onAddBarcode}>添加条码</button>
      </div>
    </div>
  );
}