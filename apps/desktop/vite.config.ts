import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export function requireProductionCloudApiUrl(value = process.env.VITE_LABEL_API_URL): string {
  const configured = value?.trim();
  if (!configured) {
    throw new Error("VITE_LABEL_API_URL is required for a production desktop build; refusing to embed the local development API.");
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("VITE_LABEL_API_URL must be an absolute HTTPS API origin.");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("VITE_LABEL_API_URL must be a credential-free HTTPS API origin without a path, query, or fragment.");
  }
  return url.origin;
}

export default defineConfig(({ command }) => {
  if (command === "build") {
    // A released desktop package must never silently fall back to 127.0.0.1.
    requireProductionCloudApiUrl();
  }
  return { plugins: [react()] };
});
