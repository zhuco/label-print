import { describe, expect, it } from 'vitest';
import { migrateTemplate } from '../migrate';

const pxTemplate = {
  version: 1,
  unit: 'px',
  widthPx: 200,
  heightPx: 150,
  elements: [{ id: 'a', type: 'text' }],
};

describe('migrateTemplate', () => {
  it('upgrades px-based templates to mm version 2', () => {
    const result = migrateTemplate(pxTemplate as any);
    expect(result.version).toBe(2);
    expect(result.unit).toBe('mm');
    expect(result.widthMm).toBeCloseTo(200 * 0.2645833333, 6);
    expect(result.heightMm).toBeCloseTo(150 * 0.2645833333, 6);
    expect(result.elements).toEqual(pxTemplate.elements);
  });
});
