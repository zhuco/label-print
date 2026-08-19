import { describe, expect, it } from "vitest";

import { buildFontOptions, withCurrentFont } from "../font-options";

describe("font options", () => {
  it("uses Chinese label when aliases include Chinese names", () => {
    const options = buildFontOptions(
      [
        {
          family: "Microsoft YaHei",
          aliases: ["Microsoft YaHei", "微软雅黑"],
          postscriptName: "MicrosoftYaHei",
        },
      ],
      []
    );

    const yahei = options.find((font) => font.value === "Microsoft YaHei");
    expect(yahei?.label).toBe("微软雅黑");
  });

  it("returns fallback fonts when no system fonts are available", () => {
    const options = buildFontOptions([], []);
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((font) => font.value === "Microsoft YaHei")).toBe(true);
  });

  it("keeps current font visible even when not in list", () => {
    const options = withCurrentFont([{ value: "Arial", label: "Arial" }], "示例字体");
    expect(options[0]).toEqual({ value: "示例字体", label: "示例字体" });
  });
});
