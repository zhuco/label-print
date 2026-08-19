import type { AccountDeletionResponse, MeResponse } from "@label/api-contract";

import { AuthenticationRequiredError, CloudApiClient, isNetworkOrServiceError } from "./api-client";
import type { CredentialStore } from "./credentials";
import type { CloudCredentials } from "./types";

export type CloudAuthState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: MeResponse };

type AuthListener = (state: CloudAuthState) => void;

export class CloudAuthSession {
  private credentials: CloudCredentials | null = null;
  private currentState: CloudAuthState = { status: "loading", user: null };
  private readonly listeners = new Set<AuthListener>();
  private refreshPromise: Promise<boolean> | null = null;

  constructor(
    private readonly client: CloudApiClient,
    private readonly credentialStore: CredentialStore
  ) {}

  get state(): CloudAuthState {
    return this.currentState;
  }

  get accessToken(): string | null {
    return this.credentials?.accessToken ?? null;
  }

  get user(): MeResponse | null {
    return this.currentState.status === "authenticated" ? this.currentState.user : null;
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async restore(): Promise<CloudAuthState> {
    this.credentials = await this.credentialStore.load();
    if (!this.credentials) {
      this.setState({ status: "anonymous", user: null });
      return this.currentState;
    }
    try {
      const user = await this.client.me();
      this.setState({ status: "authenticated", user });
    } catch (error) {
      // Keep durable credentials through temporary network or service failures.  The next
      // online/focus retry will restore the session; only a definitively rejected token or
      // an explicit logout removes it.
      if (this.currentState.status !== "authenticated" && !(await this.refresh()) && this.credentials) {
        if (!isNetworkOrServiceError(error) && !(error instanceof AuthenticationRequiredError)) {
          await this.clearSession();
        }
      }
    }
    return this.currentState;
  }

  async login(input: { email: string; password: string }): Promise<MeResponse> {
    const response = await this.client.login(input);
    await this.acceptCredentials(response, response.user);
    return response.user;
  }

  async register(input: { email: string; password: string; displayName?: string }): Promise<MeResponse> {
    const response = await this.client.register(input);
    await this.acceptCredentials(response, response.user);
    return response.user;
  }

  /** Reloads the server-authoritative plan and label usage after a quota-changing action. */
  async refreshProfile(): Promise<MeResponse> {
    const user = await this.client.me();
    this.setState({ status: "authenticated", user });
    return user;
  }

  async logout(): Promise<void> {
    const refreshToken = this.credentials?.refreshToken ?? null;
    try {
      await this.client.logout(refreshToken);
    } finally {
      await this.clearSession();
    }
  }

  async requestAccountDeletion(): Promise<AccountDeletionResponse> {
    const response = await this.client.requestAccountDeletion();
    // The server has frozen the account and revoked every refresh session. Remove the local
    // credential only after it has acknowledged the deletion request, so a transient offline
    // failure still lets the user retry without signing in again.
    await this.clearSession();
    return response;
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.client.requestPasswordReset(email);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.client.resetPassword(token, password);
  }

  async refresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = this.credentials?.refreshToken;
    if (!refreshToken) return false;
    try {
      const credentials = await this.client.refresh(refreshToken);
      this.credentials = credentials;
      await this.credentialStore.save(credentials);
      const user = await this.client.me();
      this.setState({ status: "authenticated", user });
      return true;
    } catch (error) {
      // Do not turn a short outage into a logout.  Invalid/revoked refresh tokens still
      // clear the session, while a later retry can use credentials retained after outages.
      if (!isNetworkOrServiceError(error)) {
        await this.clearSession();
      }
      return false;
    }
  }

  private async acceptCredentials(credentials: CloudCredentials, user: MeResponse): Promise<void> {
    this.credentials = { accessToken: credentials.accessToken, refreshToken: credentials.refreshToken };
    await this.credentialStore.save(this.credentials);
    this.setState({ status: "authenticated", user });
  }

  private async clearSession(): Promise<void> {
    this.credentials = null;
    await this.credentialStore.clear();
    this.setState({ status: "anonymous", user: null });
  }

  private setState(state: CloudAuthState): void {
    this.currentState = state;
    this.listeners.forEach((listener) => listener(state));
  }
}
