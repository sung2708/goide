/**
 * TerminalSurface tests — focuses on the init-failure fallback path.
 *
 * When the xterm Terminal constructor, loadAddon, or open() throws, the
 * component must render a local inline error message rather than propagating
 * the exception to the React tree (which would unmount the entire subtree).
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use inline factory with vi.fn() so hoisting works correctly.
vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    write: vi.fn(),
    loadAddon: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    cols: 120,
    rows: 40,
  })),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// Import after mocks are in place.
// We import the mocked constructors and cast them to vi mock shape.
import { Terminal as TerminalAny } from "@xterm/xterm";
import { FitAddon as FitAddonAny } from "@xterm/addon-fit";
import TerminalSurface from "./TerminalSurface";

// Typed as vi mock functions (they are, due to vi.mock factory above).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockedTerminal = TerminalAny as any as { mockImplementation: (impl: () => any) => void; mockReset: () => void; mockClear: () => void };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockedFitAddon = FitAddonAny as any as { mockImplementation: (impl: () => any) => void; mockReset: () => void; mockClear: () => void };

/** Returns a partial Terminal mock instance. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTerminalInstance(overrides: Record<string, any> = {}): any {
  return {
    open: overrides.open ?? vi.fn(),
    write: vi.fn(),
    loadAddon: overrides.loadAddon ?? vi.fn(),
    dispose: overrides.dispose ?? vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    cols: 120,
    rows: 40,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFitAddonInstance(): any {
  return { fit: vi.fn(), dispose: vi.fn() };
}

describe("TerminalSurface — default terminal options", () => {
  afterEach(() => {
    MockedTerminal.mockReset();
    MockedFitAddon.mockReset();
    MockedTerminal.mockImplementation(() => makeTerminalInstance());
    MockedFitAddon.mockImplementation(() => makeFitAddonInstance());
  });

  it("constructs terminal with IDE-aligned default options", () => {
    // Capture the options passed to the Terminal constructor
    let capturedOptions: Record<string, unknown> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MockedTerminal.mockImplementation((...args: any[]) => {
      capturedOptions = args[0] as Record<string, unknown>;
      return makeTerminalInstance();
    });
    MockedFitAddon.mockImplementation(() => makeFitAddonInstance());

    render(<TerminalSurface />);

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions?.allowTransparency).toBe(false);
    expect(capturedOptions?.drawBoldTextInBrightColors).toBe(false);
    expect(capturedOptions?.minimumContrastRatio).toBe(4.5);
    expect(capturedOptions?.fontSize).toBe(13);
    expect(capturedOptions?.lineHeight).toBe(1.35);
    expect(capturedOptions?.letterSpacing).toBe(0);
    expect(capturedOptions?.fontFamily).toBe('"Cascadia Mono", "Cascadia Code", "Fira Code", monospace');
    expect(capturedOptions?.scrollback).toBe(10000);
    expect((capturedOptions?.theme as Record<string, unknown>)?.background).toBe("#11111b");
    expect((capturedOptions?.theme as Record<string, unknown>)?.selectionBackground).toBe("#45475a");
  });
});

describe("TerminalSurface — fit scheduling", () => {
  afterEach(() => {
    MockedTerminal.mockReset();
    MockedFitAddon.mockReset();
    MockedTerminal.mockImplementation(() => makeTerminalInstance());
    MockedFitAddon.mockImplementation(() => makeFitAddonInstance());
  });

  it("schedules a fit via requestAnimationFrame after mount", () => {
    const rafQueue: FrameRequestCallback[] = [];
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback): number => {
        rafQueue.push(cb);
        return rafQueue.length;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const fitFn = vi.fn();
    MockedFitAddon.mockImplementation(() => ({ fit: fitFn, dispose: vi.fn() }));
    MockedTerminal.mockImplementation(() => makeTerminalInstance());

    try {
      render(<TerminalSurface />);

      // A requestAnimationFrame should have been scheduled for the post-open fit
      expect(rafQueue.length).toBeGreaterThanOrEqual(1);

      // Before frame fires, fit should not have run yet
      expect(fitFn).not.toHaveBeenCalled();

      // Fire the first frame
      rafQueue[0](16);

      expect(fitFn).toHaveBeenCalledTimes(1);
    } finally {
      rafSpy.mockRestore();
      vi.spyOn(window, "cancelAnimationFrame").mockRestore();
    }
  });

  it("schedules one fit per frame on resize observer notification and calls onResize after fit", () => {
    // Use a wrapper object to avoid TypeScript narrowing issues with reassignable
    // callback variables.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const observer: { callback: ((...args: any[]) => void) | null } = { callback: null };

    // Intercept ResizeObserver to capture the callback
    const OriginalResizeObserver = window.ResizeObserver;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockResizeObserver = vi.fn((callback: (...args: any[]) => void) => {
      observer.callback = callback;
      return {
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
      };
    });
    window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    const rafQueue: FrameRequestCallback[] = [];
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback): number => {
        rafQueue.push(cb);
        return rafQueue.length;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const fitFn = vi.fn();
    const instance = makeTerminalInstance();
    instance.cols = 80;
    instance.rows = 24;
    MockedFitAddon.mockImplementation(() => ({ fit: fitFn, dispose: vi.fn() }));
    MockedTerminal.mockImplementation(() => instance);

    const onResize = vi.fn();

    try {
      render(<TerminalSurface onResize={onResize} />);

      // Clear any mount-time RAF entries (fit-after-open)
      const mountFrameCount = rafQueue.length;
      // Flush mount frames
      for (let i = 0; i < mountFrameCount; i++) {
        rafQueue[i](16);
      }
      fitFn.mockClear();
      onResize.mockClear();
      rafQueue.splice(0);

      // Simulate two rapid resize observer notifications
      observer.callback?.([]);
      observer.callback?.([]);

      // Only one RAF should be queued (debounced / one-per-frame)
      expect(rafQueue.length).toBe(1);

      // Before frame fires, fit and onResize should not have been called
      expect(fitFn).not.toHaveBeenCalled();
      expect(onResize).not.toHaveBeenCalled();

      // Fire the frame
      rafQueue[0](16);

      expect(fitFn).toHaveBeenCalledTimes(1);
      expect(onResize).toHaveBeenCalledTimes(1);
      expect(onResize).toHaveBeenCalledWith(80, 24);
    } finally {
      rafSpy.mockRestore();
      vi.spyOn(window, "cancelAnimationFrame").mockRestore();
      window.ResizeObserver = OriginalResizeObserver;
    }
  });
});

describe("TerminalSurface — normal render", () => {
  afterEach(() => {
    MockedTerminal.mockReset();
    MockedFitAddon.mockReset();
    // Restore default passing implementations
    MockedTerminal.mockImplementation(() => makeTerminalInstance());
    MockedFitAddon.mockImplementation(() => makeFitAddonInstance());
  });

  it("renders the container div without an error message when init succeeds", () => {
    MockedTerminal.mockImplementation(() => makeTerminalInstance());
    MockedFitAddon.mockImplementation(() => makeFitAddonInstance());

    const { container } = render(<TerminalSurface />);
    expect(screen.queryByTestId("terminal-init-error")).not.toBeInTheDocument();
    expect(container.firstChild).toBeTruthy();
  });

  it("calls onMount with the Terminal instance after successful init", () => {
    const instance = makeTerminalInstance();
    MockedTerminal.mockImplementation(() => instance);
    MockedFitAddon.mockImplementation(() => makeFitAddonInstance());

    const onMount = vi.fn();
    render(<TerminalSurface onMount={onMount} />);
    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onMount).toHaveBeenCalledWith(instance);
  });

  it("calls terminal.open() on the container element", () => {
    const openFn = vi.fn();
    MockedTerminal.mockImplementation(() => makeTerminalInstance({ open: openFn }));
    MockedFitAddon.mockImplementation(() => makeFitAddonInstance());

    render(<TerminalSurface />);
    expect(openFn).toHaveBeenCalledTimes(1);
    expect(openFn).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it("reports terminal focus owner when the host receives focus", () => {
    MockedTerminal.mockImplementation(() => makeTerminalInstance());
    MockedFitAddon.mockImplementation(() => makeFitAddonInstance());

    const onFocusOwnerChange = vi.fn();
    render(<TerminalSurface onFocusOwnerChange={onFocusOwnerChange} />);

    const host = screen.getByTestId("terminal-surface-host");
    host.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(onFocusOwnerChange).toHaveBeenCalledWith("terminal");
  });

  it("reports editor focus owner when the host loses focus", () => {
    MockedTerminal.mockImplementation(() => makeTerminalInstance());
    MockedFitAddon.mockImplementation(() => makeFitAddonInstance());

    const onFocusOwnerChange = vi.fn();
    render(<TerminalSurface onFocusOwnerChange={onFocusOwnerChange} />);

    const host = screen.getByTestId("terminal-surface-host");
    host.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(onFocusOwnerChange).toHaveBeenCalledWith("editor");
  });
});

describe("TerminalSurface — init failure fallback", () => {
  beforeEach(() => {
    MockedTerminal.mockReset();
    MockedFitAddon.mockReset();
    MockedFitAddon.mockImplementation(() => makeFitAddonInstance());
  });

  afterEach(() => {
    // Restore default passing implementations so other test files are unaffected.
    MockedTerminal.mockImplementation(() => makeTerminalInstance());
    MockedFitAddon.mockImplementation(() => makeFitAddonInstance());
  });

  it("shows fallback message when Terminal constructor throws", () => {
    MockedTerminal.mockImplementation(() => {
      throw new Error("WebGL context unavailable");
    });

    render(<TerminalSurface />);

    expect(screen.getByTestId("terminal-init-error")).toBeInTheDocument();
    expect(screen.getByText(/terminal failed to initialize/i)).toBeInTheDocument();
  });

  it("shows fallback message when terminal.open() throws", () => {
    MockedTerminal.mockImplementation(() =>
      makeTerminalInstance({
        open: vi.fn().mockImplementation(() => {
          throw new Error("DOM attach failed");
        }),
      })
    );

    render(<TerminalSurface />);

    expect(screen.getByTestId("terminal-init-error")).toBeInTheDocument();
    expect(screen.getByText(/terminal failed to initialize/i)).toBeInTheDocument();
  });

  it("shows fallback message when loadAddon throws", () => {
    MockedTerminal.mockImplementation(() =>
      makeTerminalInstance({
        loadAddon: vi.fn().mockImplementation(() => {
          throw new Error("Addon registration failed");
        }),
      })
    );

    render(<TerminalSurface />);

    expect(screen.getByTestId("terminal-init-error")).toBeInTheDocument();
    expect(screen.getByText(/terminal failed to initialize/i)).toBeInTheDocument();
  });

  it("does not call onMount when init fails", () => {
    MockedTerminal.mockImplementation(() => {
      throw new Error("constructor failure");
    });

    const onMount = vi.fn();
    render(<TerminalSurface onMount={onMount} />);

    expect(onMount).not.toHaveBeenCalled();
  });

  it("renders an accessible alert role on the fallback element", () => {
    MockedTerminal.mockImplementation(() => {
      throw new Error("renderer unavailable");
    });

    render(<TerminalSurface />);

    const errorEl = screen.getByRole("alert");
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveAttribute("data-testid", "terminal-init-error");
  });

  it("does not propagate the init error to the React tree", () => {
    // If the component did not catch the error, this would throw before the assertion.
    MockedTerminal.mockImplementation(() => {
      throw new Error("renderer unavailable");
    });

    expect(() => render(<TerminalSurface />)).not.toThrow();
    expect(screen.getByTestId("terminal-init-error")).toBeInTheDocument();
  });

  it("disposes partially-constructed terminal when open() throws", () => {
    const partialDispose = vi.fn();
    MockedTerminal.mockImplementation(() =>
      makeTerminalInstance({
        open: vi.fn().mockImplementation(() => {
          throw new Error("open failed");
        }),
        dispose: partialDispose,
      })
    );

    render(<TerminalSurface />);

    expect(screen.getByTestId("terminal-init-error")).toBeInTheDocument();
    expect(partialDispose).toHaveBeenCalledTimes(1);
  });
});
