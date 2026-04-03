import type { BarcodeSymbology } from "./types";

export const BARCODE_SYMBOLOGY_OPTIONS: Array<{ value: BarcodeSymbology; label: string }> = [
  { value: "CODE128", label: "CODE128" },
  { value: "CODE39", label: "CODE39" },
  { value: "CODE93", label: "CODE93" },
  { value: "EAN13", label: "EAN13" },
  { value: "EAN8", label: "EAN8" },
  { value: "UPC", label: "UPC-A" },
  { value: "UPCE", label: "UPC-E" },
  { value: "ITF14", label: "ITF-14" },
  { value: "ITF", label: "ITF" },
  { value: "MSI", label: "MSI" },
  { value: "MSI10", label: "MSI10" },
  { value: "MSI11", label: "MSI11" },
  { value: "MSI1010", label: "MSI1010" },
  { value: "MSI1110", label: "MSI1110" },
  { value: "codabar", label: "CODABAR" },
  { value: "pharmacode", label: "PHARMACODE" },
];

const DEFAULT_BARCODE_VALUES: Record<BarcodeSymbology, string> = {
  CODE128: "123456789",
  CODE39: "ABC123",
  CODE93: "ABC123",
  EAN13: "690123456789",
  EAN8: "1234567",
  UPC: "12345678901",
  UPCE: "123456",
  ITF14: "1234567890123",
  ITF: "12345678",
  MSI: "123456",
  MSI10: "123456",
  MSI11: "123456",
  MSI1010: "123456",
  MSI1110: "123456",
  codabar: "A123456A",
  pharmacode: "12345",
};

export function getDefaultBarcodeValue(symbology: BarcodeSymbology): string {
  return DEFAULT_BARCODE_VALUES[symbology];
}

export function normalizeBarcodeValue(value: string, symbology: BarcodeSymbology): string {
  const raw = (value ?? "").trim();
  if (!raw) {
    return getDefaultBarcodeValue(symbology);
  }

  switch (symbology) {
    case "EAN13":
      return pickDigits(raw, 12);
    case "EAN8":
      return pickDigits(raw, 7);
    case "UPC":
      return pickDigits(raw, 11);
    case "UPCE":
      return pickDigits(raw, 6);
    case "ITF14":
      return pickDigits(raw, 13);
    case "ITF":
      return ensureEvenDigits(raw);
    case "MSI":
    case "MSI10":
    case "MSI11":
    case "MSI1010":
    case "MSI1110":
      return pickDigits(raw, 6, false);
    case "codabar":
      return normalizeCodabar(raw);
    case "pharmacode":
      return normalizePharmacode(raw);
    case "CODE39":
      return normalizeCode39(raw);
    case "CODE93":
    case "CODE128":
    default:
      return raw;
  }
}

function pickDigits(input: string, targetLength: number, exactLength = true): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) {
    return "0".repeat(targetLength);
  }
  if (exactLength) {
    return digits.slice(0, targetLength).padEnd(targetLength, "0");
  }
  return digits.slice(0, Math.max(targetLength, digits.length));
}

function ensureEvenDigits(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) {
    return "12";
  }
  const safe = digits.length === 1 ? `0${digits}` : digits;
  return safe.length % 2 === 0 ? safe : `${safe}0`;
}

function normalizeCodabar(input: string): string {
  const upper = input.toUpperCase();
  const payload = upper.replace(/[^0-9A-D\-$:/.+]/g, "");
  const noFrame = payload.replace(/[ABCD]/g, "");
  const body = noFrame || "123456";
  return `A${body}A`;
}

function normalizePharmacode(input: string): string {
  const digits = input.replace(/\D/g, "");
  const parsed = Number.parseInt(digits || "12345", 10);
  const safe = Number.isFinite(parsed) ? parsed : 12345;
  const clamped = Math.min(Math.max(safe, 3), 131070);
  return String(clamped);
}

function normalizeCode39(input: string): string {
  const upper = input.toUpperCase();
  const safe = upper.replace(/[^0-9A-Z\-.$/+% ]/g, "");
  return safe || "ABC123";
}
