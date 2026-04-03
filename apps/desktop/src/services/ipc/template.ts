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

function getInvoke() {
  const maybeWindow = globalThis as typeof globalThis & TauriWindow;
  const invoke = maybeWindow.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") {
    return null;
  }
  return invoke;
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
  const invoke = getInvoke();
  if (invoke) {
    const result = await invoke<{ id: number }>("save_template", {
      payload: {
        name,
        content,
      },
    });
    return result.id;
  }

  const templates = readLocalTemplates();
  const id = Date.now();
  const next = [{ id, name, content }, ...templates];
  writeLocalTemplates(next);
  return id;
}

export async function listTemplates(): Promise<TemplateDto[]> {
  const invoke = getInvoke();
  if (invoke) {
    return invoke<TemplateDto[]>("list_templates");
  }
  return readLocalTemplates();
}
