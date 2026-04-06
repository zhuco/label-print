import { describe, expect, it } from "vitest";

import { buildRulerTicks, isMajorRulerTick, shouldShowRulerLabel } from "../ruler";

describe("ruler ticks", () => {
  it("builds 1mm ticks for integer lengths", () => {
    expect(buildRulerTicks(5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(buildRulerTicks(12)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("always includes the exact end boundary when length has decimals", () => {
    expect(buildRulerTicks(12.4)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12.4,
    ]);
  });

  it("marks major ticks and label ticks with sparse intervals", () => {
    expect(isMajorRulerTick(5)).toBe(true);
    expect(isMajorRulerTick(6)).toBe(false);
    expect(shouldShowRulerLabel(10, 32)).toBe(true);
    expect(shouldShowRulerLabel(12, 32)).toBe(false);
    expect(shouldShowRulerLabel(32, 32)).toBe(true);
  });
});
