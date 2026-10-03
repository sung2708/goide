import { useEffect, useState } from "react";
import type { GoProjectInfo } from "../../lib/ipc/types";
import type { GitTransaction } from "../git/useSourceControl";
import { useGoModuleAction } from "./useGoModuleAction";
type Props = { root: string | null; info: GoProjectInfo | null; directory: string; transaction?: GitTransaction; cancelPreparation?: () => void; onChanged?: (root: string) => void; onBusy: (busy: boolean) => void };
export default function GoModuleActions(props: Props) {
  const { busy, error, output, run, cancel, needsCleanup, retryCleanup } = useGoModuleAction(props);
  const modules = props.info?.modules.filter(module => module.insideWorkspace && !module.error).map(module => ({ ...module, relative: module.relativeDirectory })).filter(module => module.relative != null) ?? [];
  const [selected, setSelected] = useState("");
  useEffect(() => {
    const current = modules.filter(module => module.relative === "." || props.directory === module.relative || props.directory.startsWith(`${module.relative}/`)).sort((a, b) => b.relative!.length - a.relative!.length)[0];
    setSelected(current?.relative ?? modules[0]?.relative ?? "");
    // Preserve a user's module choice while rendering command progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.info, props.directory]);
  const disabled = busy || !props.info || !props.transaction;
  const text = output ? `${output.stdout}${output.stderr ? `\n${output.stderr}` : ""}` : "";
  return <section aria-label="Go module commands" className="my-4 border-t border-(--border) pt-3 text-sm">
    <p>These actions save all open buffers first. Tidy changes the selected module. Download uses Go’s selected module/workspace dependencies. Custom GOFLAGS are cleared for these commands.</p>
    <label className="my-2 block">Module <select aria-label="Module to tidy" value={selected} disabled={disabled || !modules.length} onChange={event => setSelected(event.target.value)}>{modules.map(module => <option key={module.directory} value={module.relative!}>{module.modulePath ?? module.relative}</option>)}</select></label>
    <div className="flex flex-wrap gap-4"><button disabled={disabled || !selected || !!props.info?.workError} onClick={() => void run("tidy", selected)}>Save All and Tidy Module</button><button disabled={disabled || !modules.length || !!props.info?.workError || props.info?.limited || props.info?.modules.some(module => !module.insideWorkspace || !!module.error)} onClick={() => void run("download", props.info?.mode === "workspace" ? props.directory : selected)}>Save All and Download Dependencies</button></div>
    {busy && <p role="status">Running module command; waiting for native completion/cleanup. <button onClick={cancel}>Cancel module command</button></p>}
    {needsCleanup && <button onClick={() => void retryCleanup()}>Retry module cleanup</button>}
    {error && <p role="alert" className="my-2 text-(--red)">{error}</p>}
    {output && <div className="my-2"><p>go mod {output.action} · {output.success ? "Succeeded" : "Failed"} · {output.directory}</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words">{text.slice(0, 128 * 1024) || "Command completed without output."}</pre>{text.length > 128 * 1024 && <p>Showing the first 128 KiB of command output.</p>}</div>}
  </section>;
}
