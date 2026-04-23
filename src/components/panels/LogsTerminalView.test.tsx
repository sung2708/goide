import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LogsTerminalView from "./LogsTerminalView";

const writeMock = vi.fn();
const openMock = vi.fn();
const fitMock = vi.fn();
const disposeMock = vi.fn();
const clearMock = vi.fn();

// Capture constructor options so tests can assert on them
let lastTerminalOptions: Record<string, unknown> = {};

vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn().mockImplementation((opts: Record<string, unknown>) => {
    lastTerminalOptions = opts ?? {};
    return {
      open: openMock,
      write: writeMock,
      clear: clearMock,
      loadAddon: vi.fn(),
      dispose: disposeMock,
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      cols: 120,
      rows: 40,
    };
  }),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: fitMock })),
}));

afterEach(() => {
  writeMock.mockClear();
  openMock.mockClear();
  fitMock.mockClear();
  disposeMock.mockClear();
  clearMock.mockClear();
  lastTerminalOptions = {};
});

describe("LogsTerminalView", () => {
  it("replays ANSI-colored run output into a read-only terminal", () => {
    render(
      <LogsTerminalView
        entries={[
          { runId: "run-1", line: "\x1b[32mPASS\x1b[0m", stream: "stdout" },
          { runId: "run-1", line: "\x1b[31mFAIL\x1b[0m", stream: "stderr" },
          { runId: "run-1", line: "Process exited with code 1.", stream: "exit", exitCode: 1 },
        ]}
      />
    );

    expect(openMock).toHaveBeenCalledTimes(1);
    // All entries written in one batched write call
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith(
      "\x1b[32mPASS\x1b[0m\r\n\x1b[31mFAIL\x1b[0m\r\nProcess exited with code 1.\r\n"
    );
  });

  it("opens the terminal in read-only mode (disableStdin: true)", () => {
    render(<LogsTerminalView entries={[]} />);
    expect(lastTerminalOptions.disableStdin).toBe(true);
  });

  it("writes incremental entries appended after initial mount", () => {
    const initialEntries = [
      { runId: "run-1", line: "line one", stream: "stdout" as const },
    ];
    const { rerender } = render(<LogsTerminalView entries={initialEntries} />);

    // After initial mount, one batched write with one entry
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("line one\r\n");

    writeMock.mockClear();

    // Append a second entry (same runId)
    const updatedEntries = [
      ...initialEntries,
      { runId: "run-1", line: "line two", stream: "stdout" as const },
    ];
    rerender(<LogsTerminalView entries={updatedEntries} />);

    // Only the new entry should have been written, as a single batched call
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("line two\r\n");
  });

  it("clears and replays from scratch when entries shrink (fresh run reset)", () => {
    const firstRunEntries = [
      { runId: "run-1", line: "first run line 1", stream: "stdout" as const },
      { runId: "run-1", line: "first run line 2", stream: "stdout" as const },
    ];
    const { rerender } = render(<LogsTerminalView entries={firstRunEntries} />);

    expect(writeMock).toHaveBeenCalledTimes(1);
    writeMock.mockClear();
    clearMock.mockClear();

    // Replace with a shorter array with a new runId (simulating a new run)
    const secondRunEntries = [
      { runId: "run-2", line: "second run line 1", stream: "stdout" as const },
    ];
    rerender(<LogsTerminalView entries={secondRunEntries} />);

    // Terminal must be cleared before replaying
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("second run line 1\r\n");
  });

  it("clears and replays when runId changes even if entry count is the same or greater", () => {
    const firstRunEntries = [
      { runId: "run-1", line: "first run line 1", stream: "stdout" as const },
      { runId: "run-1", line: "first run line 2", stream: "stdout" as const },
    ];
    const { rerender } = render(<LogsTerminalView entries={firstRunEntries} />);

    expect(writeMock).toHaveBeenCalledTimes(1);
    writeMock.mockClear();
    clearMock.mockClear();

    // New run with equal entry count — same length but different runId
    const secondRunSameLength = [
      { runId: "run-2", line: "second run line 1", stream: "stdout" as const },
      { runId: "run-2", line: "second run line 2", stream: "stdout" as const },
    ];
    rerender(<LogsTerminalView entries={secondRunSameLength} />);

    // Must clear and replay, not treat as an incremental append
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("second run line 1\r\nsecond run line 2\r\n");

    writeMock.mockClear();
    clearMock.mockClear();

    // New run with greater entry count but again a different runId
    const thirdRunMoreEntries = [
      { runId: "run-3", line: "third run line 1", stream: "stdout" as const },
      { runId: "run-3", line: "third run line 2", stream: "stdout" as const },
      { runId: "run-3", line: "third run line 3", stream: "stdout" as const },
    ];
    rerender(<LogsTerminalView entries={thirdRunMoreEntries} />);

    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith(
      "third run line 1\r\nthird run line 2\r\nthird run line 3\r\n"
    );
  });
});
