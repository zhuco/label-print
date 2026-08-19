import { createServer } from "../../apps/desktop/node_modules/vite/dist/node/index.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Playwright's `webServer` command is launched through cmd.exe on Windows. Even when the tests
 * pass, cmd.exe can leave the Vite child alive. Owning Vite in global setup lets the returned
 * teardown close the exact server instance deterministically.
 */
export default async function globalSetup() {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const server = await createServer({
    root: resolve(testDirectory, "../../apps/desktop"),
    server: { host: "127.0.0.1", port: 4173, strictPort: true },
  });
  await server.listen();

  return async () => {
    await server.close();
  };
}
