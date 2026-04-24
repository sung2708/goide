import React from "react";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResizableSplit from "../../components/layout/ResizableSplit";
import { useWorkspaceLayout } from "./useWorkspaceLayout";

describe("useWorkspaceLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists dock mode per workspace", () => {
    const { result, unmount } = renderHook(() => useWorkspaceLayout("C:/repo"));

    act(() => result.current.setDockMode("right"));
    expect(result.current.dockMode).toBe("right");

    unmount();

    const { result: restored } = renderHook(() => useWorkspaceLayout("C:/repo"));
    expect(restored.current.dockMode).toBe("right");

    const { result: otherWorkspace } = renderHook(() => useWorkspaceLayout("C:/other"));
    expect(otherWorkspace.current.dockMode).toBe("bottom");
  });

  it("persists split sizes and resets them to defaults", () => {
    const { result, unmount } = renderHook(() => useWorkspaceLayout("C:/repo"));

    act(() => result.current.setSplitSizes({ left: 300, terminal: 420 }));
    expect(result.current.splitSizes).toEqual({ left: 300, terminal: 420 });

    unmount();

    const { result: restored } = renderHook(() => useWorkspaceLayout("C:/repo"));
    expect(restored.current.splitSizes).toEqual({ left: 300, terminal: 420 });

    act(() => restored.current.resetLayout());
    expect(restored.current.dockMode).toBe("bottom");
    expect(restored.current.splitSizes).toEqual({ left: 240, terminal: 320 });
  });
});

describe("ResizableSplit", () => {
  it("resets to the default size on splitter double-click", () => {
    const onResize = vi.fn();

    render(
      React.createElement(ResizableSplit, {
        orientation: "horizontal",
        size: 360,
        defaultSize: 240,
        minSize: 160,
        maxSize: 520,
        onResize,
        primary: React.createElement("div", null, "primary"),
        secondary: React.createElement("div", null, "secondary"),
      })
    );

    fireEvent.doubleClick(screen.getByRole("separator"));

    expect(onResize).toHaveBeenCalledWith(240);
  });

  it("removes active drag listeners when unmounted", () => {
    const onResize = vi.fn();
    const { unmount } = render(
      React.createElement(ResizableSplit, {
        orientation: "horizontal",
        size: 240,
        defaultSize: 240,
        minSize: 160,
        maxSize: 520,
        onResize,
        primary: React.createElement("div", null, "primary"),
        secondary: React.createElement("div", null, "secondary"),
      })
    );

    fireEvent.pointerDown(screen.getByRole("separator"), { clientX: 100 });
    unmount();
    fireEvent.pointerMove(window, { clientX: 180 });

    expect(onResize).not.toHaveBeenCalled();
  });

  it("supports keyboard resize and exposes the current size range", () => {
    const onResize = vi.fn();

    render(
      React.createElement(ResizableSplit, {
        orientation: "horizontal",
        size: 360,
        defaultSize: 240,
        minSize: 160,
        maxSize: 520,
        onResize,
        primary: React.createElement("div", null, "primary"),
        secondary: React.createElement("div", null, "secondary"),
      })
    );

    const separator = screen.getByRole("separator");
    expect(separator).toHaveAttribute("aria-valuemin", "160");
    expect(separator).toHaveAttribute("aria-valuemax", "520");
    expect(separator).toHaveAttribute("aria-valuenow", "360");

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    fireEvent.keyDown(separator, { key: "Home" });
    fireEvent.keyDown(separator, { key: "End" });

    expect(onResize).toHaveBeenNthCalledWith(1, 376);
    expect(onResize).toHaveBeenNthCalledWith(2, 160);
    expect(onResize).toHaveBeenNthCalledWith(3, 520);
  });
});
