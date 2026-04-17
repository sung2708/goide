import { useState } from "react";
import { render, screen } from "@testing-library/react";
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

    await user.click(screen.getByRole("button", { name: /clear/i }));

    expect(screen.queryByText("line 1")).toBeNull();
    expect(screen.getByText(/Unit idle\. Standby for output\./i)).toBeInTheDocument();
  });

  it("invokes onRun when run-again is clicked", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();

    render(<BottomPanel output={[]} isRunning={false} onRun={onRun} />);

    await user.click(screen.getByRole("button", { name: /run again/i }));

    expect(onRun).toHaveBeenCalledTimes(1);
  });
});
