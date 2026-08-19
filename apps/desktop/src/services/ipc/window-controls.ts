import { invoke } from "@tauri-apps/api/core";

function isTauriUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tauri|invoke|not available|not found|window.__TAURI__/i.test(message);
}

export async function minimizeWindow(): Promise<void> {
  try {
    await invoke("window_minimize");
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return;
    }
    throw error;
  }
}

export async function toggleMaximizeWindow(): Promise<boolean> {
  try {
    return await invoke<boolean>("window_toggle_maximize");
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return false;
    }
    throw error;
  }
}

export async function closeWindow(): Promise<void> {
  try {
    await invoke("window_close");
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return;
    }
    throw error;
  }
}

export async function startDragWindow(): Promise<void> {
  try {
    await invoke("window_start_drag");
  } catch (error) {
    if (isTauriUnavailable(error)) {
      return;
    }
    throw error;
  }
}
