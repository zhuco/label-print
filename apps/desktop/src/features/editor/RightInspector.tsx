import type { EditorElement } from "./editor.store";

type RightInspectorProps = {
  selected: EditorElement | null;
};

export function RightInspector({ selected }: RightInspectorProps) {
  return (
    <div>
      <h2>属性</h2>
      {selected ? (
        <p>当前选择: {selected.label}</p>
      ) : (
        <p className="muted">请选择画布元素查看属性</p>
      )}
    </div>
  );
}