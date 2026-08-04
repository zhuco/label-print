import { describe, expect, it } from "vitest";

import { buildIndustryTemplateElements, getIndustryTemplate, INDUSTRY_TEMPLATES } from "../industry-templates";

describe("industry templates", () => {
  it("includes common templates such as food, apparel and logistics", () => {
    const ids = new Set(INDUSTRY_TEMPLATES.map((item) => item.id));
    expect(ids.has("food-label")).toBe(true);
    expect(ids.has("apparel-tag")).toBe(true);
    expect(ids.has("logistics-waybill")).toBe(true);
    expect(ids.has("food-info-nutrition-ddl")).toBe(true);
  });

  it("can build a ready-to-use element list from a template id", () => {
    const elements = buildIndustryTemplateElements(
      "food-label",
      {
        widthMm: 40,
        heightMm: 30,
      },
      (type) => `${type}-x`
    );
    expect(elements.length).toBeGreaterThanOrEqual(5);
    expect(elements.some((element) => element.type === "barcode")).toBe(true);
    expect(elements.some((element) => element.type === "qrcode")).toBe(true);
  });

  it("fits a template to the current canvas and keeps every item editable", () => {
    const labelSize = { widthMm: 25, heightMm: 20 };
    const elements = buildIndustryTemplateElements("asset-tag", labelSize, (type) => `${type}-fit`);

    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      expect(element.xMm).toBeGreaterThanOrEqual(0);
      expect(element.yMm).toBeGreaterThanOrEqual(0);
      expect(element.xMm + element.widthMm).toBeLessThanOrEqual(labelSize.widthMm);
      expect(element.yMm + element.heightMm).toBeLessThanOrEqual(labelSize.heightMm);
      expect(element.binding.mode).toBe("fixed");
    }
  });

  it("scales text together with the template when fitting a smaller canvas", () => {
    const large = buildIndustryTemplateElements(
      "food-label",
      { widthMm: 60, heightMm: 40 },
      (type) => `${type}-large`
    );
    const small = buildIndustryTemplateElements(
      "food-label",
      { widthMm: 30, heightMm: 20 },
      (type) => `${type}-small`
    );

    const largeText = large.filter((element) => element.type === "text" || element.type === "barcode");
    const smallText = small.filter((element) => element.type === "text" || element.type === "barcode");
    expect(smallText).toHaveLength(largeText.length);
    smallText.forEach((element, index) => {
      expect(Math.abs(element.textStyle.fontSize - largeText[index].textStyle.fontSize * 0.5)).toBeLessThanOrEqual(
        0.1
      );
    });
  });

  it("returns null for unknown template id", () => {
    expect(getIndustryTemplate("missing-template")).toBeNull();
  });

  it("builds a dual-panel food template from ddl source layout", () => {
    const elements = buildIndustryTemplateElements(
      "food-info-nutrition-ddl",
      {
        widthMm: 60,
        heightMm: 40,
      },
      (type) => `${type}-ddl`
    );

    expect(elements.length).toBeGreaterThanOrEqual(4);
    expect(elements.some((element) => element.type === "shape")).toBe(true);
    expect(
      elements.some(
        (element) =>
          element.type === "text" &&
          element.binding.mode === "fixed" &&
          element.binding.fixedValue?.includes("营养成分表")
      )
    ).toBe(true);
    expect(
      elements.some(
        (element) =>
          element.type === "text" &&
          element.binding.mode === "fixed" &&
          element.binding.fixedValue?.includes("品名:芝麻花生牛皮糖")
      )
    ).toBe(true);
  });
});
