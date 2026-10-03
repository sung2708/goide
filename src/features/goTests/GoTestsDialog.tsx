import { useMemo } from "react";
import Dialog from "../../components/primitives/Dialog";
import { testResults } from "./model";
import type { useGoTests } from "./useGoTests";
type Props = { open: boolean; close: () => void; runner: ReturnType<typeof useGoTests>; directory: string; navigate: (file: string, line: number, column: number) => void };
export default function GoTestsDialog({ open, close, runner, directory, navigate }: Props) {
  const report = runner.output ?? runner.live?.report;
  const results = useMemo(() => report ? testResults(report) : null, [report]);
  return <Dialog open={open} onOpenChange={next => { if (!next && !runner.busy) close(); }} ariaLabel="Go Tests" panelClassName="w-[min(60rem,95vw)] max-h-[85vh] overflow-auto border border-(--border) bg-(--base) p-5 text-(--text)">
    <h2>Go Tests</h2><p>Tests run saved buffers after Save All. Custom GOFLAGS are cleared; each run has a 180-second execution budget.</p>
    <div className="my-3 flex gap-4"><button disabled={runner.busy} onClick={() => void runner.run("package", directory)}>Test Current Package</button><button disabled={runner.busy} onClick={() => void runner.run("workspace", directory)}>Test Workspace</button><button disabled={runner.busy} onClick={close}>Close</button></div>
    <p role="status">{runner.status}{runner.busy && " · waiting for native completion/cleanup"}</p>
    {runner.busy && <button onClick={runner.cancel}>Cancel Tests</button>}{runner.needsCleanup && <button onClick={() => void runner.retryCleanup()}>Retry test cleanup</button>}
    {!runner.busy && !runner.output && runner.live && <p role="status">Execution ended without a complete result. Partial output is retained.</p>}
    {!runner.output && runner.live?.warning && <p role="status">{runner.live.warning}</p>}
    {runner.error && <p role="alert">{runner.error}</p>}{results?.warning && <p role="status">{results.warning}</p>}
    {results?.rows.map(row => <details key={row.id} className="my-2 border-t border-(--border) py-2"><summary>{row.package}{row.test ? ` / ${row.test}` : ""} · {row.status === "running" && !runner.busy && !runner.output ? (runner.status === "cancelled" ? "cancelled" : "outcome unavailable") : row.status}{row.duration !== null ? ` · ${row.duration}s` : ""}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{row.output || "No output"}</pre>{row.locations.map(location => <button key={`${location.file}:${location.line}:${location.column}`} disabled={runner.busy} onClick={() => { navigate(location.file, location.line, location.column); close(); }}>{location.file}:{location.line}:{location.column}</button>)}</details>)}
    {runner.output && <details><summary>Raw command output · exit {runner.output.exitCode ?? "unknown"}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap">{runner.output.stdout.slice(0, 128 * 1024)}{runner.output.stderr.slice(0, 128 * 1024)}</pre></details>}
  </Dialog>;
}
