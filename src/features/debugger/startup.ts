import type { ApiResponse, LanguageCancelRequest } from "../../lib/ipc/types";

/** Startup authority remains held until the session is adopted or cleanup is confirmed. */
export class DebuggerStartup {
  private owner: LanguageCancelRequest | null = null;
  private retry: (() => void) | null = null;
  private stopping: Promise<void> | null = null;
  private cancelled = false;
  private cancellationReply: (() => void) | null = null;
  constructor(private cancelNative: (request: LanguageCancelRequest) => Promise<ApiResponse<void>>) {}
  current() { return this.owner; }
  cleanupPending() { return this.retry !== null; }
  adopt(requestId: string) { if (!this.retry && this.owner?.requestId === requestId) this.owner = null; }
  async start<T>(context: LanguageCancelRequest, launch: () => Promise<ApiResponse<T>>, pending: (message: string) => void): Promise<ApiResponse<T>> {
    if (this.owner) throw new Error("Finish the current debugger startup cleanup first.");
    this.owner = context; this.cancelled = false;
    let response: ApiResponse<T> | undefined;
    let transportError: unknown; let transportFailed = false;
    let confirmedCancel!: () => void;
    const cancelled = new Promise<{ cancelled: true }>(resolve => { confirmedCancel = () => resolve({ cancelled: true }); });
    this.cancellationReply = confirmedCancel;
    try {
      const outcome = await Promise.race([Promise.resolve().then(launch).then(response => ({ response })), cancelled]);
      if ("cancelled" in outcome) return { ok: false, error: { code: "debug_startup_cancelled", message: "Debug startup cancelled." } };
      response = outcome.response;
    } catch (error) { transportError = error; transportFailed = true; }
    finally { if (this.cancellationReply === confirmedCancel) this.cancellationReply = null; }
    if (this.stopping) await this.stopping.catch(() => {});
    if (this.owner !== context) {
      if (transportFailed && !this.cancelled) throw transportError;
      return { ok: false, error: { code: "debug_startup_cancelled", message: "Debug startup cancelled." } };
    }
    if (response?.ok && !this.cancelled) return response;
    if (this.cancelled) response = { ok: false, error: { code: "debug_startup_cleanup_pending", message: "Debug cancellation cleanup is pending." } };
    if (response && response.error?.code !== "debug_startup_cleanup_pending") {
      this.owner = null; return response;
    }
    let resolve!: () => void;
    const confirmed = new Promise<void>(done => { resolve = done; }); this.retry = resolve;
    try { await this.cancel(true); }
    catch (error) { pending(`Debug startup cleanup pending: ${error instanceof Error ? error.message : String(error)}. Retry cleanup.`); }
    await confirmed;
    if (this.cancelled) return { ok: false, error: { code: "debug_startup_cancelled", message: "Debug startup cancelled." } };
    if (transportFailed) throw transportError;
    return response!;
  }
  cancel(automatic = false): Promise<void> {
    if (!automatic) this.cancelled = true;
    if (this.stopping) return this.stopping;
    const context = this.owner; if (!context) return Promise.resolve();
    const cancel = async () => {
      const response = await this.cancelNative(context);
      if (!response.ok) throw new Error(response.error?.message ?? "Debugger startup cleanup is unconfirmed.");
      if (this.owner === context) {
        this.owner = null; const resolve = this.retry; this.retry = null; resolve?.(); this.cancellationReply?.();
      }
    };
    this.stopping = cancel().finally(() => { this.stopping = null; }); return this.stopping;
  }
}
