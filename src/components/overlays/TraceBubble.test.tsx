import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TraceBubble from "./TraceBubble";

describe("TraceBubble", () => {
  it("renders nothing when visible is false", () => {
    render(
      <TraceBubble
        visible={false}
        confidence="predicted"
        label="Channel Send"
        anchorTop={50}
        anchorLeft={20}
      />
    );
    expect(screen.queryByTestId("trace-bubble")).toBeNull();
  });

  it("renders the bubble when visible is true", () => {
    render(
      <TraceBubble
        visible={true}
        confidence="predicted"
        label="Channel Send"
        anchorTop={50}
        anchorLeft={20}
      />
    );
    expect(screen.getByTestId("trace-bubble")).toBeDefined();
  });

  it("displays the kind label", () => {
    render(
      <TraceBubble
        visible={true}
        confidence="predicted"
        label="Channel Operation"
        anchorTop={50}
        anchorLeft={20}
      />
    );
    expect(screen.getByText("Channel Operation")).toBeDefined();
  });

  it("displays the confidence chip for predicted", () => {
    render(
      <TraceBubble
        visible={true}
        confidence="predicted"
        label="Channel Send"
        anchorTop={50}
        anchorLeft={20}
      />
    );
    expect(screen.getByText("Predicted")).toBeDefined();
  });

  it("displays the confidence chip for likely", () => {
    render(
      <TraceBubble
        visible={true}
        confidence="likely"
        label="Channel Receive"
        anchorTop={50}
        anchorLeft={20}
      />
    );
    expect(screen.getByText("Likely")).toBeDefined();
  });

  it("displays the confidence chip for confirmed", () => {
    render(
      <TraceBubble
        visible={true}
        confidence="confirmed"
        label="Mutex Lock"
        anchorTop={50}
        anchorLeft={20}
      />
    );
    expect(screen.getByText("Confirmed")).toBeDefined();
  });

  it("positions itself at the given anchor", () => {
    render(
      <TraceBubble
        visible={true}
        confidence="predicted"
        label="Channel Send"
        anchorTop={80}
        anchorLeft={40}
      />
    );
    const bubble = screen.getByTestId("trace-bubble");
    expect(bubble.style.top).toBe("80px");
    expect(bubble.style.left).toBe("40px");
  });

  it("has pointer-events-none to not block editor", () => {
    render(
      <TraceBubble
        visible={true}
        confidence="predicted"
        label="Channel Send"
        anchorTop={50}
        anchorLeft={20}
      />
    );
    const bubble = screen.getByTestId("trace-bubble");
    // Check the class contains pointer-events-none
    expect(bubble.className).toContain("pointer-events-none");
  });

  it("handles 0 as a valid coordinate without falling back to default", () => {
    render(
      <TraceBubble
        visible={true}
        confidence="predicted"
        label="Channel Send"
        anchorTop={0}
        anchorLeft={0}
      />
    );
    const bubble = screen.getByTestId("trace-bubble");
    expect(bubble.style.top).toBe("0px");
    expect(bubble.style.left).toBe("0px");
  });

  it("renders blocked indicator when blocked runtime state is active", () => {
    render(
      <TraceBubble
        visible={true}
        confidence="confirmed"
        label="Blocked Op"
        blocked={true}
        anchorTop={40}
        anchorLeft={10}
      />
    );

    expect(screen.getByTestId("trace-bubble-blocked-indicator")).toBeDefined();
    expect(screen.getByText("Blocked")).toBeDefined();
  });

  it("renders blocked indicator with static status styling", () => {
    render(
      <TraceBubble
        visible={true}
        confidence="confirmed"
        label="Blocked Op"
        blocked={true}
        anchorTop={40}
        anchorLeft={10}
      />
    );

    expect(screen.getByTestId("trace-bubble-blocked-indicator").className).toContain(
      "bg-[var(--signal-blocked)]"
    );
  });
});
