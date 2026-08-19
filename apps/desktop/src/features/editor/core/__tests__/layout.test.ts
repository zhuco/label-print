import { describe, expect, it } from "vitest";

import {
  alignSelectedElements,
  buildSnapTargets,
  getElementBounds,
  scaleSelectedElements,
  selectElementsByRect,
  snapElementPosition,
} from "../layout";
import { createTextElement } from "../model";

describe("layout and snapping", () => {
  it("aligns selected elements to the left-most X", () => {
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

  it("snaps inside threshold range", () => {
    const moving = createTextElement({ id: "moving", xMm: 9.2, yMm: 8.7 });
    const stationary = createTextElement({ id: "base", xMm: 20, yMm: 8.8 });
    const targets = buildSnapTargets([stationary], { widthMm: 40, heightMm: 30 });

    const snapped = snapElementPosition(moving, targets, 1);

    expect(snapped.xMm).toBe(10);
    expect(snapped.yMm).toBe(8.8);
    expect(snapped.guides.length).toBeGreaterThan(0);
  });

  it("supports marquee rectangle selection for multi-select", () => {
    const first = createTextElement({ id: "first", xMm: 2, yMm: 2, widthMm: 6, heightMm: 4 });
    const second = createTextElement({ id: "second", xMm: 12, yMm: 3, widthMm: 6, heightMm: 4 });
    const third = createTextElement({ id: "third", xMm: 24, yMm: 2, widthMm: 6, heightMm: 4 });

    const selected = selectElementsByRect([first, second, third], {
      leftMm: 1,
      topMm: 1,
      rightMm: 20,
      bottomMm: 9,
    });

    expect(selected).toEqual(["first", "second"]);
  });

  it("scales a multi-element selection from a shared anchor", () => {
    const first = createTextElement({
      id: "first",
      xMm: 10,
      yMm: 10,
      widthMm: 20,
      heightMm: 6,
      textStyle: { fontSize: 4 },
    });
    const second = createTextElement({ id: "second", xMm: 40, yMm: 20, widthMm: 10, heightMm: 5 });
    const other = createTextElement({ id: "other", xMm: 2, yMm: 2 });

    const scaled = scaleSelectedElements(
      [first, second, other],
      ["first", "second"],
      { xMm: 10, yMm: 10 },
      0.5
    );

    expect(getElementBounds(scaled.filter((item) => item.id !== "other"))).toMatchObject({
      left: 10,
      top: 10,
      right: 30,
      bottom: 17.5,
    });
    expect(scaled.find((item) => item.id === "first")?.textStyle.fontSize).toBe(2);
    expect(scaled.find((item) => item.id === "other")?.xMm).toBe(2);
  });
});
