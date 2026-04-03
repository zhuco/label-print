import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "../../../App";

describe("Editor page shell", () => {
  it("renders command bar and tab actions", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "打印" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ 新建标签" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle wrap mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左对齐" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "居中对齐" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "右对齐" })).toBeInTheDocument();
  });
});
