import { describe, expect, it, vi } from "vitest";

import { UpdateCoordinator, getOrCreateUpdateClientId, getUpdateBlockReason, isVersionBelowMinimum, readUpdatePolicy, type AvailableUpdate } from "../update.service";

const update = (downloadAndInstall = vi.fn().mockResolvedValue(undefined)): AvailableUpdate => ({
  currentVersion: "0.1.3",
  version: "0.2.0",
  notes: "云空间",
  date: "2026-08-04T10:00:00Z",
  artifactSize: 12_345,
  minimumSupportedVersion: null,
  mandatory: false,
  downloadAndInstall,
});

describe("UpdateCoordinator", () => {
  it("does not install while printing or unsynced work exists", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    const coordinator = new UpdateCoordinator({ check: vi.fn().mockResolvedValue(update(downloadAndInstall)) });
    await coordinator.check();

    const result = await coordinator.install({ printing: true, hasUnsyncedChanges: true });

    expect(result).toEqual({ ok: false, reason: "blocked", message: "正在打印，完成后才能安装更新。" });
    expect(downloadAndInstall).not.toHaveBeenCalled();
  });

  it("reports download progress and installs only after an explicit request", async () => {
    const downloadAndInstall = vi.fn(async (onProgress: (value: { downloadedBytes: number; totalBytes: number | null }) => void) => {
      onProgress({ downloadedBytes: 12, totalBytes: 24 });
    });
    const coordinator = new UpdateCoordinator({ check: vi.fn().mockResolvedValue(update(downloadAndInstall)) });
    const progress = vi.fn();

    await coordinator.check();
    const result = await coordinator.install({}, progress);

    expect(result).toEqual({ ok: true });
    expect(progress).toHaveBeenCalledWith({ downloadedBytes: 12, totalBytes: 24 });
  });
});

describe("getUpdateBlockReason", () => {
  it("prioritizes active work and permits a safe install", () => {
    expect(getUpdateBlockReason({ importingOrExporting: true })).toBe("正在导入或导出文件，完成后才能安装更新。");
    expect(getUpdateBlockReason({})).toBeNull();
  });
});

describe("isVersionBelowMinimum", () => {
  it("identifies clients outside the cloud API compatibility window", () => {
    expect(isVersionBelowMinimum("0.1.3", "0.2.0")).toBe(true);
    expect(isVersionBelowMinimum("0.2.0", "0.2.0")).toBe(false);
    expect(isVersionBelowMinimum("0.3.0", "0.2.0")).toBe(false);
    expect(isVersionBelowMinimum("invalid", "0.2.0")).toBe(false);
  });
});

describe("readUpdatePolicy", () => {
  it("honors an explicit mandatory flag and a minimum client version carried by Tauri raw metadata", () => {
    expect(readUpdatePolicy("0.1.3", { minimum_supported_version: "0.2.0", artifact_size: 123 })).toEqual({ minimumSupportedVersion: "0.2.0", mandatory: true, artifactSize: 123 });
    expect(readUpdatePolicy("0.2.0", { mandatory: true })).toEqual({ minimumSupportedVersion: null, mandatory: true, artifactSize: null });
    expect(readUpdatePolicy("0.2.0", { minimum_supported_version: "invalid", artifact_size: -1 })).toEqual({ minimumSupportedVersion: null, mandatory: false, artifactSize: null });
  });
});

describe("getOrCreateUpdateClientId", () => {
  it("persists a non-secret install identifier for stable rollout assignment", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };

    const first = getOrCreateUpdateClientId(storage);
    expect(first).toMatch(/^[a-z0-9-]{16,80}$/i);
    expect(getOrCreateUpdateClientId(storage)).toBe(first);
  });
});
