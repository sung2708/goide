import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ThreadLine from "./ThreadLine";

describe("ThreadLine", () => {
  it("renders correctly when visible and anchors are provided", () => {
    const { container } = render(
      <ThreadLine
        visible={true}
        sourceAnchor={{ top: 100, left: 20 }}
        targetAnchor={{ top: 200, left: 20 }}
      />
    );

    // Should render SVG
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    
    // Should render two circles (dots)
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2);

    // Should render a path
    const path = container.querySelector("path");
    expect(path).toBeInTheDocument();
  });

  it("does not render when not visible", () => {
    const { container } = render(
      <ThreadLine
        visible={false}
        sourceAnchor={{ top: 100, left: 20 }}
        targetAnchor={{ top: 200, left: 20 }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it("does not render when sourceAnchor is missing", () => {
    const { container } = render(
      <ThreadLine
        visible={true}
        sourceAnchor={null}
        targetAnchor={{ top: 200, left: 20 }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it("does not render when targetAnchor is missing", () => {
    const { container } = render(
      <ThreadLine
        visible={true}
        sourceAnchor={{ top: 100, left: 20 }}
        targetAnchor={null}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
