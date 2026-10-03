export type Channel = "stable" | "beta" | "alpha";
export function defaultChannel(version: string): Channel { const pre = version.split("-")[1]?.split(".")[0]; return pre === undefined ? "stable" : pre === "beta" || pre === "rc" ? "beta" : "alpha"; }
export type Phase = "idle" | "checking" | "upToDate" | "updateAvailable" | "downloading" | "downloaded" | "installing" | "restartRequired" | "error";
export type UpdateState = { revision: number; currentVersion: string; channel: Channel; configured: boolean; phase: Phase; release: { version: string; notes: string; publishedAt: string | null } | null; received: number; total: number | null; lastChecked: number | null; error: { code: string; message: string } | null };
export type Adapter = { invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>; listen: (apply: (state: UpdateState) => void) => Promise<() => void> };
const initial: UpdateState = { revision: -1, currentVersion: "", channel: "stable", configured: false, phase: "idle", release: null, received: 0, total: null, lastChecked: null, error: null };
export class UpdateService {
  private state = initial;
  private listeners = new Set<() => void>();
  private pending: Promise<void> | null = null;
  private initialization: Promise<void> | null = null;
  private installRequest: (() => void) | null = null;
  snapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  constructor(private adapter: Adapter) {}
  private apply = (state: UpdateState) => {
    if (state.revision < this.state.revision) return;
    this.state = state;
    this.listeners.forEach(fn => fn());
  };
  initialize = () => this.initialization ??= (async () => {
    await this.adapter.listen(this.apply);
    this.apply(await this.adapter.invoke<UpdateState>("goro_update_state"));
  })().catch(() => { this.apply({ ...initial, error: { code: "update_unavailable", message: "Updates are available in the desktop application." } }); });
  private operation(command: string, args?: Record<string, unknown>) {
    if (this.pending) return this.pending;
    this.pending = this.adapter.invoke<UpdateState>(command, args).then(this.apply).catch(() => {
      if (this.state.phase !== "error") this.apply({ ...this.state, phase: "error", error: { code: "update_unavailable", message: "The update service could not complete this operation. Retry later." } });
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  check = (channel?: Channel) => this.operation("goro_update_check", { channel: channel ?? null });
  download = () => this.operation("goro_update_download");
  cancel = async () => { try { this.apply(await this.adapter.invoke<UpdateState>("goro_update_cancel")); } catch { /* Native state remains authoritative. */ } };
  registerInstall = (handler: () => void) => { this.installRequest = handler; return () => { if (this.installRequest === handler) this.installRequest = null; }; };
  requestInstall = () => { if (this.state.phase === "downloaded") this.installRequest?.(); };
  install = async () => {
    const state = await this.adapter.invoke<UpdateState>("goro_update_install");
    this.apply(state);
    if (state.phase === "error") throw new Error(state.error?.message ?? "Installation failed.");
  };
}
