/**
 * Reject incomplete production configuration before the HTTP server can bind a port.
 * Development intentionally retains its self-contained in-memory/file-store paths.
 */
export function validateProductionEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  if (environment.NODE_ENV !== "production") return;

  if (!environment.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in production; the in-memory and file stores are development-only.");
  }
  const accessTokenSecret = environment.ACCESS_TOKEN_SECRET;
  if (!accessTokenSecret || Buffer.byteLength(accessTokenSecret, "utf8") < 32) {
    throw new Error("ACCESS_TOKEN_SECRET must contain at least 32 bytes in production.");
  }
  const allowedOrigins = environment.CORS_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  if (!allowedOrigins.length) {
    throw new Error("CORS_ALLOWED_ORIGINS must contain at least one approved desktop origin in production.");
  }
  if (!environment.S3_BUCKET) {
    throw new Error("S3_BUCKET and its S3 credentials are required for a production deployment.");
  }
}
