import { useMemo } from "react";

type QrcodePreviewProps = {
  value: string;
  className?: string;
};

const GRID = 21;

export function QrcodePreview({ value, className }: QrcodePreviewProps) {
  const matrix = useMemo(() => buildMatrix(value), [value]);

  return (
    <svg viewBox={`0 0 ${GRID} ${GRID}`} className={className} aria-hidden="true">
      <rect width={GRID} height={GRID} fill="#fff" />
      {matrix.map((row, y) =>
        row.map((cell, x) =>
          cell ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#111" /> : null
        )
      )}
    </svg>
  );
}

function buildMatrix(input: string): boolean[][] {
  const matrix = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => false));
  paintFinder(matrix, 0, 0);
  paintFinder(matrix, GRID - 7, 0);
  paintFinder(matrix, 0, GRID - 7);

  let seed = hash(input || "https://label.local");
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (isFinderArea(x, y)) {
        continue;
      }
      seed = (seed * 1664525 + 1013904223) >>> 0;
      matrix[y][x] = (seed & 3) !== 0;
    }
  }

  return matrix;
}

function paintFinder(matrix: boolean[][], x0: number, y0: number) {
  for (let y = y0; y < y0 + 7; y += 1) {
    for (let x = x0; x < x0 + 7; x += 1) {
      const border = x === x0 || x === x0 + 6 || y === y0 || y === y0 + 6;
      const center = x >= x0 + 2 && x <= x0 + 4 && y >= y0 + 2 && y <= y0 + 4;
      matrix[y][x] = border || center;
    }
  }
}

function isFinderArea(x: number, y: number): boolean {
  const leftTop = x <= 6 && y <= 6;
  const rightTop = x >= GRID - 7 && y <= 6;
  const leftBottom = x <= 6 && y >= GRID - 7;
  return leftTop || rightTop || leftBottom;
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
