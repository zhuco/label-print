type TauriWindow = {
  __TAURI__?: {
    core?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
  };
};

export type SystemFontDto = {
  family: string;
  aliases: string[];
  postscriptName?: string | null;
};

function getInvoke() {
  const maybeWindow = globalThis as typeof globalThis & TauriWindow;
  const invoke = maybeWindow.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") {
    return null;
  }
  return invoke;
}

export async function listSystemFonts(): Promise<SystemFontDto[]> {
  const invoke = getInvoke();
  if (!invoke) {
    return [];
  }

  try {
    const rows = await invoke<SystemFontDto[]>("list_system_fonts");
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.filter((row): row is SystemFontDto => {
      return (
        typeof row === "object" &&
        row !== null &&
        typeof row.family === "string" &&
        Array.isArray(row.aliases)
      );
    });
  } catch {
    return [];
  }
}
