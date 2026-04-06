const EPSILON = 1e-6;
const ROUND_FACTOR = 1000;

const DEFAULT_MINOR_STEP_MM = 1;
const DEFAULT_MAJOR_INTERVAL_MM = 5;
const DEFAULT_LABEL_INTERVAL_MM = 10;

export function buildRulerTicks(lengthMm: number, stepMm = DEFAULT_MINOR_STEP_MM): number[] {
  if (!Number.isFinite(lengthMm) || lengthMm <= 0) {
    return [0];
  }

  const safeStep = stepMm > EPSILON ? stepMm : DEFAULT_MINOR_STEP_MM;
  const safeLength = Math.max(0, lengthMm);
  const output: number[] = [0];
  const fullStepCount = Math.floor((safeLength + EPSILON) / safeStep);

  for (let index = 1; index <= fullStepCount; index += 1) {
    output.push(roundTick(index * safeStep));
  }

  const lastValue = output[output.length - 1] ?? 0;
  if (!isApproxEqual(lastValue, safeLength)) {
    output.push(roundTick(safeLength));
  }

  return output;
}

export function isMajorRulerTick(tickMm: number, intervalMm = DEFAULT_MAJOR_INTERVAL_MM): boolean {
  return isApproxMultiple(tickMm, intervalMm);
}

export function shouldShowRulerLabel(
  tickMm: number,
  lengthMm: number,
  intervalMm = DEFAULT_LABEL_INTERVAL_MM
): boolean {
  if (isApproxEqual(tickMm, lengthMm)) {
    return true;
  }
  return isApproxMultiple(tickMm, intervalMm);
}

function isApproxEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON;
}

function isApproxMultiple(value: number, interval: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(interval) || interval <= EPSILON) {
    return false;
  }
  const normalizedValue = Math.abs(value);
  const remainder = normalizedValue % interval;
  return remainder <= EPSILON || interval - remainder <= EPSILON;
}

function roundTick(value: number): number {
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
}
