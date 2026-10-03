import { useCallback, useEffect, useRef, useState } from "react";
import { searchWorkspaceText, writeWorkspaceFile, cancelWorkspaceSearch, previewWorkspaceReplacement } from "../../lib/ipc/client";
import type { WorkspaceSearchFile, WorkspaceSearchOptions, WorkspaceReplacementPlan } from "../../lib/ipc/types";

export type ReplacementDecision = boolean | WorkspaceReplacementPlan[];
type Safety = { transaction?: (operation: () => Promise<void>) => Promise<boolean>; isDirty?: (path: string) => boolean; onChanged?: () => void; review?: (plans: WorkspaceReplacementPlan[]) => Promise<ReplacementDecision> };
const defaults: WorkspaceSearchOptions = { matchCase: false, wholeWord: false, useRegex: false, include: [], exclude: [] };
export function useWorkspaceSearchState(workspacePath: string | null, safety: Safety = {}) {
  const [searchLoading, setSearchLoading] = useState(false);
  const [workspaceSearchResults, setWorkspaceSearchResults] = useState<WorkspaceSearchFile[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const nativeId = useRef<string | null>(null);
  const submittedOptions = useRef(defaults);
  const searchRequestIdRef = useRef(0);
  const currentRoot = useRef(workspacePath); currentRoot.current = workspacePath;
  const latestSafety = useRef(safety); latestSafety.current = safety;
  const replacing = useRef(false);
  const submittedQuery = useRef("");
  const resetWorkspaceSearch = useCallback(() => {
    searchRequestIdRef.current++; submittedQuery.current = "";
    if (nativeId.current) void cancelWorkspaceSearch(nativeId.current).catch(() => undefined);
    nativeId.current = null; setSearchWarning(null);
    setWorkspaceSearchResults([]); setSearchLoading(false); setSearchError(null);
  }, []);
  useEffect(() => { resetWorkspaceSearch(); return () => { searchRequestIdRef.current++; if (nativeId.current) void cancelWorkspaceSearch(nativeId.current).catch(() => undefined); }; }, [workspacePath, resetWorkspaceSearch]);
  const handleWorkspaceSearch = useCallback(async (query: string, options: WorkspaceSearchOptions = defaults) => {
    const request = ++searchRequestIdRef.current;
    if (nativeId.current) void cancelWorkspaceSearch(nativeId.current).catch(() => undefined);
    const requestId = crypto.randomUUID(); nativeId.current = requestId;
    submittedQuery.current = query;
    submittedOptions.current = options;
    if (!workspacePath || !query) { setWorkspaceSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true); setSearchError(null); setSearchWarning(null); setWorkspaceSearchResults([]);
    try {
      const response = await searchWorkspaceText(workspacePath, query, options, requestId);
      if (request !== searchRequestIdRef.current || currentRoot.current !== workspacePath) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Workspace search failed.");
      setWorkspaceSearchResults(response.data);
      setSearchWarning(response.limited ? response.reason ?? "Results are limited. Narrow the search." : null);
    } catch (error) {
      if (request === searchRequestIdRef.current && currentRoot.current === workspacePath) {
        setWorkspaceSearchResults([]); setSearchError(error instanceof Error ? error.message : String(error));
      }
    } finally { if (request === searchRequestIdRef.current && currentRoot.current === workspacePath) setSearchLoading(false); }
  }, [workspacePath]);
  const replace = async (files: WorkspaceSearchFile[], searchText: string, replacement: string, single: boolean) => {
    if (!workspacePath || replacing.current || !searchText || searchText !== submittedQuery.current) return;
    if (!latestSafety.current.transaction) { setSearchError("Safe document transaction unavailable; no files were replaced."); return; }
    replacing.current = true; setSearchError(null);
    let completed = 0;
    const options = submittedOptions.current;
    try {
      const allowed = await latestSafety.current.transaction(async () => {
        const dirty = files.find(file => latestSafety.current.isDirty?.(file.relativePath));
        if (dirty) throw new Error(`${dirty.relativePath} has unsaved editor changes. Save it and search again before replacing; no replacement was written.`);
        const response = await previewWorkspaceReplacement({ workspaceRoot: workspacePath, query: searchText, replacement, options, files, single });
        if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Cannot prepare replacement preview.");
        const plans = response.data;
        if (currentRoot.current !== workspacePath) throw new Error("Workspace changed; replacement stopped.");
        const preview = plans.map((plan) => `${plan.path}: ${plan.occurrences} occurrence(s)\n${plan.before.slice(0, 300)}\n→\n${plan.after.slice(0, 300)}`).join("\n\n");
        const accepted = latestSafety.current.review ? await latestSafety.current.review(plans) : window.confirm(`Save these ${single ? "selected" : "displayed"} replacements to disk? Unlisted lines are retained. Literal search keeps replacement text literal; regex uses $1, $\{name} and $$ captures.\n\n${preview.slice(0, 12000)}`);
        if (!accepted) return;
        const selected = Array.isArray(accepted) ? accepted : plans;
        if (new Set(selected).size !== selected.length || selected.some(plan => !plans.includes(plan))) throw new Error("Replacement review returned an invalid file selection.");
        if (searchText !== submittedQuery.current || submittedOptions.current !== options) throw new Error("Search scope changed during review. Prepare a new replacement preview.");
        for (const plan of selected) {
          if (currentRoot.current !== workspacePath) throw new Error("Workspace changed; remaining replacements stopped.");
          if (latestSafety.current.isDirty?.(plan.path)) throw new Error(`${plan.path} changed in the editor; remaining replacements stopped.`);
          const response = await writeWorkspaceFile(workspacePath, plan.path, plan.after, plan.before);
          if (!response.ok) throw new Error(response.error?.message ?? `Cannot save ${plan.path}.`);
          completed++;
        }
      });
      if (!allowed) throw new Error("Document preservation failed; replacement did not complete.");
      if (currentRoot.current === workspacePath) { latestSafety.current.onChanged?.(); await handleWorkspaceSearch(searchText, submittedOptions.current); }
    } catch (error) {
      if (currentRoot.current === workspacePath) {
        latestSafety.current.onChanged?.();
        setSearchError(`${error instanceof Error ? error.message : String(error)} ${completed} file(s) saved; remaining files were not changed. Review and search again.`);
      }
    } finally { replacing.current = false; }
  };
  const replaceMatch = (file: string, line: number, searchText: string, replacement: string) => {
    const found = workspaceSearchResults.find((item) => item.relativePath === file);
    const match = found?.matches.find((item) => item.line === line);
    return match ? replace([{ relativePath: file, matches: [match] }], searchText, replacement, true) : Promise.resolve();
  };
  const replaceAllMatches = (searchText: string, replacement: string) => replace(workspaceSearchResults, searchText, replacement, false);
  const cancelSearch = async () => {
    const id = nativeId.current; if (!id) return;
    try {
      const response = await cancelWorkspaceSearch(id);
      if (nativeId.current !== id) return;
      if (!response.ok) throw new Error(response.error?.message ?? "Search cancellation failed.");
      searchRequestIdRef.current++; nativeId.current = null; setSearchLoading(false); setSearchWarning("Search cancelled. Start a new search to get complete results.");
    } catch (error) { if (nativeId.current === id) setSearchError(error instanceof Error ? error.message : String(error)); }
  };
  return { searchLoading, workspaceSearchResults, searchError, searchWarning, cancelSearch, resetWorkspaceSearch, handleWorkspaceSearch, replaceMatch, replaceAllMatches };
}
