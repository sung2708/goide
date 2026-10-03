import type { GoTestOutput } from "../../lib/ipc/types";
export type TestStatus = "not run" | "running" | "passed" | "failed" | "skipped" | "cancelled" | "build failed";
export type TestResult = { id: string; package: string; test: string | null; status: TestStatus; duration: number | null; output: string; locations: { file: string; line: number; column: number }[] };
const states: Record<string, TestStatus> = { start: "running", run: "running", cont: "running", pass: "passed", fail: "failed", skip: "skipped", "build-fail": "build failed" };
function sourceLocation(text: string, directory: string) {
  const match = /^\s*(?:\.\/)?([^:]+\.go):(\d+)(?::(\d+))?:\s+/.exec(text);
  if (!match) return null;
  const file = match[1].replace(/\\/g, "/");
  if (file.startsWith("/") || file.split("/").some(part => part === ".." || !part)) return null;
  const location = { file: directory === "." ? file : `${directory}/${file}`, line: Number(match[2]), column: Number(match[3] ?? 1) };
  return Number.isSafeInteger(location.line) && location.line > 0 && Number.isSafeInteger(location.column) && location.column > 0 ? location : null;
}
export function testResults(report: GoTestOutput): { rows: TestResult[]; warning: string | null } {
  const rows = new Map<string, TestResult>();
  const directories = new Map(report.packages.map(pkg => [pkg.importPath, pkg.relativeDirectory]));
  let invalid = 0, limited = false;
  for (const line of report.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: Record<string, unknown>;
    try { event = JSON.parse(line); if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error(); } catch { invalid++; continue; }
    const pkg = typeof event.Package === "string" ? event.Package : typeof event.ImportPath === "string" ? event.ImportPath : null;
    if (!pkg || !directories.has(pkg) || typeof event.Action !== "string") { invalid++; continue; }
    const test = typeof event.Test === "string" ? event.Test : null;
    const id = JSON.stringify([pkg, test]);
    let row = rows.get(id);
    if (!row) {
      if (rows.size >= 10000) { limited = true; continue; }
      row = { id, package: pkg, test, status: "not run", duration: null, output: "", locations: [] }; rows.set(id, row);
    }
    const status = states[event.Action];
    if (status && !(row.status === "build failed" && status === "failed")) row.status = status;
    if (typeof event.FailedBuild === "string" && event.FailedBuild) row.status = "build failed";
    if (typeof event.Elapsed === "number" && Number.isFinite(event.Elapsed) && event.Elapsed >= 0) row.duration = event.Elapsed;
    if (typeof event.Output === "string") {
      if (!test && event.Output.split(/\r?\n/).some(text => text.startsWith("FAIL\t") && text.endsWith(" [build failed]") && text.slice(5, -15).trim() === pkg)) row.status = "build failed";
      limited ||= row.output.length + event.Output.length > 128 * 1024;
      row.output += event.Output.slice(0, Math.max(0, 128 * 1024 - row.output.length));
      for (const text of event.Output.split(/\r?\n/)) {
        const location = sourceLocation(text, directories.get(pkg)!);
        if (!location) continue;
        if (row.locations.length < 100 && !row.locations.some(old => old.file === location.file && old.line === location.line && old.column === location.column)) row.locations.push(location);
      }
    }
  }
  // Older Go versions send compiler locations to stderr following a package header.
  // Attach them only when structured events already confirm this package's build failure.
  let compilerPackage: string | null = null;
  for (const text of report.stderr.split(/\r?\n/)) {
    if (text.startsWith("# ")) { const header = text.slice(2).replace(/ \[.*\]$/, ""); compilerPackage = directories.has(header) ? header : null; continue; }
    if (!compilerPackage) continue;
    const row = rows.get(JSON.stringify([compilerPackage, null]));
    if (!row || row.status !== "build failed") continue;
    const location = sourceLocation(text, directories.get(compilerPackage)!);
    if (location && row.locations.length < 100 && !row.locations.some(old => old.file === location.file && old.line === location.line && old.column === location.column)) row.locations.push(location);
  }
  return { rows: [...rows.values()], warning: invalid || limited ? `${invalid} unrecognized test events${limited ? "; result/output limit reached" : ""}. Review raw output.` : null };
}
