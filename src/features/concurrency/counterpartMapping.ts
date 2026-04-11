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
  lines: number[]
): number | null {
  let nearest: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of lines) {
    if (candidate === sourceLine) {
      continue;
    }
    const distance = Math.abs(candidate - sourceLine);
    if (
      distance < nearestDistance ||
      (distance === nearestDistance && nearest !== null && candidate < nearest)
    ) {
      nearest = candidate;
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

export function buildCounterpartMappings(
  constructs: LensConstruct[]
): LensCounterpartMapping[] {
  const grouped = new Map<string, LensConstruct[]>();

  for (const construct of constructs) {
    if (construct.kind !== "channel") {
      continue;
    }
    const symbol = toSymbolKey(construct.symbol);
    const scopeKey = toScopeKey(construct.scopeKey);
    if (!symbol) {
      continue;
    }
    // Require explicit scope identity for channel counterpart pairing to prevent
    // cross-scope linking between shadowed identifiers.
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
    const sendLines = Array.from(
      new Set(
        group
          .filter((construct) => toChannelOperationKey(construct.channelOperation) === "send")
          .map((construct) => construct.line)
      )
    ).sort((a, b) => a - b);
    const receiveLines = Array.from(
      new Set(
        group
          .filter((construct) => toChannelOperationKey(construct.channelOperation) === "receive")
          .map((construct) => construct.line)
      )
    ).sort((a, b) => a - b);
    if (sendLines.length === 0 || receiveLines.length === 0) {
      continue;
    }

    const confidence = toDeterministicConfidence(group);
    for (const sourceLine of sendLines) {
      const counterpartLine = pickNearestCounterpart(sourceLine, receiveLines);
      if (counterpartLine === null) {
        continue;
      }
      mappings.push({
        sourceLine,
        counterpartLine,
        symbol,
        confidence,
      });
    }

    for (const sourceLine of receiveLines) {
      const counterpartLine = pickNearestCounterpart(sourceLine, sendLines);
      if (counterpartLine === null) {
        continue;
      }
      mappings.push({
        sourceLine,
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
