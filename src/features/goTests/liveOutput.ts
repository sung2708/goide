export type { GoTestEvent } from "../../lib/ipc/types";
import type { GoTestOutput, GoTestRequest, GoTestEvent } from "../../lib/ipc/types";
const LIMIT = 256 * 1024;
/** Partial native output is a preview; completion/exit status always comes from the owned command reply. */
export class LiveTestOutput {
  private sequence = 0;
  private packages: GoTestOutput["packages"] = [];
  private text = { stdout: "", stderr: "" };
  private decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
  private limited = false;
  private finished = false;
  constructor(private request: Pick<GoTestRequest, "workspaceRoot" | "requestId">) {}
  consume(event: GoTestEvent): boolean {
    if (this.finished || event.workspaceRoot !== this.request.workspaceRoot || event.requestId !== this.request.requestId) return false;
    if (!Number.isSafeInteger(event.sequence) || event.sequence <= this.sequence) return false;
    if (event.sequence !== this.sequence + 1) this.limited = true;
    this.sequence = event.sequence;
    if (event.kind === "packages") {
      if (!Array.isArray(event.packages) || event.packages.length > 2048 || event.packages.some(pkg => typeof pkg.importPath !== "string" || pkg.importPath.length > 4096 || typeof pkg.relativeDirectory !== "string" || pkg.relativeDirectory.length > 4096)) { this.limited = true; return true; }
      this.packages = event.packages;
    } else if (event.kind === "output" && (event.stream === "stdout" || event.stream === "stderr")) {
      if (!Array.isArray(event.bytes) || event.bytes.length > 8192 || event.bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) { this.limited = true; return true; }
      const decoded = this.decoders[event.stream].decode(Uint8Array.from(event.bytes), { stream: true });
      const room = LIMIT - this.text[event.stream].length;
      this.text[event.stream] += decoded.slice(0, room);
      this.limited ||= decoded.length > room;
    } else { this.limited = true; }
    return true;
  }
  finish() {
    if (this.finished) return false;
    this.finished = true;
    let changed = false;
    for (const stream of ["stdout", "stderr"] as const) {
      const tail = this.decoders[stream].decode().slice(0, LIMIT - this.text[stream].length); this.text[stream] += tail; changed ||= tail.length > 0;
    }
    return changed;
  }
  snapshot() {
    return { report: { packages: this.packages, stdout: this.text.stdout, stderr: this.text.stderr, success: false, exitCode: null } satisfies GoTestOutput, warning: this.limited ? "Live output is incomplete; review the final native result when execution finishes." : null };
  }
}
