import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FieldMappingTable } from "../FieldMappingTable";

describe("Field mapping flow", () => {
  it("shows missing column warning", () => {
    render(<FieldMappingTable columns={["sku"]} missingColumns={["price"]} />);

    expect(screen.getByText("缺失字段: price")).toBeInTheDocument();
  });
});
