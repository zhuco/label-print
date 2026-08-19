import { dirname, join } from "node:path";
import { LabelCloudServer } from "./app.js";
import { FileStore } from "./file-store.js";
import { FileAssetStorage, MemoryAssetStorage } from "./local-asset-storage.js";
import { PostgresStore } from "./postgres-store.js";
import { objectStorageFromEnvironment } from "./object-storage.js";
import { passwordResetMailerFromEnvironment } from "./mailer.js";
import { seedBuiltInOfficialTemplates } from "./official-template-seeds.js";
import { validateProductionEnvironment } from "./runtime-config.js";
import { InMemoryStore } from "./store.js";
import { requireEmail } from "./validation.js";

validateProductionEnvironment();

const port = Number(process.env.PORT ?? 8787);
const store = process.env.DATABASE_URL
  ? new PostgresStore({ connectionString: process.env.DATABASE_URL })
  : process.env.LOCAL_CLOUD_STORE_FILE
    ? new FileStore(process.env.LOCAL_CLOUD_STORE_FILE)
    : new InMemoryStore();
if (store instanceof InMemoryStore) seedDevelopmentAccount(store);
else if (process.env.ENABLE_DEVELOPMENT_SEED === "true") throw new Error("Development seed accounts are available only with LOCAL_CLOUD_STORE_FILE.");
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean);
const trustedProxyIps = process.env.TRUSTED_PROXY_IPS?.split(",").map((value) => value.trim()).filter(Boolean);
const objectStorage = objectStorageFromEnvironment();
const localAssetStorage = objectStorage
  ? undefined
  : store instanceof FileStore
    ? new FileAssetStorage(process.env.LOCAL_CLOUD_ASSET_DIRECTORY ?? join(dirname(store.filePath), "cloud-assets"))
    : new MemoryAssetStorage();
const cloudApplication = new LabelCloudServer({
  store, objectStorage, localAssetStorage, passwordResetMailer: passwordResetMailerFromEnvironment(),
  allowedOrigins: allowedOrigins?.length ? allowedOrigins : undefined,
  metricsToken: process.env.METRICS_TOKEN,
  billingWebhookSecret: process.env.BILLING_WEBHOOK_SECRET,
  releaseAdminToken: process.env.RELEASE_ADMIN_TOKEN,
  trustedProxyIps: trustedProxyIps?.length ? trustedProxyIps : undefined,
});
const server = cloudApplication.createNodeServer();
const host = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
void start().catch((error: unknown) => {
  console.error(`Failed to start label cloud API: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});

async function start(): Promise<void> {
  await seedBuiltInOfficialTemplates(store);
  await purgeDueAccounts();
  const purgeInterval = setInterval(() => { void purgeDueAccounts(); }, 60 * 60 * 1000);
  purgeInterval.unref();
  server.listen(port, host, () => {
    // Intentionally contains no credentials, request bodies, or token material.
    console.info(`Label cloud API listening on http://${host}:${port}`);
  });
}

async function purgeDueAccounts(): Promise<void> {
  const result = await cloudApplication.purgeDueAccountDeletions();
  if (result.purged || result.failed) console.info(`Account deletion maintenance: purged=${result.purged}, failed=${result.failed}`);
}

function seedDevelopmentAccount(store: InMemoryStore): void {
  if (process.env.ENABLE_DEVELOPMENT_SEED !== "true") return;
  if (process.env.NODE_ENV === "production") throw new Error("ENABLE_DEVELOPMENT_SEED cannot be used in production.");
  const email = process.env.DEVELOPMENT_SEED_EMAIL;
  const password = process.env.DEVELOPMENT_SEED_PASSWORD;
  if (!email || !password) throw new Error("DEVELOPMENT_SEED_EMAIL and DEVELOPMENT_SEED_PASSWORD are required when seeding.");
  const user = store.createDevelopmentUser(requireEmail(email), password, "Local test user");
  const plan = process.env.DEVELOPMENT_SEED_PLAN === "pro" ? "pro" : "free";
  const expiresAt = process.env.DEVELOPMENT_SEED_PLAN_EXPIRES_AT ?? null;
  if (expiresAt !== null && Number.isNaN(Date.parse(expiresAt))) throw new Error("DEVELOPMENT_SEED_PLAN_EXPIRES_AT must be an ISO-8601 timestamp.");
  store.setPlanFromSubscription(user.id, plan, expiresAt);
}
