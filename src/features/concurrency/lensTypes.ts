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
  confidence: ConcurrencyConfidence;
};

export type LensHoverHint = {
  kind: LensConstructKind;
  line: number;
  column: number;
  symbol: string | null;
  confidence: ConcurrencyConfidence.Predicted;
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
    confidence: construct.confidence,
  };
}
