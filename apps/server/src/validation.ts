import { badRequest, unprocessable } from "./errors.js";
import {
  CloudLabelMigrationError,
  parseCloudLabelContent as parseTemplateSchemaContent,
} from "@label/template-schema";
import type { CloudLabelContentV1 } from "./types.js";

const MAX_ELEMENTS = 500;
const MAX_DEPTH = 20;
const FORBIDDEN_CONTENT_KEYS = new Set([
  "printerId",
  "printerName",
  "printer",
  "calibrationOffset",
  "calibrationScale",
  "printCopies",
  "selectedElementId",
  "undoStack",
  "redoStack",
  "editorTabState",
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function assertSafeTree(value: unknown, depth = 0): void {
  if (depth > MAX_DEPTH) throw badRequest("INVALID_LABEL_CONTENT", "Label content is nested too deeply.");
  if (Array.isArray(value)) {
    for (const item of value) assertSafeTree(item, depth + 1);
    return;
  }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_CONTENT_KEYS.has(key)) {
        throw badRequest("INVALID_LABEL_CONTENT", `Cloud label content must not contain ${key}.`);
      }
      assertSafeTree(item, depth + 1);
    }
  }
}

export function parseCloudLabelContent(input: unknown): CloudLabelContentV1 {
  if (!isObject(input)) throw badRequest("INVALID_LABEL_CONTENT", "Label content must be an object.");
  if (input.format !== "label-print-cloud-document") {
    throw badRequest("INVALID_LABEL_CONTENT", "Label content format is invalid.");
  }
  if (typeof input.version !== "number" || !Number.isInteger(input.version)) {
    throw badRequest("INVALID_LABEL_CONTENT", "Document version is invalid.");
  }
  if (input.version !== 1) {
    throw unprocessable("UNSUPPORTED_DOCUMENT_VERSION", "This document version is not supported.");
  }
  if (!Array.isArray(input.elements) || input.elements.length > MAX_ELEMENTS || !input.elements.every(isObject)) {
    throw badRequest("INVALID_LABEL_CONTENT", "Elements must be an array of at most 500 objects.");
  }
  let content: CloudLabelContentV1;
  try {
    // The shared schema is the single source of truth for editor-compatible content.
    content = parseTemplateSchemaContent(input);
  } catch (error) {
    if (error instanceof CloudLabelMigrationError && error.code === "UNSUPPORTED_DOCUMENT_VERSION") {
      throw unprocessable("UNSUPPORTED_DOCUMENT_VERSION", "This document version is not supported.");
    }
    throw badRequest("INVALID_LABEL_CONTENT", "Label content does not match the supported document schema.");
  }
  if (content.canvas.widthMm > 1_000 || content.canvas.heightMm > 1_000) {
    throw badRequest("INVALID_LABEL_CONTENT", "Canvas dimensions exceed the server safety limit.");
  }
  assertSafeTree(input);
  return content;
}

/** Collects only genuine asset references, without treating arbitrary text as an asset. */
export function collectAssetReferences(content: CloudLabelContentV1): Set<string> {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const matched = /^asset:\/\/([0-9a-f]{8}-[0-9a-f-]{27,})$/i.exec(value);
      if (matched) found.add(matched[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (isObject(value)) Object.values(value).forEach(visit);
  };
  visit(content.elements);
  return found;
}

export function requireName(value: unknown): string {
  if (typeof value !== "string") throw badRequest("INVALID_LABEL_NAME", "Label name is required.");
  const name = value.trim();
  if (!name || name.length > 120) throw badRequest("INVALID_LABEL_NAME", "Label name must contain 1 to 120 characters.");
  return name;
}

export function requireCategoryName(value: unknown): string {
  if (typeof value !== "string") throw badRequest("INVALID_CATEGORY_NAME", "Category name is required.");
  const name = value.trim();
  if (!name || name.length > 40) throw badRequest("INVALID_CATEGORY_NAME", "Category name must contain 1 to 40 characters.");
  return name;
}

export function requireEmail(value: unknown): string {
  if (typeof value !== "string" || value.length > 320) throw badRequest("INVALID_EMAIL", "A valid email is required.");
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("INVALID_EMAIL", "A valid email is required.");
  return email;
}

export function requirePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 10 || value.length > 256) {
    throw badRequest("INVALID_PASSWORD", "Password must contain 10 to 256 characters.");
  }
  return value;
}

/** Login accepts an existing legacy/test credential, while account creation remains strict. */
export function requireLoginPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 256) {
    throw badRequest("INVALID_PASSWORD", "Password is required.");
  }
  return value;
}
