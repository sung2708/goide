export type LatencySummary = {
  count: number;
  minMs: number | null;
  maxMs: number | null;
  avgMs: number | null;
  p95Ms: number | null;
};

export type LatencySnapshot = {
  keyToEcho: LatencySummary;
};

type Clock = () => number;

function summarize(samples: number[]): LatencySummary {
  if (samples.length === 0) {
    return {
      count: 0,
      minMs: null,
      maxMs: null,
      avgMs: null,
      p95Ms: null,
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const count = sorted.length;
  const minMs = sorted[0];
  const maxMs = sorted[count - 1];
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const avgMs = sum / count;
  const percentileIndex = Math.min(count - 1, Math.ceil(count * 0.95) - 1);
  const p95Ms = sorted[percentileIndex];

  return { count, minMs, maxMs, avgMs, p95Ms };
}

export function createLatencyMetrics(now: Clock = () => performance.now()) {
  const keyDownAt = new Map<string, number>();
  const keyToEchoSamples: number[] = [];
  const maxSampleCount = 512;

  return {
    markKeyDown(token: string) {
      keyDownAt.set(token, now());
    },
    markEcho(token: string) {
      const startedAt = keyDownAt.get(token);
      if (startedAt === undefined) {
        return;
      }
      keyDownAt.delete(token);
      keyToEchoSamples.push(Math.max(0, now() - startedAt));
      if (keyToEchoSamples.length > maxSampleCount) {
        keyToEchoSamples.splice(0, keyToEchoSamples.length - maxSampleCount);
      }
    },
    snapshot(): LatencySnapshot {
      return {
        keyToEcho: summarize(keyToEchoSamples),
      };
    },
    reset() {
      keyDownAt.clear();
      keyToEchoSamples.splice(0, keyToEchoSamples.length);
    },
  };
}
