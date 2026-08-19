import { useState } from "react";

export function CalibrationPage() {
  const [offsetX, setOffsetX] = useState("0");
  const [error, setError] = useState("");

  const save = () => {
    const value = Number(offsetX);
    if (Number.isNaN(value) || value < -10 || value > 10) {
      setError("X 偏移必须在 -10 到 10 毫米之间");
      return;
    }

    setError("");
  };

  return (
    <section className="panel">
      <h2>校准</h2>
      <label htmlFor="offset-x">X 偏移(mm)</label>
      <input
        id="offset-x"
        aria-label="X 偏移(mm)"
        value={offsetX}
        onChange={(event) => setOffsetX(event.target.value)}
      />
      <button type="button" onClick={save}>
        保存校准
      </button>
      {error && <p className="warning">{error}</p>}
    </section>
  );
}
