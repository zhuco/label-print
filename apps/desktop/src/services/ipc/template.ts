import { invoke as tauriInvoke } from "@tauri-apps/api/core";

type TauriWindow = {
  __TAURI__?: {
    core?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
  };
};

const LOCAL_TEMPLATE_KEY = "label-print.templates";

export type TemplateDto = {
  id: number;
  name: string;
  content: string;
};

type SaveTemplateFileResult = {
  fileName: string;
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
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(LOCAL_TEMPLATE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => {
        const row = item as Partial<TemplateDto>;
        if (typeof row.id !== "number" || typeof row.name !== "string" || typeof row.content !== "string") {
          return null;
        }
        return row as TemplateDto;
      })
      .filter((item): item is TemplateDto => item !== null)
      .sort((a, b) => b.id - a.id);
  } catch {
    return [];
  }
}

function writeLocalTemplates(templates: TemplateDto[]) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(LOCAL_TEMPLATE_KEY, JSON.stringify(templates));
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
  const id = Date.now();
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
  try {
    const result = await invokeDesktop<unknown>("open_template_file");
    if (result === null) {
      return { status: "unsupported" };
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
  } catch {
    return { status: "cancelled" };
  }
}
