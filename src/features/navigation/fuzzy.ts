/** Offsets use original UTF-16, including case-fold expansions. */
export type FuzzyMatch = { score: number; positions: number[] };
export type FuzzyText = { label: string; folded: string; offsets: number[]; boundaries: Set<number>; compact: string };
export function prepareFuzzyText(label: string): FuzzyText {
  let folded = "", offset = 0;
  const offsets: number[] = [];
  for (const char of label) {
    const lower = char.toLowerCase(); folded += lower;
    for (let i = 0; i < lower.length; i++) offsets.push(offset);
    offset += char.length;
  }
  const boundaries = new Set<number>();
  for (const original of offsets) {
    const previous = label.slice(Math.max(0, original - 1), original), current = label.slice(original, original + 1);
    if (original === 0 || /[\s/\\_.:-]/u.test(previous) || (previous.toLowerCase() === previous && current.toUpperCase() === current && current.toLowerCase() !== current)) boundaries.add(original);
  }
  return { label, folded, offsets, boundaries, compact: folded.replace(/\s+/g, "") };
}
export function matchPreparedText(prepared: FuzzyText, query: string, highlight = true): FuzzyMatch | null {
  const needle = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!needle) return { score: 0, positions: [] };
  const { label, folded, offsets, boundaries, compact } = prepared;
  const positions = highlight ? new Set<number>() : null;
  let cursor = 0, score = 0;
  for (const char of needle) {
    const found = folded.indexOf(char, cursor);
    if (found < 0) return null;
    const original = offsets[found];
    score += found - cursor - (boundaries.has(original) ? 8 : 0) - (found === cursor ? 3 : 0);
    positions?.add(original); cursor = found + char.length;
  }
  if (compact === needle) score -= 10000;
  else if (folded.startsWith(needle)) score -= 5000;
  return { score: score + label.length / 100, positions: positions ? [...positions] : [] };
}
export function fuzzyMatch(label: string, query: string): FuzzyMatch | null { return matchPreparedText(prepareFuzzyText(label), query); }
