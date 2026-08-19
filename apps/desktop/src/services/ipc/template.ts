import { invoke as tauriInvoke } from "@tauri-apps/api/core";

type TauriWindow = {
  __TAURI__?: {
    core?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
  };
};

export type TemplateDto = {
  id: number;
  name: string;
  content: string;
};

// The unsupported browser/preview path remains usable within one session, but complete template
// contents must never be serialised into localStorage. The production Tauri path persists them
// through the SQLite-backed native template repository.
let memoryTemplates: TemplateDto[] = [];

type SaveTemplateFileResult = {
  fileName: string;
};

type PickTemplateSavePathResult = {
  fileName: string;
  filePath: string;
  replacingExisting: boolean;
};

type OpenTemplateFileResult = {
  fileName: string;
  filePath: string;
  bytes: number[];
};

export type PickTemplateFileResult =
  | {
      status: "selected";
      file: OpenTemplateFileResult;
    }
  | {
      status: "cancelled";
    }
  | {
      status: "unsupported";
    };

export type PickTemplateSavePathSelection =
  | {
      status: "selected";
      file: PickTemplateSavePathResult;
    }
  | {
      status: "cancelled";
    }
  | {
      status: "unsupported";
    };

function getInvoke() {
  const maybeWindow = globalThis as typeof globalThis & TauriWindow;
  const invoke = maybeWindow.__TAURI__?.core?.invoke;
  if (typeof invoke === "function") {
    return invoke;
  }
  return tauriInvoke;
}

function isTauriUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tauri|invoke|not available|not found|window.__TAURI__/i.test(message);
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  const invoke = getInvoke();
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return null;
    }
    throw error;
  }
}

function readLocalTemplates(): TemplateDto[] {
  return memoryTemplates.map((template) => ({ ...template }));
}

function writeLocalTemplates(templates: TemplateDto[]) {
  memoryTemplates = templates.map((template) => ({ ...template }));
}

export async function saveTemplate(name: string, content: string): Promise<number> {
  const result = await invokeDesktop<{ id: number }>("save_template", {
    payload: {
      name,
      content,
    },
  });
  if (result) {
    return result.id;
  }

  const templates = readLocalTemplates();
  const id = Math.max(Date.now(), ...templates.map((template) => template.id + 1));
  const next = [{ id, name, content }, ...templates];
  writeLocalTemplates(next);
  return id;
}

export async function listTemplates(): Promise<TemplateDto[]> {
  const result = await invokeDesktop<TemplateDto[]>("list_templates");
  if (result) {
    return result;
  }
  return readLocalTemplates();
}

export async function saveTemplateFile(path: string, bytes: Uint8Array): Promise<SaveTemplateFileResult | null> {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return null;
  }
  return invokeDesktop<SaveTemplateFileResult>("save_template_file", {
    payload: {
      path: normalizedPath,
      bytes: Array.from(bytes),
    },
  });
}

function normalizeOpenTemplateFileResult(input: unknown): OpenTemplateFileResult | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const row = input as Partial<OpenTemplateFileResult>;
  if (typeof row.fileName !== "string" || typeof row.filePath !== "string" || !Array.isArray(row.bytes)) {
    return null;
  }
  const bytes = row.bytes.filter((item): item is number => Number.isInteger(item) && item >= 0 && item <= 255);
  if (bytes.length === 0) {
    return null;
  }
  return {
    fileName: row.fileName,
    filePath: row.filePath,
    bytes,
  };
}

export async function pickTemplateFile(): Promise<PickTemplateFileResult> {
  const invoke = getInvoke();
  try {
    // A successful native invocation may intentionally return `null` when the
    // user cancels the picker. Do not route that case through the browser
    // fallback, or Windows will immediately show a second picker.
    const result = await invoke<unknown>("open_template_file");
    if (result === null) {
      return { status: "cancelled" };
    }
    if (!result) {
      return { status: "cancelled" };
    }
    const normalized = normalizeOpenTemplateFileResult(result);
    if (!normalized) {
      return { status: "cancelled" };
    }
    return {
      status: "selected",
      file: normalized,
    };
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return { status: "unsupported" };
    }
    return { status: "cancelled" };
  }
}

export async function pickTemplateSavePath(suggestedName: string): Promise<PickTemplateSavePathSelection> {
  const invoke = getInvoke();
  try {
    const result = await invoke<PickTemplateSavePathResult | null>("pick_template_save_path", {
      payload: {
        suggestedName,
      },
    });
    if (result === null) {
      return { status: "cancelled" };
    }
    if (
      !result
      || typeof result.fileName !== "string"
      || typeof result.filePath !== "string"
      || typeof result.replacingExisting !== "boolean"
    ) {
      return { status: "unsupported" };
    }
    return {
      status: "selected",
      file: result,
    };
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return { status: "unsupported" };
    }
    throw error;
  }
}
