/** Retain session ownership until native disposal acknowledges success. */
export class ShellWorkspaceOwnership {
  private sessions = new Map<string, Set<string>>();
  private starts = new Map<symbol, { root: string; done: Promise<void> }>();
  private cleanupTail: Promise<void> = Promise.resolve();
  constructor(private dispose: (id: string) => Promise<void>) {}
  begin(root: string) {
    const token = Symbol(root); let resolve!: () => void;
    const done = new Promise<void>(complete => { resolve = complete; });
    this.starts.set(token, { root, done });
    return (id?: string) => {
      if (!this.starts.has(token)) return;
      if (id) {
        const ids = this.sessions.get(root) ?? new Set<string>(); ids.add(id); this.sessions.set(root, ids);
      }
      this.starts.delete(token); resolve();
    };
  }
  async track<T>(root: string, start: () => Promise<T>, identify: (result: T) => string | undefined) {
    const finish = this.begin(root); let id: string | undefined;
    try { const result = await start(); id = identify(result); return result; }
    finally { finish(id); }
  }
  forget(id: string) {
    for (const [root, ids] of this.sessions) { ids.delete(id); if (!ids.size) this.sessions.delete(root); }
  }
  hasOutside(root: string | null) {
    return [...this.sessions.keys()].some(key => key !== root) || [...this.starts.values()].some(start => start.root !== root);
  }
  cleanupOutside(currentRoot: () => string | null): Promise<void> {
    const work = this.cleanupTail.then(async () => {
      while (this.hasOutside(currentRoot())) {
        const pending = [...this.starts.values()].filter(start => start.root !== currentRoot());
        // An old ensure may still create a child. Wait until its ID is retained.
        await Promise.all(pending.map(start => start.done));
        const retired = [...this.sessions.entries()].filter(([root]) => root !== currentRoot()).flatMap(([root, ids]) => [...ids].map(id => ({ root, id })));
        const outcomes = await Promise.allSettled(retired.map(async ({ root, id }) => {
          await this.dispose(id);
          const ids = this.sessions.get(root); ids?.delete(id); if (!ids?.size) this.sessions.delete(root);
        }));
        const failures = outcomes.flatMap((outcome, index) => outcome.status === "rejected" ? [`${retired[index].root}: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`] : []);
        if (failures.length) throw new Error(`Terminal cleanup failed; previous workspace sessions remain owned. ${failures.join("; ")}`);
      }
    });
    // A failed attempt remains reviewable/retryable; it cannot poison the queue.
    this.cleanupTail = work.catch(() => undefined);
    return work;
  }
}