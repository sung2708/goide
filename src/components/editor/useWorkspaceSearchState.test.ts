import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readWorkspaceFileMock = vi.fn();
const writeWorkspaceFileMock = vi.fn();
const searchWorkspaceTextMock = vi.fn();
const previewWorkspaceReplacementMock = vi.fn();
const transaction = async (operation: () => Promise<void>) => { await operation(); return true; };

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
    writeWorkspaceFile: (...args: unknown[]) => writeWorkspaceFileMock(...args),
    searchWorkspaceText: (...args: unknown[]) => searchWorkspaceTextMock(...args),
    previewWorkspaceReplacement: (...args: unknown[]) => previewWorkspaceReplacementMock(...args),
  };
});

import { useWorkspaceSearchState } from "./useWorkspaceSearchState";

describe("useWorkspaceSearchState — replace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "line1\nfoo bar\nline3\n" });
    writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    searchWorkspaceTextMock.mockResolvedValue({ ok: true, data: [{ relativePath: "main.go", matches: [{ line: 2, preview: "foo bar" }] }] });
    previewWorkspaceReplacementMock.mockImplementation(async (request) => {
      const plans = [];
      for (const file of request.files) {
        const read = await readWorkspaceFileMock(request.workspaceRoot, file.relativePath);
        const lines = read.data.split("\n");
        for (const match of file.matches) lines[match.line - 1] = lines[match.line - 1].replace(request.query, () => request.replacement);
        plans.push({ path: file.relativePath, before: read.data, after: lines.join("\n"), occurrences: file.matches.length });
      }
      return { ok: true, data: plans };
    });
  });

  it("replaceMatch reads the file, replaces text on the given line, and writes it back", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState("C:/workspace", { transaction }));
    await act(async () => { await result.current.handleWorkspaceSearch("foo"); });

    await act(async () => {
      await result.current.replaceMatch("main.go", 2, "foo", "baz");
    });

    expect(readWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "main.go");
    expect(writeWorkspaceFileMock).toHaveBeenCalledWith(
      "C:/workspace",
      "main.go",
      "line1\nbaz bar\nline3\n",
      "line1\nfoo bar\nline3\n"
    );
  });

  it("replaceMatch is a no-op when searchText is not on the specified line", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState("C:/workspace", { transaction }));

    await act(async () => {
      await result.current.replaceMatch("main.go", 1, "foo", "baz");
    });

    expect(writeWorkspaceFileMock).not.toHaveBeenCalled();
  });

  it("replaceAllMatches replaces every match in every result file and refreshes search", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState("C:/workspace", { transaction }));

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
    expect(writeWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "a.go", "bar\n", "foo\n");
    expect(writeWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "b.go", "bar\n", "foo\n");
    // After replace, search is re-run with same query
    expect(searchWorkspaceTextMock).toHaveBeenLastCalledWith("C:/workspace", "foo", expect.any(Object), expect.any(String));
  });

  it("replaceMatch does nothing when workspacePath is null", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState(null));
    await act(async () => {
      await result.current.replaceMatch("main.go", 1, "foo", "bar");
    });
    expect(readWorkspaceFileMock).not.toHaveBeenCalled();
  });

  it("replaceMatch treats replacement string literally without special pattern interpretation", async () => {
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "line1\nfoo bar\nline3\n" });
    const { result } = renderHook(() => useWorkspaceSearchState("C:/workspace", { transaction }));
    await act(async () => { await result.current.handleWorkspaceSearch("foo"); });

    await act(async () => {
      await result.current.replaceMatch("main.go", 2, "foo", "$&");
    });

    expect(writeWorkspaceFileMock).toHaveBeenCalledWith(
      "C:/workspace",
      "main.go",
      "line1\n$& bar\nline3\n",
      "line1\nfoo bar\nline3\n"
    );
  });

  it("replaceAllMatches does nothing when workspacePath is null", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState(null));
    await act(async () => {
      await result.current.replaceAllMatches("foo", "bar");
    });
    expect(readWorkspaceFileMock).not.toHaveBeenCalled();
    expect(writeWorkspaceFileMock).not.toHaveBeenCalled();
  });

  it("replaceMatch re-runs the search to refresh results after writing", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState("C:/workspace", { transaction }));
    await act(async () => { await result.current.handleWorkspaceSearch("foo"); });

    await act(async () => {
      await result.current.replaceMatch("main.go", 2, "foo", "baz");
    });

    // After writing, search should be re-run with the same searchText
    expect(searchWorkspaceTextMock).toHaveBeenCalledWith("C:/workspace", "foo", expect.any(Object), expect.any(String));
  });
});
