import { renderHook, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { analyzeActiveFileConcurrency } from "../../lib/ipc/client";
import { ConcurrencyConfidence } from "../../lib/ipc/types";
import { useLensSignals } from "./useLensSignals";

vi.mock("../../lib/ipc/client", () => ({
  analyzeActiveFileConcurrency: vi.fn(),
}));

function useWorkspaceRef(value: string | null) {
  const workspacePathRef = useRef<string | null>(value);
  workspacePathRef.current = value;
  return workspacePathRef;
}

describe("useLensSignals", () => {
  it("runs analysis only for active Go files", async () => {
    const analyzeMock = vi.mocked(analyzeActiveFileConcurrency);
    analyzeMock.mockResolvedValue({
      ok: true,
      data: [],
    });

    const { rerender } = renderHook(
      ({ workspacePath, activeFilePath }) => {
        const workspacePathRef = useWorkspaceRef(workspacePath);
        return useLensSignals({
          workspacePath,
          activeFilePath,
          workspacePathRef,
        });
      },
      {
        initialProps: {
          workspacePath: "C:/repo",
          activeFilePath: "README.md",
        },
      }
    );

    await waitFor(() => {
      expect(analyzeMock).not.toHaveBeenCalled();
    });

    rerender({
      workspacePath: "C:/repo",
      activeFilePath: "main.go",
    });

    await waitFor(() => {
      expect(analyzeMock).toHaveBeenCalledTimes(1);
      expect(analyzeMock).toHaveBeenCalledWith({
        workspaceRoot: "C:/repo",
        relativePath: "main.go",
      });
    });
  });

  it("ignores stale responses after workspace switch", async () => {
    const analyzeMock = vi.mocked(analyzeActiveFileConcurrency);
    type AnalyzeResponse = Awaited<
      ReturnType<typeof analyzeActiveFileConcurrency>
    >;
    let resolveFirst: (value: AnalyzeResponse) => void = () => undefined;
    const firstResponse = new Promise<AnalyzeResponse>((resolve) => {
      resolveFirst = resolve;
    });

    analyzeMock.mockImplementationOnce(() => firstResponse);
    analyzeMock.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          kind: "select",
          line: 4,
          column: 2,
          symbol: null,
          confidence: ConcurrencyConfidence.Predicted,
        },
      ],
    });

    const { result, rerender } = renderHook(
      ({ workspacePath, activeFilePath }) => {
        const workspacePathRef = useWorkspaceRef(workspacePath);
        return useLensSignals({
          workspacePath,
          activeFilePath,
          workspacePathRef,
        });
      },
      {
        initialProps: {
          workspacePath: "C:/repo-a",
          activeFilePath: "a.go",
        },
      }
    );

    rerender({
      workspacePath: "C:/repo-b",
      activeFilePath: "b.go",
    });

    resolveFirst({
      ok: true,
      data: [
        {
          kind: "channel",
          line: 1,
          column: 1,
          symbol: null,
          confidence: ConcurrencyConfidence.Predicted,
        },
      ],
    });

    await waitFor(() => {
      expect(result.current.detectedConstructs).toHaveLength(1);
      expect(result.current.detectedConstructs[0]?.kind).toBe("select");
    });
  });

  it("clears constructs when analysis fails after switching to a different file", async () => {
    const analyzeMock = vi.mocked(analyzeActiveFileConcurrency);
    analyzeMock.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          kind: "channel",
          line: 9,
          column: 1,
          symbol: "ch",
          confidence: ConcurrencyConfidence.Predicted,
        },
      ],
    });
    analyzeMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "analysis_failed", message: "analysis failed" },
    });

    const { result, rerender } = renderHook(
      ({ workspacePath, activeFilePath }) => {
        const workspacePathRef = useWorkspaceRef(workspacePath);
        return useLensSignals({
          workspacePath,
          activeFilePath,
          workspacePathRef,
        });
      },
      {
        initialProps: {
          workspacePath: "C:/repo",
          activeFilePath: "a.go",
        },
      }
    );

    await waitFor(() => {
      expect(result.current.detectedConstructs).toHaveLength(1);
      expect(result.current.detectedConstructs[0]?.line).toBe(9);
    });

    rerender({
      workspacePath: "C:/repo",
      activeFilePath: "b.go",
    });

    await waitFor(() => {
      expect(result.current.analysisError).toBe("analysis failed");
      expect(result.current.detectedConstructs).toHaveLength(0);
    });
  });
});
