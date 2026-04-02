import { z, type ZodIssue } from 'zod';

const elementSchema = z.record(z.string(), z.unknown());

export const templateSchema = z.object({
  version: z.literal(2),
  unit: z.literal('mm'),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  elements: z.array(elementSchema).default([]),
});

export type TemplateSchemaType = z.infer<typeof templateSchema>;

export type TemplateValidationSuccess = {
  ok: true;
  value: TemplateSchemaType;
};

export type TemplateValidationFailure = {
  ok: false;
  issues: ZodIssue[];
};

export type TemplateValidationResult = TemplateValidationSuccess | TemplateValidationFailure;

export function validateTemplate(input: unknown): TemplateValidationResult {
  const parsed = templateSchema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issues: parsed.error.issues };
}

export type TemplateV2 = TemplateSchemaType;
