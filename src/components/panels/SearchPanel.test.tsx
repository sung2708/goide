import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("submits Match Case to native search instead of filtering incomplete results locally", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(
      <SearchPanel
        results={[
          {
            relativePath: "main.go",
            matches: [
              { line: 5, preview: "mu.Lock()" },
              { line: 8, preview: "MU.LOCK()" },
            ],
          },
        ]}
        loading={false}
        onSearch={onSearch}
        onOpenResult={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText(/^search$/i), "mu.Lock");
    await user.click(screen.getByRole("button", { name: /match case/i }));

    expect(screen.getByText("mu.Lock")).toBeInTheDocument();
    await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith("mu.Lock", expect.objectContaining({ matchCase: true })));
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

  it("submits search immediately and stops Enter from bubbling out of the search input", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const onParentKeyDown = vi.fn();

    render(
      <div onKeyDown={onParentKeyDown}>
        <SearchPanel
          results={[]}
          loading={false}
          onSearch={onSearch}
          onOpenResult={vi.fn()}
        />
      </div>
    );

    const input = screen.getByPlaceholderText(/^search$/i);
    await user.type(input, "  mutex  ");
    onSearch.mockClear();
    onParentKeyDown.mockClear();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSearch).toHaveBeenCalledWith("  mutex  ", expect.objectContaining({ matchCase: false }));
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });

  it("prevents Enter from reaching native window keydown listeners", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const onWindowKeyDown = vi.fn();

    window.addEventListener("keydown", onWindowKeyDown);

    render(
      <SearchPanel
        results={[]}
        loading={false}
        onSearch={onSearch}
        onOpenResult={vi.fn()}
      />
    );

    try {
      const input = screen.getByPlaceholderText(/^search$/i);
      await user.type(input, "mutex");
      onSearch.mockClear();
      onWindowKeyDown.mockClear();

      fireEvent.keyDown(input, { key: "Enter" });

      expect(onSearch).toHaveBeenCalledWith("mutex", expect.objectContaining({ matchCase: false }));
      expect(onWindowKeyDown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", onWindowKeyDown);
    }
  });

  it("prevents Enter from reaching native window keyup listeners", async () => {
    const user = userEvent.setup();
    const onWindowKeyUp = vi.fn();

    window.addEventListener("keyup", onWindowKeyUp);

    render(
      <SearchPanel
        results={[]}
        loading={false}
        onSearch={vi.fn()}
        onOpenResult={vi.fn()}
      />
    );

    try {
      const input = screen.getByPlaceholderText(/^search$/i);
      await user.type(input, "mutex");
      onWindowKeyUp.mockClear();

      fireEvent.keyUp(input, { key: "Enter" });

      expect(onWindowKeyUp).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keyup", onWindowKeyUp);
    }
  });

  it("cycles through matches and opens them on Enter", async () => {
    const user = userEvent.setup();
    const onOpenResult = vi.fn();

    render(
      <SearchPanel
        results={[
          {
            relativePath: "main.go",
            matches: [
              { line: 5, preview: "mu.Lock()" },
              { line: 8, preview: "mu.Lock()" },
            ],
          },
        ]}
        loading={false}
        onSearch={vi.fn()}
        onOpenResult={onOpenResult}
      />
    );

    const input = screen.getByPlaceholderText(/^search$/i);
    await user.type(input, "mu.Lock");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onOpenResult).toHaveBeenCalledWith("main.go", 8, expect.any(String));
  });

  it("keeps search input focus and does not open files merely while typing", async () => {
    const user = userEvent.setup();
    const onOpenResult = vi.fn();

    render(
      <SearchPanel
        results={[
          {
            relativePath: "main.go",
            matches: [
              { line: 5, preview: "mu.Lock()" },
              { line: 8, preview: "mu.Lock()" },
            ],
          },
        ]}
        loading={false}
        onSearch={vi.fn()}
        onOpenResult={onOpenResult}
      />
    );

    await user.type(screen.getByPlaceholderText(/^search$/i), "mu.Lock");

    expect(onOpenResult).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/^search$/i)).toHaveFocus();
  });

  it("highlights native UTF-16 ranges and navigates the exact matched column", async () => {
    const user = userEvent.setup(), onOpenResult = vi.fn();
    render(<SearchPanel results={[{ relativePath: "Việt Nam.go", matches: [{ line: 1, preview: "😀 tên tên", ranges: [{ from: 3, to: 6 }, { from: 7, to: 10 }] }] }]} onSearch={vi.fn()} onOpenResult={onOpenResult} />);
    await user.type(screen.getByPlaceholderText(/^search$/i), "(tên)");
    expect([...document.querySelectorAll("mark")].map(node => node.textContent)).toEqual(["tên", "tên"]);
    fireEvent.click(screen.getByRole("button", { name: /😀/ }));
    expect(onOpenResult).toHaveBeenCalledWith("Việt Nam.go", 1, expect.any(String), 4, { from: 3, to: 6, preview: "😀 tên tên" });
  });
  it("visits every occurrence on the same line forward and backward, preserving whitespace in the query", async () => {
    const user = userEvent.setup(), onOpenResult = vi.fn();
    render(<SearchPanel results={[{ relativePath: "main.go", matches: [{ line: 3, preview: " a  a ", ranges: [{ from: 0, to: 3 }, { from: 3, to: 6 }] }] }]} onSearch={vi.fn()} onOpenResult={onOpenResult} />);
    const input = screen.getByPlaceholderText(/^search$/i);
    await user.type(input, " a ");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onOpenResult).toHaveBeenLastCalledWith("main.go", 3, " a ", 4, { from: 3, to: 6, preview: " a  a " });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onOpenResult).toHaveBeenLastCalledWith("main.go", 3, " a ", 1, { from: 0, to: 3, preview: " a  a " });
  });

});
