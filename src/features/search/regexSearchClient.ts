import type { RegexSearchRequest, RegexSearchReport } from "./regexSearch";
export function startRegexSearch(request: RegexSearchRequest) {
  let cancel = () => {};
  const promise = new Promise<RegexSearchReport>((resolve, reject) => {
    if (typeof Worker === "undefined") { reject(new Error("Regex search requires a Web Worker; no synchronous regex was executed.")); return; }
    let owner: Worker;
    try { owner = new Worker(new URL("./regexSearch.worker.ts", import.meta.url), { type: "module" }); }
    catch { reject(new Error("Cannot start the regex search worker.")); return; }
    let settled = false;
    const finish = (error?: string, data?: RegexSearchReport) => {
      if (settled) return; settled = true; clearTimeout(timer); owner.terminate();
      if (error) reject(new Error(error)); else if (data) resolve(data); else reject(new Error("Invalid regex worker response."));
    };
    const timer = setTimeout(() => finish("Regex search exceeded its 1 second deadline. Simplify the pattern."), 1000);
    cancel = () => finish("Regex search cancelled.");
    owner.onerror = () => finish("Regex search worker failed.");
    owner.onmessage = event => event.data.ok ? finish(undefined, event.data.data) : finish(event.data.error ?? "Invalid regex.");
    try { owner.postMessage(request); } catch { finish("Cannot submit regex search."); }
  });
  return { promise, cancel: () => cancel() };
}
