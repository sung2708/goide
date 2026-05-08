import { ConcurrencyConfidence } from "../../lib/ipc/types";
import type { RuntimeSignal } from "../../lib/ipc/types";

export type RaceFinding = RuntimeSignal & {
  source: "race-detector";
};

export function mapGitStatus(statusToken: string): "modified" | "untracked" | "staged" {
  const token = statusToken.trim();
  if (token.startsWith("??")) {
    return "untracked";
  }
  const indexStatus = token[0] ?? " ";
  const worktreeStatus = token[1] ?? " ";
  if (indexStatus !== " " && indexStatus !== "?") {
    return "staged";
  }
  if (worktreeStatus !== " " && worktreeStatus !== "?") {
    return "modified";
  }
  return "modified";
}

export function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").trim();
}

export function normalizeWorkspaceRoot(path: string): string {
  return normalizeRelativePath(path).toLowerCase();
}

export function pathsReferToSameFile(pathA: string, pathB: string): boolean {
  const normalizedA = normalizeRelativePath(pathA).toLowerCase();
  const normalizedB = normalizeRelativePath(pathB).toLowerCase();
  if (normalizedA === normalizedB) {
    return true;
  }

  const segmentsA = normalizedA.split("/").filter(Boolean);
  const segmentsB = normalizedB.split("/").filter(Boolean);
  const shorter = segmentsA.length <= segmentsB.length ? segmentsA : segmentsB;
  const longer = segmentsA.length <= segmentsB.length ? segmentsB : segmentsA;

  if (shorter.length < 2) {
    return false;
  }

  for (let index = 1; index <= shorter.length; index += 1) {
    if (shorter[shorter.length - index] !== longer[longer.length - index]) {
      return false;
    }
  }
  return true;
}

export function pathsReferToSameRunTarget(pathFromOutput: string, runTargetPath: string): boolean {
  if (pathsReferToSameFile(pathFromOutput, runTargetPath)) {
    return true;
  }

  const normalizedTarget = normalizeRelativePath(runTargetPath).toLowerCase();
  const targetSegments = normalizedTarget.split("/").filter(Boolean);
  if (targetSegments.length !== 1) {
    return false;
  }

  const normalizedOutput = normalizeRelativePath(pathFromOutput).toLowerCase();
  const outputSegments = normalizedOutput.split("/").filter(Boolean);
  const outputBasename = outputSegments[outputSegments.length - 1] ?? "";
  return outputBasename === targetSegments[0];
}

export function runtimeSignalMatchesScope(
  signal: RuntimeSignal,
  scope: {
    scopeKey: string | null;
    filePath: string;
    line: number;
    column: number;
  }
): boolean {
  const matchLine = signal.scopeLine ?? signal.line;
  const matchColumn = signal.scopeColumn ?? signal.column;

  return (
    normalizeRelativePath(signal.scopeRelativePath ?? signal.relativePath) ===
      normalizeRelativePath(scope.filePath) &&
    matchLine === scope.line &&
    matchColumn === scope.column
  );
}

export function confidenceRank(confidence?: ConcurrencyConfidence | null): number {
  switch ((confidence ?? "").toLowerCase()) {
    case "confirmed":
      return 3;
    case "likely":
      return 2;
    case "predicted":
      return 1;
    default:
      return 0;
  }
}

export function isUsableRuntimeCounterpart(
  signal: RuntimeSignal,
  activeFilePath: string
): boolean {
  const line = signal.counterpartLine ?? null;
  const hasValidLine = Number.isInteger(line) && line !== null && line >= 1;
  if (!hasValidLine) {
    return false;
  }
  const counterpartPath = signal.counterpartRelativePath ?? null;
  return (
    counterpartPath === null || pathsReferToSameFile(counterpartPath, activeFilePath)
  );
}

export function selectActiveBlockedSignal(
  blockedCandidates: RuntimeSignal[],
  activeFilePath: string
): RuntimeSignal | null {
  if (blockedCandidates.length === 0) {
    return null;
  }

  const sorted = [...blockedCandidates].sort((left, right) => {
    const leftUsable = isUsableRuntimeCounterpart(left, activeFilePath) ? 1 : 0;
    const rightUsable = isUsableRuntimeCounterpart(right, activeFilePath) ? 1 : 0;
    if (leftUsable !== rightUsable) {
      return rightUsable - leftUsable;
    }

    const leftConfidence = confidenceRank(left.counterpartConfidence ?? left.confidence);
    const rightConfidence = confidenceRank(right.counterpartConfidence ?? right.confidence);
    if (leftConfidence !== rightConfidence) {
      return rightConfidence - leftConfidence;
    }

    const leftHasCounterpartLine =
      Number.isInteger(left.counterpartLine) && (left.counterpartLine ?? 0) >= 1 ? 1 : 0;
    const rightHasCounterpartLine =
      Number.isInteger(right.counterpartLine) && (right.counterpartLine ?? 0) >= 1 ? 1 : 0;
    if (leftHasCounterpartLine !== rightHasCounterpartLine) {
      return rightHasCounterpartLine - leftHasCounterpartLine;
    }

    const leftHasCorrelationId = left.correlationId ? 1 : 0;
    const rightHasCorrelationId = right.correlationId ? 1 : 0;
    if (leftHasCorrelationId !== rightHasCorrelationId) {
      return rightHasCorrelationId - leftHasCorrelationId;
    }

    if (left.threadId !== right.threadId) {
      return left.threadId - right.threadId;
    }
    return left.waitReason.localeCompare(right.waitReason);
  });
  return sorted[0] ?? null;
}

export function isGoFile(path: string | null): path is string {
  return typeof path === "string" && path.toLowerCase().endsWith(".go");
}

export function extractGoFileLineReferences(text: string): Array<{
  path: string;
  line: number;
}> {
  const matches = text.matchAll(/((?:[A-Za-z]:)?[^:\r\n]+?\.go):(\d+)/g);
  const refs: Array<{ path: string; line: number }> = [];
  for (const match of matches) {
    const filePath = match[1] ?? "";
    const line = Number(match[2]);
    if (!filePath || !Number.isInteger(line) || line < 1) {
      continue;
    }
    refs.push({ path: filePath, line });
  }
  return refs;
}

export function toRaceFindings(relativePath: string, lines: number[]): RaceFinding[] {
  return lines.map((line, index) => ({
    threadId: index + 1,
    status: "data race",
    waitReason: "data race",
    confidence: ConcurrencyConfidence.Confirmed,
    scopeKey: `race:${relativePath}:${line}`,
    scopeRelativePath: relativePath,
    scopeLine: line,
    scopeColumn: 1,
    relativePath,
    line,
    column: 1,
    source: "race-detector",
  }));
}
