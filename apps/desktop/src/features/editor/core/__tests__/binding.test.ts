import { describe, expect, it } from "vitest";

import { createDefaultBinding, resolveBindingValue, type ContentBinding } from "../binding";

describe("binding helpers", () => {
  it("returns fixed value in fixed mode", () => {
    const binding: ContentBinding = {
      mode: "fixed",
      fixedValue: "草莓香米通米泡饼",
    };

    const value = resolveBindingValue(binding, { sku: "A-1" });
    expect(value).toBe("草莓香米通米泡饼");
  });

  it("returns column value in column mode", () => {
    const binding: ContentBinding = {
      mode: "column",
      column: "sku",
    };

    const value = resolveBindingValue(binding, { sku: "6252277" });
    expect(value).toBe("6252277");
  });

  it("renders template expression in expression mode", () => {
    const binding: ContentBinding = {
      mode: "expression",
      expression: "${sku}-${batch}",
    };

    const value = resolveBindingValue(binding, { sku: "A01", batch: "B2026" });
    expect(value).toBe("A01-B2026");
  });

  it("formats a fixed date time and can hide its time portion", () => {
    const binding: ContentBinding = {
      mode: "datetime",
      dateTimeSource: "fixed",
      fixedValue: "2026-08-08T09:05:04",
      dateTimeFormat: "YYYY-MM-DD",
    };

    expect(resolveBindingValue(binding, {})).toBe("2026-08-08");
  });

  it("uses the supplied print timestamp for every dynamic date time resolution", () => {
    const binding: ContentBinding = {
      mode: "datetime",
      dateTimeSource: "printTime",
      dateTimeFormat: "YYYY-MM-DD HH:mm:ss",
    };
    const now = new Date(2026, 7, 8, 9, 5, 4);

    expect(resolveBindingValue(binding, {}, { now })).toBe("2026-08-08 09:05:04");
  });

  it("defaults to fixed tip text", () => {
    const binding = createDefaultBinding();
    expect(binding).toEqual({ mode: "fixed", fixedValue: "双击编辑" });
  });
});
