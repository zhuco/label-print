import type {
  AlignMode,
  EditorElement,
  LabelSize,
  SnapGuide,
  SnapResult,
} from "./types";

export type SnapTargets = {
  x: number[];
  y: number[];
};

export type SelectionRectMm = {
  leftMm: number;
  topMm: number;
  rightMm: number;
  bottomMm: number;
};

export type ElementBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export function buildSnapTargets(elements: EditorElement[], labelSize: LabelSize): SnapTargets {
  const xTargets = new Set<number>([0, labelSize.widthMm / 2, labelSize.widthMm]);
  const yTargets = new Set<number>([0, labelSize.heightMm / 2, labelSize.heightMm]);

  for (let value = 5; value < labelSize.widthMm; value += 5) {
    xTargets.add(value);
  }
  for (let value = 5; value < labelSize.heightMm; value += 5) {
    yTargets.add(value);
  }

  for (const element of elements) {
    xTargets.add(element.xMm);
    xTargets.add(element.xMm + element.widthMm / 2);
    xTargets.add(element.xMm + element.widthMm);

    yTargets.add(element.yMm);
    yTargets.add(element.yMm + element.heightMm / 2);
    yTargets.add(element.yMm + element.heightMm);
  }

  return {
    x: [...xTargets].sort((a, b) => a - b),
    y: [...yTargets].sort((a, b) => a - b),
  };
}

export function snapElementPosition(
  moving: EditorElement,
  targets: SnapTargets,
  thresholdMm = 0.8
): SnapResult {
  const xDecision = findNearestSnap(
    [
      { from: moving.xMm, resolve: (target: number) => target },
      { from: moving.xMm + moving.widthMm / 2, resolve: (target: number) => target - moving.widthMm / 2 },
      { from: moving.xMm + moving.widthMm, resolve: (target: number) => target - moving.widthMm },
    ],
    targets.x,
    thresholdMm
  );

  const yDecision = findNearestSnap(
    [
      { from: moving.yMm, resolve: (target: number) => target },
      { from: moving.yMm + moving.heightMm / 2, resolve: (target: number) => target - moving.heightMm / 2 },
      { from: moving.yMm + moving.heightMm, resolve: (target: number) => target - moving.heightMm },
    ],
    targets.y,
    thresholdMm
  );

  const guides: SnapGuide[] = [];
  if (xDecision) {
    guides.push({ axis: "x", value: xDecision.target });
  }
  if (yDecision) {
    guides.push({ axis: "y", value: yDecision.target });
  }

  return {
    xMm: xDecision ? xDecision.nextValue : moving.xMm,
    yMm: yDecision ? yDecision.nextValue : moving.yMm,
    guides,
  };
}

export function alignSelectedElements(
  elements: EditorElement[],
  selectedIds: string[],
  mode: AlignMode
): EditorElement[] {
  const selectedIdSet = new Set(selectedIds);
  const selected = elements.filter((element) => selectedIdSet.has(element.id));
  if (selected.length <= 1) {
    return elements;
  }

  const bounds = getElementBounds(selected);
  if (!bounds) {
    return elements;
  }

  return elements.map((element) => {
    if (!selectedIdSet.has(element.id)) {
      return element;
    }

    if (mode === "left") {
      return { ...element, xMm: bounds.left };
    }
    if (mode === "center") {
      return {
        ...element,
        xMm: bounds.left + bounds.width / 2 - element.widthMm / 2,
      };
    }
    if (mode === "right") {
      return { ...element, xMm: bounds.right - element.widthMm };
    }
    if (mode === "top") {
      return { ...element, yMm: bounds.top };
    }
    if (mode === "middle") {
      return {
        ...element,
        yMm: bounds.top + bounds.height / 2 - element.heightMm / 2,
      };
    }
    return { ...element, yMm: bounds.bottom - element.heightMm };
  });
}

export function getElementBounds(elements: EditorElement[]): ElementBounds | null {
  if (elements.length === 0) {
    return null;
  }

  const left = Math.min(...elements.map((item) => item.xMm));
  const top = Math.min(...elements.map((item) => item.yMm));
  const right = Math.max(...elements.map((item) => item.xMm + item.widthMm));
  const bottom = Math.max(...elements.map((item) => item.yMm + item.heightMm));

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function scaleSelectedElements(
  elements: EditorElement[],
  selectedIds: string[],
  anchor: { xMm: number; yMm: number },
  scale: number
): EditorElement[] {
  if (!Number.isFinite(scale) || scale <= 0) {
    return elements;
  }

  const selectedIdSet = new Set(selectedIds);
  return elements.map((element) => {
    if (!selectedIdSet.has(element.id)) {
      return element;
    }

    const scaled = {
      ...element,
      xMm: round1(anchor.xMm + (element.xMm - anchor.xMm) * scale),
      yMm: round1(anchor.yMm + (element.yMm - anchor.yMm) * scale),
      widthMm: round1(element.widthMm * scale),
      heightMm: round1(element.heightMm * scale),
      textStyle: {
        ...element.textStyle,
        fontSize: round1(Math.max(0.1, element.textStyle.fontSize * scale)),
        letterSpacing: round1(element.textStyle.letterSpacing * scale),
        strokeWidth:
          element.textStyle.strokeWidth === undefined
            ? undefined
            : round1(Math.max(0, element.textStyle.strokeWidth * scale)),
        strokeDashOffset:
          element.textStyle.strokeDashOffset === undefined
            ? undefined
            : round1(element.textStyle.strokeDashOffset * scale),
      },
    };

    if (scaled.type !== "barcode") {
      return scaled;
    }

    return {
      ...scaled,
      barcode: {
        ...scaled.barcode,
        moduleWidth: round2(Math.max(0.1, scaled.barcode.moduleWidth * scale)),
        textGap: round1(Math.max(0, scaled.barcode.textGap * scale)),
        quietZone: round1(Math.max(0, scaled.barcode.quietZone * scale)),
        minHeight: round1(Math.max(3, scaled.barcode.minHeight * scale)),
      },
    };
  });
}

export function selectElementsByRect(elements: EditorElement[], rect: SelectionRectMm): string[] {
  const left = Math.min(rect.leftMm, rect.rightMm);
  const right = Math.max(rect.leftMm, rect.rightMm);
  const top = Math.min(rect.topMm, rect.bottomMm);
  const bottom = Math.max(rect.topMm, rect.bottomMm);

  return elements
    .filter((element) => {
      const elementLeft = element.xMm;
      const elementRight = element.xMm + element.widthMm;
      const elementTop = element.yMm;
      const elementBottom = element.yMm + element.heightMm;
      return left <= elementRight && right >= elementLeft && top <= elementBottom && bottom >= elementTop;
    })
    .map((element) => element.id);
}

type SnapAnchor = {
  from: number;
  resolve: (target: number) => number;
};

type SnapDecision = {
  target: number;
  distance: number;
  nextValue: number;
};

function findNearestSnap(
  anchors: SnapAnchor[],
  targets: number[],
  thresholdMm: number
): SnapDecision | null {
  let best: SnapDecision | null = null;

  for (const anchor of anchors) {
    for (const target of targets) {
      const distance = Math.abs(anchor.from - target);
      if (distance > thresholdMm) {
        continue;
      }
      if (!best || distance < best.distance) {
        best = {
          target,
          distance,
          nextValue: anchor.resolve(target),
        };
      }
    }
  }

  return best;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
