import { invoke } from "@tauri-apps/api/core";

import type { CloudCredentials } from "./types";

/**
 * Token persistence has an intentionally narrow boundary. Browser fallback is
 * process-memory only; it never reads or writes localStorage/sessionStorage.
 */
export interface CredentialStore {
  load(): Promise<CloudCredentials | null>;
  save(credentials: CloudCredentials): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCredentialStore implements CredentialStore {
  private credentials: CloudCredentials | null = null;

  async load(): Promise<CloudCredentials | null> {
    return this.credentials ? { ...this.credentials } : null;
  }

  async save(credentials: CloudCredentials): Promise<void> {
    this.credentials = { ...credentials };
  }

  async clear(): Promise<void> {
    this.credentials = null;
  }
}

type TauriCredentialCommands = {
  load: "cloud_load_credentials";
  save: "cloud_save_credentials";
  clear: "cloud_clear_credentials";
};

/**
 * Tauri bridge port for a Windows Credential Manager implementation. The Rust
 * commands are intentionally the only durable storage path; no plaintext file
 * or browser storage fallback is used when the bridge is unavailable.
 */
export class TauriCredentialStore implements CredentialStore {
  constructor(private readonly fallback: CredentialStore = new MemoryCredentialStore()) {}

  async load(): Promise<CloudCredentials | null> {
    try {
      const value = await invoke<CloudCredentials | null>("cloud_load_credentials" satisfies TauriCredentialCommands["load"]);
      return value && typeof value.accessToken === "string" && typeof value.refreshToken === "string" ? value : null;
    } catch {
      return this.fallback.load();
    }
  }

  async save(credentials: CloudCredentials): Promise<void> {
    try {
      await invoke("cloud_save_credentials" satisfies TauriCredentialCommands["save"], { credentials });
    } catch {
      await this.fallback.save(credentials);
    }
  }

  async clear(): Promise<void> {
    try {
      await invoke("cloud_clear_credentials" satisfies TauriCredentialCommands["clear"]);
    } finally {
      await this.fallback.clear();
    }
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createCredentialStore(): CredentialStore {
  return isTauriRuntime() ? new TauriCredentialStore() : new MemoryCredentialStore();
}
