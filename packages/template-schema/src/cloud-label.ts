import { z, type ZodType } from 'zod';

/** The document format identifier persisted in cloud JSONB columns. */
export const CLOUD_LABEL_DOCUMENT_FORMAT = 'label-print-cloud-document' as const;

/**
 * The element shape shared with cloud documents.
 *
 * This deliberately models only the editor data persisted in a cloud document.
 * It has no dependency on desktop runtime types, printer APIs, or UI state. New
 * element-specific fields are preserved by the schema for forward compatibility.
 */
export type CloudEditorElement = {
  id: string;
  type: 'text' | 'barcode' | 'image' | 'qrcode' | 'shape' | 'icon';
  name: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  groupId?: string;
  presetInstanceId?: string;
  sourcePresetId?: string;
  binding: CloudContentBinding;
  textStyle: CloudTextStyle;
  barcode?: CloudBarcodeConfig;
  [key: string]: unknown;
};

/**
 * Structural form intentionally compatible with the desktop editor's existing
 * ContentBinding type. Runtime schema validation still requires a column or
 * expression when its corresponding mode is selected.
 */
export type CloudContentBinding = {
  mode: 'fixed' | 'column' | 'expression' | 'datetime';
  fixedValue?: string;
  column?: string;
  expression?: string;
  dateTimeSource?: 'fixed' | 'printTime';
  dateTimeFormat?: string;
  [key: string]: unknown;
};

export type CloudTextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  color: string;
  letterSpacing: number;
  lineHeight: number;
  [key: string]: unknown;
};

export type CloudBarcodeConfig = {
  symbology: string;
  moduleWidth: number;
  textPosition: 'none' | 'top' | 'bottom';
  textGap: number;
  quietZone: number;
  checksumEnabled: boolean;
  minHeight: number;
  direction: 'normal' | 'rotate90' | 'rotate180' | 'rotate270';
  [key: string]: unknown;
};

const finiteNumber = z.number().finite();
const positiveFiniteNumber = finiteNumber.positive();

const contentBindingSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('fixed'),
      fixedValue: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      mode: z.literal('column'),
      column: z.string().min(1),
    })
    .passthrough(),
  z
    .object({
      mode: z.literal('expression'),
      expression: z.string().min(1),
    })
    .passthrough(),
  z
    .object({
      mode: z.literal('datetime'),
      dateTimeSource: z.enum(['fixed', 'printTime']).optional(),
      dateTimeFormat: z.string().min(1).optional(),
      fixedValue: z.string().optional(),
    })
    .passthrough(),
]);

const textStyleSchema = z
  .object({
    fontFamily: z.string().min(1),
    fontSize: positiveFiniteNumber,
    fontWeight: finiteNumber,
    italic: z.boolean(),
    underline: z.boolean(),
    align: z.enum(['left', 'center', 'right']),
    color: z.string().min(1),
    letterSpacing: finiteNumber,
    lineHeight: positiveFiniteNumber,
  })
  .passthrough();

const barcodeConfigSchema = z
  .object({
    symbology: z.string().min(1),
    moduleWidth: positiveFiniteNumber,
    textPosition: z.enum(['none', 'top', 'bottom']),
    textGap: finiteNumber,
    quietZone: finiteNumber.min(0),
    checksumEnabled: z.boolean(),
    minHeight: positiveFiniteNumber,
    direction: z.enum(['normal', 'rotate90', 'rotate180', 'rotate270']),
  })
  .passthrough();

const baseElementSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['text', 'barcode', 'image', 'qrcode', 'shape', 'icon']),
    name: z.string(),
    xMm: finiteNumber,
    yMm: finiteNumber,
    widthMm: positiveFiniteNumber,
    heightMm: positiveFiniteNumber,
    rotation: finiteNumber,
    groupId: z.string().min(1).optional(),
    presetInstanceId: z.string().min(1).optional(),
    sourcePresetId: z.string().min(1).optional(),
    binding: contentBindingSchema,
    textStyle: textStyleSchema,
  })
  .passthrough();

const nonBarcodeElementSchema = baseElementSchema.refine((element) => element.type !== 'barcode', {
  message: 'Barcode configuration is required for barcode elements.',
  path: ['type'],
});

const barcodeElementSchema = baseElementSchema
  .extend({
    type: z.literal('barcode'),
    barcode: barcodeConfigSchema,
  })
  .passthrough();

export const cloudEditorElementSchema: ZodType<CloudEditorElement> = z.union([
  barcodeElementSchema,
  nonBarcodeElementSchema,
]) as ZodType<CloudEditorElement>;

export const cloudLabelContentV1Schema = z
  .object({
    format: z.literal(CLOUD_LABEL_DOCUMENT_FORMAT),
    version: z.literal(1),
    unit: z.literal('mm'),
    canvas: z.object({
      widthMm: positiveFiniteNumber,
      heightMm: positiveFiniteNumber,
    }),
    elements: z.array(cloudEditorElementSchema),
  })
  .strict();

export type CloudLabelContentV1 = z.infer<typeof cloudLabelContentV1Schema>;

/** The currently supported cloud content version. */
export type CloudLabelContent = CloudLabelContentV1;

export type CloudLabelParseResult =
  | { ok: true; value: CloudLabelContentV1 }
  | { ok: false; issues: z.core.$ZodIssue[] };

/**
 * Validates already-migrated cloud content without throwing.
 * Use parseCloudLabelContent for the normal read path, which also checks version.
 */
export function validateCloudLabelContent(input: unknown): CloudLabelParseResult {
  const parsed = cloudLabelContentV1Schema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issues: parsed.error.issues };
}
