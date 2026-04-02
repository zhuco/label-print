import type { EditorElement } from "./editor.store";

type CanvasStageProps = {
  elements: EditorElement[];
};

export function CanvasStage({ elements }: CanvasStageProps) {
  return (
    <div className="canvas" aria-label="标签画布">
      <h3>画布</h3>
      <p className="muted">元素数量: {elements.length}</p>
      <ul>
        {elements.map((element) => (
          <li key={element.id}>{element.label}</li>
        ))}
      </ul>
    </div>
  );
}