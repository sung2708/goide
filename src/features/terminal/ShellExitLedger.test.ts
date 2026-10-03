import { expect, it } from "vitest";
import { ShellExitLedger } from "./ShellExitLedger";
it("bounds unmatched native events and retains the latest state for each session", () => {
  const ledger = new ShellExitLedger();
  ledger.record("first", "degraded");
  for (let index = 0; index < 128; index++) ledger.record(String(index), "exit");
  expect(ledger.get("first")).toBeUndefined();
  expect(ledger.get("127")).toBe("exit");
  ledger.record("127", "degraded");
  expect(ledger.get("127")).toBe("degraded");
});
