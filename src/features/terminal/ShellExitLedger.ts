/** Native exit events can arrive before ensure returns its session identity. */
export class ShellExitLedger {
  private ended = new Map<string, "exit" | "degraded">();
  record(id: string, health: "exit" | "degraded") {
    this.ended.delete(id);
    this.ended.set(id, health);
    if (this.ended.size > 128) this.ended.delete(this.ended.keys().next().value!);
  }
  get(id: string) { return this.ended.get(id); }
}
