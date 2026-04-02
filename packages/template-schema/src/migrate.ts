import type { TemplateV2 } from './schema';

const PX_TO_MM = 0.2645833333;

type LegacyTemplateV1 = {
  version: 1;
  unit: 'px';
  widthPx: number;
  heightPx: number;
  elements?: unknown[];
};

function isLegacyTemplate(value: unknown): value is LegacyTemplateV1 {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as LegacyTemplateV1).version === 1 &&
    (value as LegacyTemplateV1).unit === 'px' &&
    typeof (value as LegacyTemplateV1).widthPx === 'number' &&
    typeof (value as LegacyTemplateV1).heightPx === 'number'
  );
}

function ensureElements(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
  );
}

export function migrateTemplate(value: unknown): TemplateV2 {
  if (isLegacyTemplate(value)) {
    const { widthPx, heightPx, elements } = value;
    return {
      version: 2,
      unit: 'mm',
      widthMm: widthPx * PX_TO_MM,
      heightMm: heightPx * PX_TO_MM,
      elements: ensureElements(elements),
    };
  }

  if (typeof value === 'object' && value !== null) {
    return value as TemplateV2;
  }

  throw new Error('Unsupported template payload');
}
