import { describe, expect, it } from "vitest";
import { ConcurrencyConfidence } from "../../lib/ipc/types";
import type { RuntimeSignal } from "../../lib/ipc/types";
import {
  extractGoFileLineReferences,
  mapGitStatus,
  normalizeRelativePath,
  pathsReferToSameFile,
  pathsReferToSameRunTarget,
  runtimeSignalMatchesScope,
  selectActiveBlockedSignal,
  toRaceFindings,
} from "./editorShellUtils";

function runtimeSignal(overrides: Partial<RuntimeSignal>): RuntimeSignal {
  return {
    threadId: 1,
    status: "blocked",
    waitReason: "chan receive",
    confidence: ConcurrencyConfidence.Predicted,
    scopeKey: "scope-a",
    scopeRelativePath: "main.go",
    scopeLine: 1,
    scopeColumn: 1,
    relativePath: "main.go",
    line: 1,
    column: 1,
    ...overrides,
  };
}

describe("editorShellUtils", () => {
  it("preserves current trimmed git status mapping for explorer decorations", () => {
    expect(mapGitStatus("?? main.go")).toBe("untracked");
    expect(mapGitStatus("M  main.go")).toBe("staged");
    expect(mapGitStatus(" M main.go")).toBe("staged");
  });

  it("normalizes Windows path separators without changing case", () => {
    expect(normalizeRelativePath(" pkg\\Main.go ")).toBe("pkg/Main.go");
  });

  it("matches equivalent relative and absolute file suffixes but avoids basename-only collisions", () => {
    expect(pathsReferToSameFile("C:/workspace/pkg/main.go", "pkg/main.go")).toBe(true);
    expect(pathsReferToSameFile("pkg/main.go", "PKG\\MAIN.GO")).toBe(true);
    expect(pathsReferToSameFile("main.go", "C:/workspace/pkg/main.go")).toBe(false);
  });

  it("allows basename fallback only for root-level race run targets", () => {
    expect(pathsReferToSameRunTarget("C:/workspace/main.go", "main.go")).toBe(true);
    expect(pathsReferToSameRunTarget("C:/workspace/pkg/main.go", "pkg/main.go")).toBe(true);
    expect(pathsReferToSameRunTarget("C:/workspace/pkg/main.go", "other/main.go")).toBe(false);
  });

  it("matches runtime signals by normalized location even when scope keys drift", () => {
    expect(
      runtimeSignalMatchesScope(
        runtimeSignal({
          scopeKey: "runtime:S2",
          scopeRelativePath: "pkg\\worker.go",
          scopeLine: 9,
          scopeColumn: 3,
        }),
        { scopeKey: "static:S1", filePath: "pkg/worker.go", line: 9, column: 3 }
      )
    ).toBe(true);
  });

  it("prioritizes active blocked signals with usable counterpart and stronger confidence", () => {
    const stalePath = runtimeSignal({
      threadId: 1,
      counterpartRelativePath: "other.go",
      counterpartLine: 4,
      counterpartConfidence: ConcurrencyConfidence.Confirmed,
    });
    const predicted = runtimeSignal({
      threadId: 2,
      counterpartRelativePath: "main.go",
      counterpartLine: 5,
      counterpartConfidence: ConcurrencyConfidence.Predicted,
    });
    const confirmed = runtimeSignal({
      threadId: 3,
      counterpartRelativePath: "main.go",
      counterpartLine: 6,
      counterpartConfidence: ConcurrencyConfidence.Confirmed,
    });

    expect(selectActiveBlockedSignal([stalePath, predicted, confirmed], "main.go")).toBe(
      confirmed
    );
  });

  it("parses Go file references from race output lines with Windows paths and spaces", () => {
    expect(
      extractGoFileLineReferences("C:/workspace with spaces/pkg/main.go:42 +0x123")
    ).toEqual([{ path: "C:/workspace with spaces/pkg/main.go", line: 42 }]);
  });

  it("creates race findings with confirmed confidence and stable scope metadata", () => {
    expect(toRaceFindings("main.go", [2])).toEqual([
      expect.objectContaining({
        threadId: 1,
        confidence: ConcurrencyConfidence.Confirmed,
        scopeKey: "race:main.go:2",
        scopeRelativePath: "main.go",
        scopeLine: 2,
        source: "race-detector",
      }),
    ]);
  });
});
