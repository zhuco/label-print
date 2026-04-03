import { describe, expect, it } from "vitest";

import {
  alignSelectedElements,
  buildSnapTargets,
  snapElementPosition,
} from "../layout";
import { createTextElement } from "../model";

describe("布局与吸附", () => {
  it("应将多选元素左对齐到最小 X", () => {
    const left = createTextElement({ id: "left", xMm: 5, yMm: 4 });
    const right = createTextElement({ id: "right", xMm: 17, yMm: 10 });
    const unchanged = createTextElement({ id: "other", xMm: 30, yMm: 3 });

    const aligned = alignSelectedElements(
      [left, right, unchanged],
      ["left", "right"],
      "left"
    );

    expect(aligned.find((item) => item.id === "left")?.xMm).toBe(5);
    expect(aligned.find((item) => item.id === "right")?.xMm).toBe(5);
    expect(aligned.find((item) => item.id === "other")?.xMm).toBe(30);
  });

  it("应在阈值范围内吸附到目标线", () => {
    const moving = createTextElement({ id: "moving", xMm: 9.2, yMm: 8.7 });
    const stationary = createTextElement({ id: "base", xMm: 20, yMm: 8.8 });
    const targets = buildSnapTargets([stationary], { widthMm: 40, heightMm: 30 });

    const snapped = snapElementPosition(moving, targets, 1);

    expect(snapped.xMm).toBe(10);
    expect(snapped.yMm).toBe(8.8);
    expect(snapped.guides.length).toBeGreaterThan(0);
  });
});

