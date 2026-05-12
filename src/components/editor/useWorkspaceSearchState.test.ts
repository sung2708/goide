import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readWorkspaceFileMock = vi.fn();
const writeWorkspaceFileMock = vi.fn();
const searchWorkspaceTextMock = vi.fn();

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
    writeWorkspaceFile: (...args: unknown[]) => writeWorkspaceFileMock(...args),
    searchWorkspaceText: (...args: unknown[]) => searchWorkspaceTextMock(...args),
  };
});

import { useWorkspaceSearchState } from "./useWorkspaceSearchState";

describe("useWorkspaceSearchState — replace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "line1\nfoo bar\nline3\n" });
    writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    searchWorkspaceTextMock.mockResolvedValue({ ok: true, data: [] });
  });

  it("replaceMatch reads the file, replaces text on the given line, and writes it back", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState("C:/workspace"));

    await act(async () => {
      await result.current.replaceMatch("main.go", 2, "foo", "baz");
    });

    expect(readWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "main.go");
    expect(writeWorkspaceFileMock).toHaveBeenCalledWith(
      "C:/workspace",
      "main.go",
      "line1\nbaz bar\nline3\n"
    );
  });

  it("replaceMatch is a no-op when searchText is not on the specified line", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState("C:/workspace"));

    await act(async () => {
      await result.current.replaceMatch("main.go", 1, "foo", "baz");
    });

    expect(writeWorkspaceFileMock).not.toHaveBeenCalled();
  });

  it("replaceAllMatches replaces every match in every result file and refreshes search", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState("C:/workspace"));

    // Seed results by running a search first
    searchWorkspaceTextMock.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          relativePath: "a.go",
          matches: [{ line: 1, preview: "foo" }],
        },
        {
          relativePath: "b.go",
          matches: [{ line: 1, preview: "foo" }],
        },
      ],
    });
    await act(async () => {
      await result.current.handleWorkspaceSearch("foo");
    });

    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "foo\n" });

    await act(async () => {
      await result.current.replaceAllMatches("foo", "bar");
    });

    expect(writeWorkspaceFileMock).toHaveBeenCalledTimes(2);
    // After replace, search is re-run with same query
    expect(searchWorkspaceTextMock).toHaveBeenLastCalledWith("C:/workspace", "foo");
  });

  it("replaceMatch does nothing when workspacePath is null", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState(null));
    await act(async () => {
      await result.current.replaceMatch("main.go", 1, "foo", "bar");
    });
    expect(readWorkspaceFileMock).not.toHaveBeenCalled();
  });
});
