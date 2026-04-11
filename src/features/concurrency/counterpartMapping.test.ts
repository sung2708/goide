import { describe, expect, it } from "vitest";
import { ConcurrencyConfidence } from "../../lib/ipc/types";
import { buildCounterpartMappings } from "./counterpartMapping";
import type { LensConstruct } from "./lensTypes";

function channel(
  line: number,
  symbol: string | null,
  confidence: ConcurrencyConfidence = ConcurrencyConfidence.Predicted,
  scopeKey: string | null = "S1"
): LensConstruct {
  return {
    kind: "channel",
    line,
    column: 1,
    symbol,
    scopeKey,
    confidence,
  };
}

describe("buildCounterpartMappings", () => {
  it("maps matched same-symbol channel operations deterministically", () => {
    const mappings = buildCounterpartMappings([
      channel(20, "jobs"),
      channel(4, "jobs"),
      channel(8, "jobs"),
      channel(11, "other"),
      channel(15, "other"),
    ]);

    expect(mappings).toEqual([
      {
        sourceLine: 4,
        counterpartLine: 8,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 8,
        counterpartLine: 4,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 11,
        counterpartLine: 15,
        symbol: "other",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 15,
        counterpartLine: 11,
        symbol: "other",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 20,
        counterpartLine: 8,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ]);
  });

  it("returns empty mappings for unmatched or symbol-less constructs", () => {
    const mappings = buildCounterpartMappings([
      channel(5, null),
      channel(12, "jobs"),
      {
        kind: "wait-group",
        line: 6,
        column: 1,
        symbol: "wg",
        scopeKey: null,
        confidence: ConcurrencyConfidence.Predicted,
      },
    ]);

    expect(mappings).toEqual([]);
  });

  it("does not pair same symbol across different scopes", () => {
    const mappings = buildCounterpartMappings([
      channel(4, "ch", ConcurrencyConfidence.Predicted, "S1"),
      channel(8, "ch", ConcurrencyConfidence.Predicted, "S1"),
      channel(40, "ch", ConcurrencyConfidence.Predicted, "S9"),
      channel(44, "ch", ConcurrencyConfidence.Predicted, "S9"),
    ]);

    expect(mappings).toEqual([
      {
        sourceLine: 4,
        counterpartLine: 8,
        symbol: "ch",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 8,
        counterpartLine: 4,
        symbol: "ch",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 40,
        counterpartLine: 44,
        symbol: "ch",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 44,
        counterpartLine: 40,
        symbol: "ch",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ]);
  });
});
