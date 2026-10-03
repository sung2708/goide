import { expect, it } from "vitest";
import { testResults } from "./model";
import type { GoTestOutput } from "../../lib/ipc/types";
const report = (events: unknown[]): GoTestOutput => ({ success: false, exitCode: 1, packages: [{ importPath: "example.test/a", relativeDirectory: "a" }], stdout: events.map(event => JSON.stringify(event)).join("\n"), stderr: "" });
it("tracks interleaved actual test status/duration and package build failure", () => {
  const result = testResults(report([
    { Package: "example.test/a", Test: "TestFail", Action: "run" },
    { Package: "example.test/a", Test: "TestSkip", Action: "skip", Elapsed: 0 },
    { Package: "example.test/a", Test: "TestFail", Action: "output", Output: "    a_test.go:12:7: actual failure\n" },
    { Package: "example.test/a", Test: "TestFail", Action: "fail", Elapsed: 0.5 },
    { ImportPath: "example.test/a", Action: "build-fail" },
    { Package: "example.test/a", Action: "fail", FailedBuild: "example.test/a" },
  ]));
  expect(result.warning).toBeNull(); expect(result.rows.map(row => row.status)).toEqual(["failed", "skipped", "build failed"]);
  expect(result.rows[0].duration).toBe(0.5); expect(result.rows[0].locations).toEqual([{ file: "a/a_test.go", line: 12, column: 7 }]);
});
it("rejects malformed/unrelated events and unsafe source locations without fabricated success", () => {
  const data = report([{ Package: "outside", Action: "pass" }, null, { Package: "example.test/a", Test: "TestA", Action: "output", Output: "../outside.go:1: unsafe\n/tmp/out.go:2: unsafe\nC:\\out.go:3: unsafe\nfile.go:0: invalid\nunrelated log mentions file.go:8\n" }]);
  data.stdout += "\nnot json";
  const result = testResults(data); expect(result.warning).toContain("3 unrecognized"); expect(result.rows).toHaveLength(1); expect(result.rows[0].status).toBe("not run"); expect(result.rows[0].locations).toEqual([]);
});
it("discloses bounded output and preserves package-only terminal events", () => {
  const result = testResults(report([{ Package: "example.test/a", Action: "output", Output: "x".repeat(140000) }, { Package: "example.test/a", Action: "pass" }]));
  expect(result.rows[0].output).toHaveLength(128 * 1024); expect(result.rows[0].status).toBe("passed"); expect(result.warning).toContain("limit reached");
});
it("recognizes older Go build failures and scopes compiler stderr by its actual package header", () => {
  const data = report([{ Package: "example.test/a", Action: "output", Output: "FAIL\texample.test/a [build failed]\n" }, { Package: "example.test/a", Action: "fail" }]);
  data.stderr = "# example.test/a [example.test/a.test]\na_test.go:2:8: syntax error\n# unrelated/pkg\nwrong.go:1:3: unrelated\n";
  const result = testResults(data); expect(result.rows[0].status).toBe("build failed"); expect(result.rows[0].locations).toEqual([{ file: "a/a_test.go", line: 2, column: 8 }]);
});
