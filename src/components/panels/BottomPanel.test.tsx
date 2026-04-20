import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import BottomPanel from "./BottomPanel";

describe("BottomPanel", () => {
  it("renders streamed output lines with stream-specific styling", () => {
    render(
      <BottomPanel
        output={[
          { runId: "r1", line: "stdout line", stream: "stdout" },
          { runId: "r1", line: "stderr line", stream: "stderr" },
          { runId: "r1", line: "Process exited with code 1.", stream: "exit", exitCode: 1 },
        ]}
      />
    );

    expect(screen.getByText("stdout line")).toBeInTheDocument();
    expect(screen.getByText("stderr line")).toBeInTheDocument();
    expect(screen.getByText("Process exited with code 1.")).toBeInTheDocument();
  });

  it("clears output on demand", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [output, setOutput] = useState([
        { runId: "r1", line: "line 1", stream: "stdout" as const },
      ]);
      return <BottomPanel output={output} onClear={() => setOutput([])} />;
    }

    render(<Harness />);

    expect(screen.getByText("line 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    await user.click(screen.getAllByRole("button", { name: /^clear$/i })[1]);

    expect(screen.queryByText("line 1")).toBeNull();
    expect(screen.getByText(/Waiting for output/i)).toBeInTheDocument();
  });

  it("closes the clear confirmation without clearing output", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(
      <BottomPanel
        output={[{ runId: "r1", line: "line 1", stream: "stdout" }]}
        onClear={onClear}
      />
    );

    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(screen.getByRole("alertdialog", { name: /clear output\?/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("alertdialog", { name: /clear output\?/i })).toBeNull();
    expect(screen.getByText("line 1")).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("closes the clear confirmation with Escape and backdrop click", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(
      <BottomPanel
        output={[{ runId: "r1", line: "line 1", stream: "stdout" }]}
        onClear={onClear}
      />
    );

    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog", { name: /clear output\?/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    fireEvent.click(screen.getByRole("alertdialog", { name: /clear output\?/i }));

    expect(screen.queryByRole("alertdialog", { name: /clear output\?/i })).toBeNull();
    expect(screen.getByText("line 1")).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("invokes onRun when run-again is clicked", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();

    render(<BottomPanel output={[]} isRunning={false} onRun={onRun} />);

    await user.click(screen.getByRole("button", { name: /run again/i }));

    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("invokes onRunWithRace when run-race is clicked", async () => {
    const user = userEvent.setup();
    const onRunWithRace = vi.fn();

    render(
      <BottomPanel
        output={[]}
        isRunning={false}
        onRunWithRace={onRunWithRace}
        canRunWithRace
      />
    );

    await user.click(screen.getByRole("button", { name: /run race/i }));

    expect(onRunWithRace).toHaveBeenCalledTimes(1);
  });

  it("keeps the panel height bounded for long output", () => {
    render(<BottomPanel output={[]} />);

    expect(screen.getByTestId("bottom-panel")).toHaveClass("max-h-[40vh]");
    expect(screen.getByTestId("bottom-panel")).toHaveClass("min-h-[11rem]");
  });
});
