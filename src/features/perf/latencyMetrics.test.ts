import { describe, expect, it } from "vitest";
import { createLatencyMetrics } from "./latencyMetrics";

describe("latencyMetrics", () => {
  it("records key-to-echo latency sample", () => {
    let nowMs = 100;
    const metrics = createLatencyMetrics(() => nowMs);

    metrics.markKeyDown("k1");
    nowMs = 112;
    metrics.markEcho("k1");

    expect(metrics.snapshot().keyToEcho.count).toBe(1);
    expect(metrics.snapshot().keyToEcho.minMs).toBe(12);
  });

  it("ignores unmatched echo tokens", () => {
    const metrics = createLatencyMetrics(() => 0);
    metrics.markEcho("missing");
    expect(metrics.snapshot().keyToEcho.count).toBe(0);
  });

  it("clears samples on reset", () => {
    let nowMs = 0;
    const metrics = createLatencyMetrics(() => nowMs);
    metrics.markKeyDown("k1");
    nowMs = 5;
    metrics.markEcho("k1");
    expect(metrics.snapshot().keyToEcho.count).toBe(1);
    metrics.reset();
    expect(metrics.snapshot().keyToEcho.count).toBe(0);
  });
});
