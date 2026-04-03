import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalibrationPage } from "../CalibrationPage";

describe("Calibration form", () => {
  it("validates x offset range", () => {
    render(<CalibrationPage />);

    const input = screen.getByLabelText("X 偏移(mm)");
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "保存校准" }));

    expect(screen.getByText("X 偏移必须在 -10 到 10 毫米之间")).toBeInTheDocument();
  });
});
