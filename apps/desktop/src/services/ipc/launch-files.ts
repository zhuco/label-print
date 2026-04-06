import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type LaunchFilePayload = {
  fileName: string;
  filePath: string;
  bytes: number[];
};

const LAUNCH_FILES_EVENT = "launch-files";

function normalizeLaunchFilePayload(input: unknown): LaunchFilePayload | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const payload = input as Partial<LaunchFilePayload>;
  if (typeof payload.fileName !== "string" || typeof payload.filePath !== "string") {
    return null;
  }
  if (!Array.isArray(payload.bytes)) {
    return null;
  }
  const bytes = payload.bytes.filter(
    (value): value is number => Number.isInteger(value) && value >= 0 && value <= 255
  );
  return {
    fileName: payload.fileName,
    filePath: payload.filePath,
    bytes,
  };
}

function normalizeLaunchFilePayloads(input: unknown): LaunchFilePayload[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((entry) => normalizeLaunchFilePayload(entry))
    .filter((entry): entry is LaunchFilePayload => entry !== null);
}

export async function consumeLaunchFiles(): Promise<LaunchFilePayload[]> {
  try {
    return normalizeLaunchFilePayloads(await invoke<unknown>("consume_launch_files"));
  } catch {
    return [];
  }
}

export async function subscribeLaunchFiles(
  handler: (payloads: LaunchFilePayload[]) => void
): Promise<() => void> {
  try {
    return await listen<unknown>(LAUNCH_FILES_EVENT, (event) => {
      const payloads = normalizeLaunchFilePayloads(event.payload);
      if (payloads.length === 0) {
        return;
      }
      handler(payloads);
    });
  } catch {
    return () => {};
  }
}
