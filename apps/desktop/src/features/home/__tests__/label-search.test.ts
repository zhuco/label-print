import { describe, expect, it } from "vitest";

import { matchesLabelSearch } from "../label-search";

describe("matchesLabelSearch", () => {
  it("matches Chinese label names by full pinyin and initials", () => {
    expect(matchesLabelSearch("货架标签", "huojia")).toBe(true);
    expect(matchesLabelSearch("货架标签", "huo jia")).toBe(true);
    expect(matchesLabelSearch("货架标签", "hjbq")).toBe(true);
  });

  it("keeps matching the original name case-insensitively", () => {
    expect(matchesLabelSearch("A-01货架", "a-01")).toBe(true);
    expect(matchesLabelSearch("A-01货架", "不存在")).toBe(false);
  });
});
