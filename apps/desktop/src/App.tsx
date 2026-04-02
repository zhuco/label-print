import { useState } from "react";

import { CalibrationPage } from "./features/calibration/CalibrationPage";
import { EditorPage } from "./features/editor/EditorPage";
import { JobLogsPage } from "./features/logs/JobLogsPage";

const mockLogs = [
  { id: 101, status: "success", templateName: "商品标签" },
  { id: 102, status: "failed", templateName: "物流箱码" },
];

export default function App() {
  const [active, setActive] = useState<"editor" | "calibration" | "logs">("editor");

  return (
    <main className="app-shell">
      <h1>标签编辑打印</h1>
      <div className="toolbar" role="tablist" aria-label="主导航">
        <button type="button" onClick={() => setActive("editor")}>编辑器</button>
        <button type="button" onClick={() => setActive("calibration")}>校准</button>
        <button type="button" onClick={() => setActive("logs")}>日志</button>
      </div>

      {active === "editor" && <EditorPage />}
      {active === "calibration" && <CalibrationPage />}
      {active === "logs" && <JobLogsPage records={mockLogs} />}
    </main>
  );
}