import { ConcurrencyConfidence } from "../../lib/ipc/types";
import type { LensConstruct, LensCounterpartMapping } from "./lensTypes";

function toSymbolKey(symbol: string | null): string | null {
  if (typeof symbol !== "string") {
    return null;
  }
  const trimmed = symbol.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toScopeKey(scopeKey: string | null): string | null {
  if (typeof scopeKey !== "string") {
    return null;
  }
  const trimmed = scopeKey.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toFunctionScopeKey(scopeKey: string | null): string | null {
  const normalized = toScopeKey(scopeKey);
  if (!normalized) {
    return null;
  }
  const segments = normalized.split(">").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return null;
  }

  // New analyzer keys use F* for function scopes and B* for non-function blocks.
  // Group by the innermost function scope so nested blocks pair, but nested
  // function literals (with a different innermost F*) do not cross-link.
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index]?.startsWith("F")) {
      return segments[index] ?? null;
    }
  }

  // Backward-compatible fallback for older S* scope keys used in tests/fixtures.
  return segments[0] ?? null;
}

function toDeterministicConfidence(constructs: LensConstruct[]): ConcurrencyConfidence {
  if (
    constructs.some(
      (construct) => construct.confidence === ConcurrencyConfidence.Confirmed
    )
  ) {
    return ConcurrencyConfidence.Confirmed;
  }
  if (
    constructs.some((construct) => construct.confidence === ConcurrencyConfidence.Likely)
  ) {
    return ConcurrencyConfidence.Likely;
  }
  return ConcurrencyConfidence.Predicted;
}

function pickNearestCounterpart(
  sourceLine: number,
  candidates: Array<{ line: number; scopeKey: string }>
): number | null {
  let nearest: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.line === sourceLine) {
      continue;
    }
    const distance = Math.abs(candidate.line - sourceLine);
    if (
      distance < nearestDistance ||
      (distance === nearestDistance &&
        nearest !== null &&
        candidate.line < nearest)
    ) {
      nearest = candidate.line;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function toChannelOperationKey(
  operation: LensConstruct["channelOperation"]
): "send" | "receive" | null {
  if (operation === "send" || operation === "receive") {
    return operation;
  }
  return null;
}

function isScopeRelated(scopeA: string, scopeB: string): boolean {
  if (scopeA === scopeB) {
    return true;
  }
  return scopeA.startsWith(`${scopeB}>`) || scopeB.startsWith(`${scopeA}>`);
}

export function buildCounterpartMappings(
  constructs: LensConstruct[]
): LensCounterpartMapping[] {
  const grouped = new Map<string, LensConstruct[]>();

  for (const construct of constructs) {
    if (construct.kind !== "channel") {
      continue;
    }
    const symbol = toSymbolKey(construct.symbol);
    const scopeKey = toFunctionScopeKey(construct.scopeKey);
    if (!symbol) {
      continue;
    }
    // Pair within the same function scope identity.
    if (!scopeKey) {
      continue;
    }
    const key = `${scopeKey}::${symbol}`;
    const group = grouped.get(key) ?? [];
    group.push(construct);
    grouped.set(key, group);
  }

  const mappings: LensCounterpartMapping[] = [];
  for (const [groupKey, group] of grouped.entries()) {
    const separatorIndex = groupKey.lastIndexOf("::");
    const symbol = separatorIndex >= 0 ? groupKey.slice(separatorIndex + 2) : groupKey;
    const sendPoints = group
      .filter((construct) => toChannelOperationKey(construct.channelOperation) === "send")
      .map((construct) => ({
        line: construct.line,
        scopeKey: toScopeKey(construct.scopeKey),
      }))
      .filter(
        (point): point is { line: number; scopeKey: string } =>
          typeof point.scopeKey === "string"
      );
    const receivePoints = group
      .filter((construct) => toChannelOperationKey(construct.channelOperation) === "receive")
      .map((construct) => ({
        line: construct.line,
        scopeKey: toScopeKey(construct.scopeKey),
      }))
      .filter(
        (point): point is { line: number; scopeKey: string } =>
          typeof point.scopeKey === "string"
      );

    if (sendPoints.length === 0 || receivePoints.length === 0) {
      continue;
    }

    const confidence = toDeterministicConfidence(group);
    for (const sourcePoint of sendPoints) {
      const relatedReceives = receivePoints.filter((candidate) =>
        isScopeRelated(sourcePoint.scopeKey, candidate.scopeKey)
      );
      const counterpartLine = pickNearestCounterpart(sourcePoint.line, relatedReceives);
      if (counterpartLine === null) {
        continue;
      }
      mappings.push({
        sourceLine: sourcePoint.line,
        counterpartLine,
        symbol,
        confidence,
      });
    }

    for (const sourcePoint of receivePoints) {
      const relatedSends = sendPoints.filter((candidate) =>
        isScopeRelated(sourcePoint.scopeKey, candidate.scopeKey)
      );
      const counterpartLine = pickNearestCounterpart(sourcePoint.line, relatedSends);
      if (counterpartLine === null) {
        continue;
      }
      mappings.push({
        sourceLine: sourcePoint.line,
        counterpartLine,
        symbol,
        confidence,
      });
    }
  }

  return mappings.sort((a, b) => {
    if (a.sourceLine !== b.sourceLine) {
      return a.sourceLine - b.sourceLine;
    }
    if (a.counterpartLine !== b.counterpartLine) {
      return a.counterpartLine - b.counterpartLine;
    }
    return a.symbol.localeCompare(b.symbol);
  });
}
