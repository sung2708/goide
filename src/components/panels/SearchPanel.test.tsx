import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SearchPanel from "./SearchPanel";

describe("SearchPanel", () => {
  it("renders the search input", () => {
    render(
      <SearchPanel
        results={[]}
        loading={false}
        onSearch={vi.fn()}
        onOpenResult={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText(/^search$/i)).toBeInTheDocument();
  });

  it("renders the replace input", () => {
    render(
      <SearchPanel
        results={[]}
        loading={false}
        onSearch={vi.fn()}
        onOpenResult={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText(/^replace$/i)).toBeInTheDocument();
  });

  it("displays results when provided", () => {
    render(
      <SearchPanel
        results={[
          {
            relativePath: "main.go",
            matches: [{ line: 5, preview: "  mu.Lock()" }],
          },
        ]}
        loading={false}
        onSearch={vi.fn()}
        onOpenResult={vi.fn()}
      />
    );

    expect(screen.getByText("main.go")).toBeInTheDocument();
    expect(screen.getByText(/mu\.Lock\(\)/)).toBeInTheDocument();
  });

  it("calls onReplaceMatch with file, line, query, and replaceQuery when Replace is clicked on a match", async () => {
    const user = userEvent.setup();
    const onReplaceMatch = vi.fn();

    render(
      <SearchPanel
        results={[
          {
            relativePath: "main.go",
            matches: [{ line: 5, preview: "  mu.Lock()" }],
          },
        ]}
        loading={false}
        onSearch={vi.fn()}
        onOpenResult={vi.fn()}
        onReplaceMatch={onReplaceMatch}
        onReplaceAll={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText(/^search$/i), "mu.Lock");
    await user.type(screen.getByPlaceholderText(/^replace$/i), "mu.Unlock");

    await user.click(screen.getByRole("button", { name: /replace match in main\.go line 5/i }));

    expect(onReplaceMatch).toHaveBeenCalledWith("main.go", 5, "mu.Lock", "mu.Unlock");
  });

  it("calls onReplaceAll with query and replaceQuery when Replace All is clicked", async () => {
    const user = userEvent.setup();
    const onReplaceAll = vi.fn();

    render(
      <SearchPanel
        results={[
          { relativePath: "main.go", matches: [{ line: 5, preview: "mu.Lock()" }] },
        ]}
        loading={false}
        onSearch={vi.fn()}
        onOpenResult={vi.fn()}
        onReplaceMatch={vi.fn()}
        onReplaceAll={onReplaceAll}
      />
    );

    await user.type(screen.getByPlaceholderText(/^search$/i), "mu.Lock");
    await user.type(screen.getByPlaceholderText(/^replace$/i), "mu.Unlock");

    await user.click(screen.getByRole("button", { name: /replace all/i }));

    expect(onReplaceAll).toHaveBeenCalledWith("mu.Lock", "mu.Unlock");
  });

  it("does not show Replace All button when there are no results", async () => {
    const user = userEvent.setup();
    render(
      <SearchPanel
        results={[]}
        loading={false}
        onSearch={vi.fn()}
        onOpenResult={vi.fn()}
        onReplaceAll={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText(/^search$/i), "mu.Lock");
    expect(screen.queryByRole("button", { name: /replace all/i })).toBeNull();
  });

  it("focuses the search input when focusTrigger increments", async () => {
    const { rerender } = render(
      <SearchPanel
        results={[]}
        loading={false}
        onSearch={vi.fn()}
        onOpenResult={vi.fn()}
        focusTrigger={0}
      />
    );

    const input = screen.getByPlaceholderText(/^search$/i);
    expect(document.activeElement).not.toBe(input);

    rerender(
      <SearchPanel
        results={[]}
        loading={false}
        onSearch={vi.fn()}
        onOpenResult={vi.fn()}
        focusTrigger={1}
      />
    );

    expect(document.activeElement).toBe(input);
  });
});
