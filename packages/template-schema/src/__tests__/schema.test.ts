import { describe, expect, it } from 'vitest';
import { validateTemplate } from '../schema';

const base = { version: 2, unit: 'mm', elements: [] };

describe('validateTemplate', () => {
  it('rejects non-positive width or height', () => {
    const zeroWidth = validateTemplate({ ...base, widthMm: 0, heightMm: 30 });
    expect(zeroWidth.ok).toBe(false);

    const negativeHeight = validateTemplate({ ...base, widthMm: 30, heightMm: -1 });
    expect(negativeHeight.ok).toBe(false);
  });

  it('accepts templates with positive dimensions', () => {
    const result = validateTemplate({ ...base, widthMm: 120, heightMm: 90 });
    expect(result.ok).toBe(true);
  });
});
