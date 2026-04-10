import { describe, expect, it } from "vitest";
import { GOIDE_SIGNAL_PREDICTED_TOKEN } from "./codemirrorTheme";

describe("codemirrorTheme", () => {
  it("uses CSS token for predicted hint underline color", () => {
    expect(GOIDE_SIGNAL_PREDICTED_TOKEN).toBe("var(--goide-signal-predicted)");
  });
});
