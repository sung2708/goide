import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import QuickPick from "./QuickPick";
it("returns focus to the original surface after a nested picker closes", async () => {
  function Harness() {
    const [stage, setStage] = useState(0);
    return <><button onClick={() => setStage(1)}>Origin</button>{stage > 0 && <QuickPick key={stage} title={`Picker ${stage}`} inputLabel="Picker query" placeholder="Query" query="" onQuery={() => {}} items={[{ id: "next", label: "Next" }]} onChoose={() => setStage(2)} onClose={() => setStage(0)} />}</>;
  }
  render(<Harness />); const origin = screen.getByRole("button", { name: "Origin" }); origin.focus(); fireEvent.click(origin);
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" }); expect(screen.getByRole("dialog", { name: "Picker 2" })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" }); await waitFor(() => expect(origin).toHaveFocus());
});
