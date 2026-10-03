import { expect, it } from "vitest";
import { LiveTestOutput, type GoTestEvent } from "./liveOutput";
const owner = { workspaceRoot: "/opened", requestId: "owner" };
const event = (sequence: number, text: string): GoTestEvent => ({ ...owner, sequence, kind: "output", stream: "stdout", bytes: [...new TextEncoder().encode(text)] });
it("decodes actual partial UTF-8 packets without inventing completion", () => {
  const live = new LiveTestOutput(owner); const bytes = [...new TextEncoder().encode("\u00c9")];
  live.consume({ ...event(1, ""), kind: "output", stream: "stdout", bytes: bytes.slice(0, 1) });
  expect(live.snapshot().report.stdout).toBe("");
  live.consume({ ...event(2, ""), kind: "output", stream: "stdout", bytes: bytes.slice(1) });
  expect(live.snapshot().report.stdout).toBe("\u00c9"); expect(live.snapshot().report.exitCode).toBeNull(); expect(live.snapshot().report.success).toBe(false);
});
it("rejects foreign/replayed/retired packets and reports sequence gaps", () => {
  const live = new LiveTestOutput(owner);
  expect(live.consume({ ...event(1, "foreign"), requestId: "replaced" })).toBe(false);
  expect(live.consume({ ...event(1, "foreign"), workspaceRoot: "/other" })).toBe(false);
  live.consume(event(1, "first")); expect(live.consume(event(1, "duplicate"))).toBe(false);
  live.consume(event(3, "gap")); expect(live.snapshot().warning).toContain("incomplete");
  live.finish(); expect(live.consume(event(4, "late"))).toBe(false); expect(live.snapshot().report.stdout).toBe("firstgap");
});
it("bounds accumulated previews and rejects oversized/malformed packets", () => {
  const live = new LiveTestOutput(owner);
  live.consume({ ...event(1, ""), kind: "output", stream: "stdout", bytes: [256] });
  expect(live.snapshot().warning).toContain("incomplete");
  for (let i = 2; i < 80; i++) live.consume(event(i, "x".repeat(8192)));
  expect(live.snapshot().report.stdout.length).toBe(256 * 1024);
});

it("flushes an unfinished UTF-8 codepoint only when the native stream retires", () => {
  const live = new LiveTestOutput(owner); live.consume({ ...event(1, ""), kind: "output", stream: "stdout", bytes: [0xc3] });
  expect(live.snapshot().report.stdout).toBe(""); expect(live.finish()).toBe(true); expect(live.snapshot().report.stdout).toBe("\ufffd"); expect(live.finish()).toBe(false);
});
