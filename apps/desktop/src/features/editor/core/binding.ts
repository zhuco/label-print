import type { ContentBinding } from "./types";

export type { ContentBinding } from "./types";

export const DEFAULT_DATE_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

export type BindingResolutionOptions = {
  /** Supply a shared timestamp when resolving one print job. */
  now?: Date;
};

export function createDefaultBinding(): ContentBinding {
  return {
    mode: "fixed",
    fixedValue: "双击编辑",
  };
}

export function resolveBindingValue(
  binding: ContentBinding,
  record: Record<string, string | number | null | undefined>,
  options: BindingResolutionOptions = {}
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

  if (binding.mode === "datetime") {
    const date =
      binding.dateTimeSource === "fixed"
        ? parseLocalDateTime(binding.fixedValue)
        : options.now ?? new Date();
    return date ? formatDateTime(date, binding.dateTimeFormat) : "";
  }

  const template = binding.expression ?? "";
  return template.replace(/\$\{([^}]+)\}/g, (_, token: string) => {
    const value = record[token.trim()];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function formatDateTime(date: Date, format = DEFAULT_DATE_TIME_FORMAT): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const values: Record<string, string> = {
    YYYY: String(date.getFullYear()).padStart(4, "0"),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  return (format || DEFAULT_DATE_TIME_FORMAT).replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => values[token]);
}

function parseLocalDateTime(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
