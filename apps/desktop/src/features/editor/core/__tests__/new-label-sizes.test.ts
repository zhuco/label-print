import { describe, expect, it } from "vitest";

import { COMMON_LABEL_SIZES } from "../new-label-sizes";

describe("COMMON_LABEL_SIZES", () => {
  it("starts with 40x30 and provides dozens of presets", () => {
    expect(COMMON_LABEL_SIZES.length).toBeGreaterThanOrEqual(30);
    expect(COMMON_LABEL_SIZES[0]).toEqual({
      label: "40×30",
      widthMm: 40,
      heightMm: 30,
    });
  });
});
