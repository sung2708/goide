/**
 * ResizableSplit tests — pointer capture, hit target, double-click reset, keyboard resize.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ResizableSplit from "./ResizableSplit";

function renderSplit(overrides: Partial<Parameters<typeof ResizableSplit>[0]> = {}) {
  const defaults = {
    orientation: "vertical" as const,
    primary: <div data-testid="primary">primary</div>,
    secondary: <div data-testid="secondary">secondary</div>,
    size: 200,
    defaultSize: 180,
    minSize: 80,
    maxSize: 600,
    onResize: vi.fn(),
  };

  return render(<ResizableSplit {...defaults} {...overrides} />);
}

describe("ResizableSplit — pointer capture while dragging", () => {
  beforeEach(() => {
    // Provide a setPointerCapture stub on HTMLElement prototype so jsdom does
    // not throw when the component calls it.
    if (!HTMLElement.prototype.setPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
    }
  });

  it("calls setPointerCapture with the pointer id when dragging starts", () => {
    renderSplit();
    // The onPointerDown handler lives on the hit-zone wrapper, so pointer capture
    // is called on the hit-zone element (event.currentTarget), not the inner separator.
    const hitZone = screen.getByTestId("separator-hit-zone");
    const setCapture = vi.fn();
    hitZone.setPointerCapture = setCapture;

    fireEvent.pointerDown(hitZone, { pointerId: 7, clientY: 300 });

    expect(setCapture).toHaveBeenCalledWith(7);
  });

  it("calls setPointerCapture on a horizontal split with the correct pointer id", () => {
    renderSplit({ orientation: "horizontal" });
    const hitZone = screen.getByTestId("separator-hit-zone");
    const setCapture = vi.fn();
    hitZone.setPointerCapture = setCapture;

    fireEvent.pointerDown(hitZone, { pointerId: 3, clientX: 400 });

    expect(setCapture).toHaveBeenCalledWith(3);
  });

  it("prevents default on pointerdown to suppress text selection during drag", () => {
    renderSplit();
    // The handler is on the hit-zone wrapper, so dispatch the event there.
    const hitZone = screen.getByTestId("separator-hit-zone");

    const event = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
    });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    hitZone.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("stops resizing after pointercancel clears the drag state", () => {
    const onResize = vi.fn();
    renderSplit({ orientation: "horizontal", size: 320, minSize: 240, maxSize: 640, onResize });

    const hitZone = screen.getByTestId("separator-hit-zone");
    fireEvent.pointerDown(hitZone, { pointerId: 7, clientX: 320 });
    fireEvent.pointerCancel(hitZone, { pointerId: 7 });
    fireEvent.pointerMove(hitZone, { clientX: 400 });

    expect(onResize).not.toHaveBeenCalled();
  });
});

describe("ResizableSplit — hit target", () => {
  it("wraps the separator in a larger hit-zone container", () => {
    renderSplit();
    // The separator element should be inside a hit-zone wrapper that has a
    // larger click area. We look for an element with data-testid="separator-hit-zone"
    // that contains the actual separator.
    const hitZone = screen.getByTestId("separator-hit-zone");
    expect(hitZone).toBeInTheDocument();
    expect(hitZone).toContainElement(screen.getByRole("separator"));
  });

  it("hit-zone is the focusable separator for vertical orientation (larger touch target)", () => {
    renderSplit({ orientation: "vertical" });
    const hitZone = screen.getByTestId("separator-hit-zone");
    expect(hitZone).toBe(screen.getByRole("separator"));
    expect(hitZone).toHaveAttribute("tabindex", "0");
  });
});

describe("ResizableSplit — double-click reset", () => {
  it("resets to defaultSize when the separator is double-clicked", () => {
    const onResize = vi.fn();
    renderSplit({ size: 400, defaultSize: 180, minSize: 80, maxSize: 600, onResize });

    fireEvent.doubleClick(screen.getByRole("separator"));

    expect(onResize).toHaveBeenCalledWith(180);
  });

  it("clamps defaultSize to minSize when defaultSize is below min", () => {
    const onResize = vi.fn();
    renderSplit({ size: 400, defaultSize: 40, minSize: 80, maxSize: 600, onResize });

    fireEvent.doubleClick(screen.getByRole("separator"));

    expect(onResize).toHaveBeenCalledWith(80);
  });

  it("clamps defaultSize to maxSize when defaultSize exceeds max", () => {
    const onResize = vi.fn();
    renderSplit({ size: 200, defaultSize: 800, minSize: 80, maxSize: 600, onResize });

    fireEvent.doubleClick(screen.getByRole("separator"));

    expect(onResize).toHaveBeenCalledWith(600);
  });
});

describe("ResizableSplit — keyboard resize", () => {
  it("increases size with ArrowDown on vertical orientation", () => {
    const onResize = vi.fn();
    renderSplit({ orientation: "vertical", size: 200, onResize });

    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowDown" });

    expect(onResize).toHaveBeenCalledWith(216); // 200 + 16
  });

  it("decreases size with ArrowUp on vertical orientation", () => {
    const onResize = vi.fn();
    renderSplit({ orientation: "vertical", size: 200, onResize });

    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowUp" });

    expect(onResize).toHaveBeenCalledWith(184); // 200 - 16
  });

  it("increases size with ArrowRight on horizontal orientation", () => {
    const onResize = vi.fn();
    renderSplit({ orientation: "horizontal", size: 200, onResize });

    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });

    expect(onResize).toHaveBeenCalledWith(216);
  });

  it("decreases size with ArrowLeft on horizontal orientation", () => {
    const onResize = vi.fn();
    renderSplit({ orientation: "horizontal", size: 200, onResize });

    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowLeft" });

    expect(onResize).toHaveBeenCalledWith(184);
  });

  it("sets size to minSize with Home key", () => {
    const onResize = vi.fn();
    renderSplit({ size: 200, minSize: 80, onResize });

    fireEvent.keyDown(screen.getByRole("separator"), { key: "Home" });

    expect(onResize).toHaveBeenCalledWith(80);
  });

  it("sets size to maxSize with End key", () => {
    const onResize = vi.fn();
    renderSplit({ size: 200, maxSize: 600, onResize });

    fireEvent.keyDown(screen.getByRole("separator"), { key: "End" });

    expect(onResize).toHaveBeenCalledWith(600);
  });
});
