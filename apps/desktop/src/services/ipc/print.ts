import { invoke } from "@tauri-apps/api/core";

import type { SubmitTaskPayload } from "../../features/editor/core/print-task";

const SYSTEM_PRINTER_CACHE_KEY = "label-print.system-printers";
const SYSTEM_PRINTER_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

let inFlightSystemPrintersRequest: Promise<string[]> | null = null;

type SystemPrinterCache = {
  printers: string[];
  cachedAt: number;
};

export type DirectPrintPayload = {
  templateId: number;
  totalItems: number;
  printerId: string;
  copies: number;
  calibrationJson: string;
  payloadJson: string;
  previewPngBase64s: string[];
  widthMm: number;
  heightMm: number;
  title: string;
};

export type DirectPrintResult = {
  jobId: number;
  outputPath?: string | null;
};

function isTauriUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tauri|invoke|not available|not found|window.__TAURI__/i.test(message);
}

function normalizePrinterNames(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const deduped = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") {
      continue;
    }
    const name = item.trim();
    if (!name) {
      continue;
    }
    deduped.add(name);
  }
  return Array.from(deduped);
}


function writeCachedSystemPrinters(printers: string[]) {
  if (typeof localStorage === "undefined") {
    return;
  }
  const normalized = normalizePrinterNames(printers);
  if (normalized.length === 0) {
    return;
  }
  const payload: SystemPrinterCache = {
    printers: normalized,
    cachedAt: Date.now(),
  };
  localStorage.setItem(SYSTEM_PRINTER_CACHE_KEY, JSON.stringify(payload));
}

export function getCachedSystemPrinters(maxAgeMs = SYSTEM_PRINTER_CACHE_MAX_AGE_MS): string[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  const raw = localStorage.getItem(SYSTEM_PRINTER_CACHE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SystemPrinterCache>;
    const cachedAt = Number(parsed.cachedAt);
    if (Number.isFinite(cachedAt) && cachedAt > 0) {
      const age = Date.now() - cachedAt;
      if (age > maxAgeMs) {
        return [];
      }
    }
    return normalizePrinterNames(parsed.printers);
  } catch {
    return [];
  }
}

export async function submitPrintTask(payload: SubmitTaskPayload): Promise<number> {
  try {
    return await invoke<number>("submit_print_task", {
      payload: {
        template_id: payload.templateId,
        total_items: payload.totalItems,
        printer_id: payload.printerId,
        copies: payload.copies,
        calibration_json: JSON.stringify(payload.calibration),
        payload_json: payload.payload,
      },
    });
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return Date.now();
    }
    throw error;
  }
}

export async function listSystemPrinters(): Promise<string[]> {
  if (inFlightSystemPrintersRequest) {
    return inFlightSystemPrintersRequest;
  }

  const request = (async () => {
    try {
      const printers = await invoke<string[]>("list_system_printers");
      const normalized = normalizePrinterNames(printers);
      writeCachedSystemPrinters(normalized);
      return normalized;
    } catch (error) {
      if (isTauriUnavailable(error)) {
        return [];
      }
      throw error;
    } finally {
      inFlightSystemPrintersRequest = null;
    }
  })();

  inFlightSystemPrintersRequest = request;
  return request;
}

export async function submitDirectPrint(payload: DirectPrintPayload): Promise<DirectPrintResult> {
  try {
    return await invoke<DirectPrintResult>("submit_direct_print", {
      payload: {
        template_id: payload.templateId,
        total_items: payload.totalItems,
        printer_id: payload.printerId,
        copies: payload.copies,
        calibration_json: payload.calibrationJson,
        payload_json: payload.payloadJson,
        preview_png_base64s: payload.previewPngBase64s,
        width_mm: payload.widthMm,
        height_mm: payload.heightMm,
        title: payload.title,
      },
    });
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return { jobId: Date.now(), outputPath: null };
    }
    throw error;
  }
}

export async function revealPdfOutput(path: string): Promise<void> {
  try {
    await invoke("reveal_pdf_output", { path });
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return;
    }
    throw error;
  }
}

export async function pauseJob(id: number): Promise<void> {
  try {
    await invoke("pause_print_job", { id });
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return;
    }
    throw error;
  }
}

export async function resumeJob(id: number): Promise<void> {
  try {
    await invoke("resume_print_job", { id });
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return;
    }
    throw error;
  }
}

export async function cancelJob(id: number): Promise<void> {
  try {
    await invoke("cancel_print_job", { id });
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return;
    }
    throw error;
  }
}
