import { describe, expect, it } from "vitest";

import { buildIndustryTemplateElements, getIndustryTemplate, INDUSTRY_TEMPLATES } from "../industry-templates";

describe("industry templates", () => {
  it("includes common templates such as food, apparel and logistics", () => {
    const ids = new Set(INDUSTRY_TEMPLATES.map((item) => item.id));
    expect(ids.has("food-label")).toBe(true);
    expect(ids.has("apparel-tag")).toBe(true);
    expect(ids.has("logistics-waybill")).toBe(true);
    expect(ids.has("retail-price")).toBe(true);
    expect(ids.has("food-info-nutrition-ddl")).toBe(false);
    expect(ids.has("medical-tag")).toBe(false);
    expect(ids.has("asset-tag")).toBe(false);
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
    const elements = buildIndustryTemplateElements("retail-price", labelSize, (type) => `${type}-fit`);

    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      expect(element.xMm).toBeGreaterThanOrEqual(0);
      expect(element.yMm).toBeGreaterThanOrEqual(0);
      expect(element.xMm + element.widthMm).toBeLessThanOrEqual(labelSize.widthMm);
      expect(element.yMm + element.heightMm).toBeLessThanOrEqual(labelSize.heightMm);
      expect(element.binding.mode).toBe("fixed");
    }
  });

  it("applies a template shape color to its actual stroke and fill", () => {
    const elements = buildIndustryTemplateElements("retail-price", { widthMm: 60, heightMm: 40 }, (type) => `${type}-color`);
    const shape = elements.find((element) => element.type === "shape");

    expect(shape?.textStyle.color).toBe("#2a6fa8");
    expect(shape?.textStyle.strokeColor).toBe("#2a6fa8");
    expect(shape?.textStyle.fillColor).toBe("#2a6fa8");
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

  it("does not expose paid template identifiers to the offline builder", () => {
    expect(buildIndustryTemplateElements("food-info-nutrition-ddl", { widthMm: 60, heightMm: 40 }, () => "blocked")).toEqual([]);
    expect(buildIndustryTemplateElements("medical-tag", { widthMm: 60, heightMm: 40 }, () => "blocked")).toEqual([]);
    expect(buildIndustryTemplateElements("asset-tag", { widthMm: 60, heightMm: 40 }, () => "blocked")).toEqual([]);
  });
});
