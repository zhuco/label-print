import type { SubmitTaskPayload } from "../../features/editor/core/print-task";

type TauriWindow = {
  __TAURI__?: {
    core?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
  };
};

function getInvoke() {
  const maybeWindow = globalThis as typeof globalThis & TauriWindow;
  const invoke = maybeWindow.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") {
    return null;
  }
  return invoke;
}

export async function submitPrintTask(payload: SubmitTaskPayload): Promise<number> {
  const invoke = getInvoke();
  if (!invoke) {
    return Date.now();
  }

  return invoke<number>("submit_print_task", {
    payload: {
      template_id: payload.templateId,
      total_items: payload.totalItems,
      printer_id: payload.printerId,
      copies: payload.copies,
      calibration_json: JSON.stringify(payload.calibration),
      payload_json: payload.payload,
    },
  });
}

export async function pauseJob(id: number): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) {
    return;
  }
  await invoke("pause_print_job", { id });
}

export async function resumeJob(id: number): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) {
    return;
  }
  await invoke("resume_print_job", { id });
}

export async function cancelJob(id: number): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) {
    return;
  }
  await invoke("cancel_print_job", { id });
}
