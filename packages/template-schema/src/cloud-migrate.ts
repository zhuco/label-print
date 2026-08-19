import {
  CLOUD_LABEL_DOCUMENT_FORMAT,
  cloudLabelContentV1Schema,
  type CloudLabelContentV1,
} from './cloud-label';

export type CloudLabelMigrationErrorCode =
  | 'INVALID_DOCUMENT_FORMAT'
  | 'UNSUPPORTED_DOCUMENT_VERSION';

/** Error raised before schema validation when a document cannot be migrated. */
export class CloudLabelMigrationError extends Error {
  readonly name = 'CloudLabelMigrationError';

  constructor(
    readonly code: CloudLabelMigrationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function getRecord(input: unknown): Record<string, unknown> | null {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

/**
 * Migrates a known cloud document to the newest supported shape.
 *
 * Version 1 is the first published cloud format, so its migration is an
 * identity operation. Keeping this function as the only migration entry point
 * lets a later version add explicit stepwise migrations without callers
 * bypassing version checks.
 */
export function migrateCloudLabelContent(input: unknown): CloudLabelContentV1 {
  const document = getRecord(input);
  if (!document || document.format !== CLOUD_LABEL_DOCUMENT_FORMAT) {
    throw new CloudLabelMigrationError(
      'INVALID_DOCUMENT_FORMAT',
      `Expected cloud document format "${CLOUD_LABEL_DOCUMENT_FORMAT}".`,
    );
  }

  if (document.version !== 1) {
    throw new CloudLabelMigrationError(
      'UNSUPPORTED_DOCUMENT_VERSION',
      `Cloud document version ${String(document.version)} is not supported.`,
    );
  }

  return cloudLabelContentV1Schema.parse(document);
}

/** Validates, migrates, and returns the current cloud content format. */
export function parseCloudLabelContent(input: unknown): CloudLabelContentV1 {
  return migrateCloudLabelContent(input);
}
