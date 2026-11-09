import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const binary = process.platform === "win32" ? "Goro.exe" : "Goro";
const application =
  process.env.GORO_E2E_APP ?? resolve(here, "../src-tauri/target/debug", binary);

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": { application },
      "wdio:tauriServiceOptions": {
        driverProvider: "embedded",
        captureFrontendLogs: true,
        frontendLogLevel: "warn",
        captureBackendLogs: true,
        backendLogLevel: "warn",
      },
    } as WebdriverIO.Capabilities,
  ],
  services: [["@wdio/tauri-service", {}]],
  framework: "mocha",
  reporters: ["spec"],
  logLevel: "warn",
  waitforTimeout: 15_000,
  mochaOpts: { ui: "bdd", timeout: 120_000 },
  // The e2e build uses its own identifier (com.sungp.goide.e2e), so this only
  // clears test state, never a developer's real Goro settings or history.
  before: async () => {
    await browser.execute(() => localStorage.clear());
    await browser.refresh();
  },
};
