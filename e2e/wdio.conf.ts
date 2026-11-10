import { appPath as application } from "./support/app.js";

export const config: WebdriverIO.Config = {
  runner: "local",
  // Crash specs run last and in order: part 1 kills the app, part 2 relaunches it
  // on the same profile. Do not run them in parallel or on their own.
  specs: ["./specs/*.e2e.ts", "./specs/crash/1-kill-with-draft.e2e.ts", "./specs/crash/2-recover-draft.e2e.ts"],
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
  // Part 2 of the crash specs must see what part 1 left behind.
  before: async (_capabilities, specs) => {
    if (specs.some((spec) => spec.includes("2-recover-draft"))) return;
    await browser.execute(() => localStorage.clear());
    await browser.refresh();
  },
};
