export type SourceLocation = { file: string; line: number; column: number };
const same = (a: SourceLocation | undefined, b: SourceLocation) => a?.file === b.file && a.line === b.line && a.column === b.column;
/** Workspace-local source jumps. Failed navigation never consumes history. */
export class LocationHistory {
  private locations: SourceLocation[] = [];
  private index = -1;
  visit(from: SourceLocation | null, to: SourceLocation) {
    if (from && same(from, to)) return;
    this.locations = this.locations.slice(0, this.index + 1);
    if (from && !same(this.locations[this.index], from)) this.locations.push({ ...from });
    if (!same(this.locations[this.locations.length - 1], to)) this.locations.push({ ...to });
    this.locations = this.locations.slice(-100);
    this.index = this.locations.length - 1;
  }
  peek(direction: -1 | 1): SourceLocation | null { return this.locations[this.index + direction] ?? null; }
  move(direction: -1 | 1) { if (this.peek(direction)) this.index += direction; }
}
