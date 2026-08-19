import { describe, expect, it } from "vitest";
import { validateProductionEnvironment } from "../runtime-config.js";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://label:secret@db.example.test/label_cloud",
  ACCESS_TOKEN_SECRET: "a".repeat(32),
  CORS_ALLOWED_ORIGINS: "tauri://localhost",
  S3_BUCKET: "label-assets",
};

describe("production runtime configuration", () => {
  it("accepts a complete production environment", () => {
    expect(() => validateProductionEnvironment(production)).not.toThrow();
  });

  it.each([
    ["database", { ...production, DATABASE_URL: "" }, "DATABASE_URL"],
    ["short token secret", { ...production, ACCESS_TOKEN_SECRET: "short" }, "ACCESS_TOKEN_SECRET"],
    ["CORS allow-list", { ...production, CORS_ALLOWED_ORIGINS: " , " }, "CORS_ALLOWED_ORIGINS"],
    ["object-store bucket", { ...production, S3_BUCKET: "" }, "S3_BUCKET"],
  ])("rejects a missing %s prerequisite", (_name, environment, message) => {
    expect(() => validateProductionEnvironment(environment)).toThrow(message);
  });

  it("leaves self-contained development configuration available", () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: "development" })).not.toThrow();
  });
});
