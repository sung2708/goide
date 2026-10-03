import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useReplacementReview } from "./useReplacementReview";
it("requires explicit review, exposes complete before/after and cancels on workspace change", async () => {
  let review!: ReturnType<typeof useReplacementReview>["review"];
  function Harness({ root }: { root: string }) { const state = useReplacementReview(root); review = state.review; return state.dialog; }
  const view = render(<Harness root="one" />); let decision!: Promise<boolean | import("../../lib/ipc/types").WorkspaceReplacementPlan[]>;
  act(() => { decision = review([{ path: "a.go", before: "original", after: "changed", occurrences: 1 }]); });
  expect(screen.getByRole("dialog", { name: "Review workspace replacements" })).toBeInTheDocument();
  expect(screen.getByLabelText("Replacement before")).toHaveTextContent("original"); expect(screen.getByLabelText("Replacement after")).toHaveTextContent("changed");
  await act(async () => { fireEvent.click(screen.getByText("Apply reviewed replacements")); }); expect(await decision).toBe(true);
  act(() => { decision = review([{ path: "b.go", before: "original", after: "changed", occurrences: 1 }]); });
  view.rerender(<Harness root="two" />); expect(await decision).toBe(false); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("excludes complete files and refuses an empty selection", async () => {
  let review!: ReturnType<typeof useReplacementReview>["review"];
  function Harness() { const state = useReplacementReview("root"); review = state.review; return state.dialog; }
  render(<Harness />);
  const plans = ["a.go", "b.go"].map(path => ({ path, before: "old", after: "new", occurrences: 1 }));
  let decision!: ReturnType<typeof review>;
  act(() => { decision = review(plans); });
  fireEvent.click(screen.getByRole("checkbox", { name: "Include a.go in replacement" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Include b.go in replacement" }));
  expect(screen.getByText("Apply reviewed replacements")).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "Include b.go in replacement" }));
  fireEvent.click(screen.getByText("Apply reviewed replacements"));
  expect(await decision).toEqual([plans[1]]);
});
