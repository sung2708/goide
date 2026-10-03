import type { ApiResponse, RunContext } from "../../lib/ipc/types";

/** Retain startup/document authority until native acknowledgement or confirmed cleanup. */
export class RunOwnership {
  private owner: RunContext | null = null;
  private retry: (() => void) | null = null;
  private stopping: Promise<void> | null = null;
  private cancellationReply: (() => void) | null = null;
  constructor(private stopNative: (context: RunContext) => Promise<ApiResponse<void>>) {}
  current() { return this.owner; }
  cleanupPending() { return this.retry !== null; }
  retire(runId: string | null) {
    if (!this.retry && this.owner?.runId === runId) this.owner = null;
  }
  async start(context: RunContext, launch: () => Promise<ApiResponse<void>>, pending: (message: string) => void) {
    if (this.owner) throw new Error("Stop the current run before starting another request.");
    this.owner = context;
    let response: ApiResponse<void> | undefined;
    let transportError: unknown; let transportFailed = false;
    let confirmedCancel!: () => void;
    const cancelled = new Promise<{ cancelled: true }>(resolve => { confirmedCancel = () => resolve({ cancelled: true }); });
    this.cancellationReply = confirmedCancel;
    try {
      const outcome = await Promise.race([Promise.resolve().then(launch).then(response => ({ response })), cancelled]);
      if ("cancelled" in outcome) return { ok: false, error: { code: "run_start_cancelled", message: "Run startup cancelled." } };
      response = outcome.response;
    } catch (error) { transportError = error; transportFailed = true; }
    finally { if (this.cancellationReply === confirmedCancel) this.cancellationReply = null; }
    if (this.owner !== context) { if (transportFailed) throw transportError; return response!; }
    if (response?.ok) return response;
    if (response && response.error?.code !== "run_cleanup_pending") {
      if (this.owner === context) this.owner = null;
      return response;
    }
    // A missing reply does not establish whether native startup created a process.
    // Set up the waiter before Stop so a concurrent user retry cannot be lost.
    let resolve!: () => void;
    const confirmed = new Promise<void>(done => { resolve = done; });
    this.retry = resolve;
    try { await this.stop(); }
    catch (error) { pending(`Run cleanup pending: ${error instanceof Error ? error.message : String(error)}. Retry Stop.`); }
    await confirmed;
    if (transportFailed) throw transportError;
    return response!;
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const context = this.owner;
    if (!context) return Promise.resolve();
    const stop = async () => {
      const response = await this.stopNative(context);
      if (!response.ok) throw new Error(response.error?.message ?? "Unable to confirm owned run cleanup.");
      if (this.owner === context) {
        this.owner = null;
        const resolve = this.retry; this.retry = null; resolve?.(); this.cancellationReply?.();
      }
    };
    this.stopping = stop().finally(() => { this.stopping = null; });
    return this.stopping;
  }
}
