import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PrintPanel } from "../PrintPanel";

describe("Queue controls", () => {
  it("calls pause action from control button", () => {
    const mockPause = vi.fn();

    render(
      <PrintPanel
        jobs={[{ id: 1, status: "running", totalItems: 20 }]}
        onPause={mockPause}
        onResume={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    expect(mockPause).toHaveBeenCalledOnce();
  });
});
