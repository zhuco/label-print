import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobLogsPage } from "../JobLogsPage";

describe("Job logs page", () => {
  it("filters failed jobs", () => {
    render(
      <JobLogsPage
        records={[
          { id: 1, status: "success", templateName: "A" },
          { id: 2, status: "failed", templateName: "B" },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText("状态筛选"), { target: { value: "failed" } });
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryByText("A")).not.toBeInTheDocument();
  });
});
