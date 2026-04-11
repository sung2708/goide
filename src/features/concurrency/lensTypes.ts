import {
  ConcurrencyConfidence,
  type ConcurrencyConstruct,
} from "../../lib/ipc/types";

export type LensConstructKind = "channel" | "select" | "mutex" | "wait-group";

export type LensConstruct = {
  kind: LensConstructKind;
  line: number;
  column: number;
  symbol: string | null;
  scopeKey: string | null;
  confidence: ConcurrencyConfidence;
};

export type LensHoverHint = {
  kind: LensConstructKind;
  line: number;
  column: number;
  symbol: string | null;
  scopeKey: string | null;
  confidence: ConcurrencyConfidence.Predicted;
};

export type LensCounterpartMapping = {
  sourceLine: number;
  counterpartLine: number;
  symbol: string;
  confidence: ConcurrencyConfidence;
};

export function mapApiConstructToLensConstruct(
  construct: ConcurrencyConstruct
): LensConstruct {
  return {
    kind:
      construct.kind === "waitGroup"
        ? "wait-group"
        : (construct.kind as "channel" | "select" | "mutex"),
    line: construct.line,
    column: construct.column,
    symbol: construct.symbol,
    scopeKey: construct.scopeKey ?? null,
    confidence: construct.confidence,
  };
}
