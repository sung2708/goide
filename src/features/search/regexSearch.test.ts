import { afterEach, expect, it, vi } from "vitest";
import { scanRegex } from "./regexSearch";
import { startRegexSearch } from "./regexSearchClient";
const request = { text: "😀 tên=42\r\ntên=7", query: "(?<name>tên)=(\\d+)", replacement: "${2}:${name}:$$:\\", matchCase: true, wholeWord: false };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("uses full document context for lookbehind and capture replacements with UTF-16 ranges", () => {
  expect(scanRegex(request).matches).toEqual([{ from: 3, to: 9, replacement: "42:tên:$:\\" }, { from: 11, to: 16, replacement: "7:tên:$:\\" }]);
  expect(scanRegex({ ...request, text: "prefix target", query: "(?<=prefix )target", replacement: "x" }).matches[0]).toEqual({ from: 7, to: 13, replacement: "x" });
});
it("advances zero-width matches by Unicode code point and bounds expansion/results", () => {
  expect(scanRegex({ ...request, text: "😀x", query: "(?=.)", replacement: "" }).matches.map(match => match.from)).toEqual([0, 2]);
  expect(scanRegex({ ...request, text: "x".repeat(2100), query: "x", replacement: "" }).limited).toBe(true);
  expect(() => scanRegex({ ...request, query: "[" })).toThrow();
  expect(scanRegex({ ...request, text: "tên tênx _tên", query: "tên", wholeWord: true }).matches).toHaveLength(1);
});
it("terminates an unresponsive regex worker at the deadline and on cancellation", async () => {
  vi.useFakeTimers();
  const terminate = vi.fn(), postMessage = vi.fn();
  vi.stubGlobal("Worker", class { terminate = terminate; postMessage = postMessage; onmessage = null; onerror = null; });
  const task = startRegexSearch(request); const assertion = expect(task.promise).rejects.toThrow("deadline");
  await vi.advanceTimersByTimeAsync(1000); await assertion; expect(terminate).toHaveBeenCalledOnce();
  const cancelled = startRegexSearch(request); const cancelledAssertion = expect(cancelled.promise).rejects.toThrow("cancelled");
  cancelled.cancel(); await cancelledAssertion; expect(terminate).toHaveBeenCalledTimes(2);
});
