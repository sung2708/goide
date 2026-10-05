/** Preserve the same source token through whitespace-only formatting. For other
 * external edits retain a clamped logical row/column; never split a surrogate. */
export function preserveEditorOffset(before: string, after: string, offset: number): number {
  offset = Math.max(0, Math.min(before.length, offset));
  if (before.replace(/\s/g, "") === after.replace(/\s/g, "")) {
    const significant = before.slice(0, offset).replace(/\s/g, "").length;
    let seen = 0, index = 0;
    while (index < after.length && seen < significant) { if (!/\s/.test(after[index])) seen++; index++; }
    if (/\s/.test(before[offset - 1] ?? "")) while (index < after.length && /\s/.test(after[index])) index++;
    return scalarBoundary(after, index);
  }
  const lines = before.slice(0, offset).split("\n");
  const next = after.split("\n"), line = Math.min(lines.length - 1, next.length - 1);
  const start = next.slice(0, line).reduce((sum, value) => sum + value.length + 1, 0);
  return scalarBoundary(after, start + Math.min(lines[lines.length - 1].length, next[line].replace(/\r$/, "").length));
}
function scalarBoundary(source: string, offset: number) {
  const unit = source.charCodeAt(offset);
  return unit >= 0xdc00 && unit <= 0xdfff ? Math.max(0, offset - 1) : offset;
}
