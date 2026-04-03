import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "../../../App";

describe("Editor page shell", () => {
  it("renders command bar and tab actions", () => {
    const { container } = render(<App />);
    const newTabButton = container.querySelector<HTMLButtonElement>(".new-tab");
    expect(newTabButton).not.toBeNull();
    fireEvent.click(newTabButton!);

    const confirmButton = container.querySelector<HTMLButtonElement>(".new-label-modal .primary");
    expect(confirmButton).not.toBeNull();
    fireEvent.click(confirmButton!);

    expect(screen.getByRole("button", { name: "打印" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ 新建标签" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle wrap mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左对齐" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "居中对齐" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "右对齐" })).toBeInTheDocument();
  });
});
