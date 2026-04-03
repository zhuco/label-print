import type { ContentBinding } from "./types";

export type { ContentBinding } from "./types";

export function createDefaultBinding(): ContentBinding {
  return {
    mode: "fixed",
    fixedValue: "双击编辑",
  };
}

export function resolveBindingValue(
  binding: ContentBinding,
  record: Record<string, string | number | null | undefined>
): string {
  if (binding.mode === "fixed") {
    return binding.fixedValue ?? "";
  }

  if (binding.mode === "column") {
    if (!binding.column) {
      return "";
    }
    const value = record[binding.column];
    return value === null || value === undefined ? "" : String(value);
  }

  const template = binding.expression ?? "";
  return template.replace(/\$\{([^}]+)\}/g, (_, token: string) => {
    const value = record[token.trim()];
    return value === null || value === undefined ? "" : String(value);
  });
}
