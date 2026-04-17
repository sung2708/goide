import { describe, expect, it } from "vitest";
import {
  type ChannelOperation,
  ConcurrencyConfidence,
} from "../../lib/ipc/types";
import { buildCounterpartMappings } from "./counterpartMapping";
import type { LensConstruct } from "./lensTypes";

function channel(
  line: number,
  symbol: string | null,
  channelOperation: ChannelOperation | null = null,
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
    channelOperation,
  };
}

describe("buildCounterpartMappings", () => {
  it("maps only opposite-direction channel operations deterministically", () => {
    const mappings = buildCounterpartMappings([
      channel(20, "jobs", "send"),
      channel(4, "jobs", "send"),
      channel(8, "jobs", "receive"),
      channel(11, "other", "send"),
      channel(15, "other", "receive"),
    ]);

    expect(mappings).toEqual([
      {
        sourceLine: 4,
        sourceColumn: 1,
        counterpartLine: 8,
        counterpartColumn: 1,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 8,
        sourceColumn: 1,
        counterpartLine: 4,
        counterpartColumn: 1,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 11,
        sourceColumn: 1,
        counterpartLine: 15,
        counterpartColumn: 1,
        symbol: "other",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 15,
        sourceColumn: 1,
        counterpartLine: 11,
        counterpartColumn: 1,
        symbol: "other",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 20,
        sourceColumn: 1,
        counterpartLine: 8,
        counterpartColumn: 1,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ]);
  });

  it("returns empty mappings for unmatched or symbol-less constructs", () => {
    const mappings = buildCounterpartMappings([
      channel(5, null),
      channel(12, "jobs", "send"),
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
      channel(4, "ch", "send", ConcurrencyConfidence.Predicted, "S1"),
      channel(8, "ch", "receive", ConcurrencyConfidence.Predicted, "S1"),
      channel(40, "ch", "send", ConcurrencyConfidence.Predicted, "S9"),
      channel(44, "ch", "receive", ConcurrencyConfidence.Predicted, "S9"),
    ]);

    expect(mappings).toEqual([
      {
        sourceLine: 4,
        sourceColumn: 1,
        counterpartLine: 8,
        counterpartColumn: 1,
        symbol: "ch",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 8,
        sourceColumn: 1,
        counterpartLine: 4,
        counterpartColumn: 1,
        symbol: "ch",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 40,
        sourceColumn: 1,
        counterpartLine: 44,
        counterpartColumn: 1,
        symbol: "ch",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 44,
        sourceColumn: 1,
        counterpartLine: 40,
        counterpartColumn: 1,
        symbol: "ch",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ]);
  });

  it("pairs same symbol across nested blocks in the same function scope", () => {
    const mappings = buildCounterpartMappings([
      channel(10, "ch", "send", ConcurrencyConfidence.Predicted, "F1>B2"),
      channel(18, "ch", "receive", ConcurrencyConfidence.Predicted, "F1>B2>B3"),
    ]);

    expect(mappings).toEqual([
      {
        sourceLine: 10,
        sourceColumn: 1,
        counterpartLine: 18,
        counterpartColumn: 1,
        symbol: "ch",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 18,
        sourceColumn: 1,
        counterpartLine: 10,
        counterpartColumn: 1,
        symbol: "ch",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ]);
  });

  it("does not pair same symbol across nested function scopes", () => {
    const mappings = buildCounterpartMappings([
      channel(10, "ch", "send", ConcurrencyConfidence.Predicted, "F1>B2"),
      channel(18, "ch", "receive", ConcurrencyConfidence.Predicted, "F3>B4"),
    ]);

    expect(mappings).toEqual([]);
  });

  it("does not pair same symbol across sibling block scopes", () => {
    const mappings = buildCounterpartMappings([
      channel(10, "ch", "send", ConcurrencyConfidence.Predicted, "F1>B2"),
      channel(18, "ch", "receive", ConcurrencyConfidence.Predicted, "F1>B3"),
    ]);

    expect(mappings).toEqual([]);
  });

  it("does not map channel operations when direction is the same", () => {
    const mappings = buildCounterpartMappings([
      channel(4, "ch", "send"),
      channel(8, "ch", "send"),
      channel(12, "jobs", "receive"),
      channel(16, "jobs", "receive"),
    ]);

    expect(mappings).toEqual([]);
  });

  it("uses weakest confidence from matched send/receive endpoints", () => {
    const mappings = buildCounterpartMappings([
      channel(10, "jobs", "send", ConcurrencyConfidence.Confirmed, "F1>B2"),
      channel(18, "jobs", "receive", ConcurrencyConfidence.Predicted, "F1>B2"),
    ]);

    expect(mappings).toEqual([
      {
        sourceLine: 10,
        sourceColumn: 1,
        counterpartLine: 18,
        counterpartColumn: 1,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        sourceLine: 18,
        sourceColumn: 1,
        counterpartLine: 10,
        counterpartColumn: 1,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ]);
  });
});
