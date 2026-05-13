import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  WorkspaceBranchSnapshot,
  WorkspaceGitCommitDetail,
  WorkspaceGitGraphCommit,
  WorkspaceGitSnapshot,
} from "../../lib/ipc/types";

type GitPanelProps = {
  loading?: boolean;
  workspaceRoot?: string | null;
  snapshot: WorkspaceGitSnapshot | null;
  graph?: WorkspaceGitGraphCommit[];
  branchSnapshot?: WorkspaceBranchSnapshot | null;
  error?: string | null;
  commitLoading?: boolean;
  onOpenBranchPicker?: () => void;
  onStageFile?: (relativePath: string) => Promise<void>;
  onUnstageFile?: (relativePath: string) => Promise<void>;
  onCommit?: (message: string) => Promise<void>;
  onLoadCommitDetail?: (hash: string) => Promise<WorkspaceGitCommitDetail | null>;
};

type GitFileSection = "conflicts" | "staged" | "changes" | "untracked";

function classifyStatus(status: string): GitFileSection {
  const normalized = status.padEnd(2, " ").slice(0, 2);
  if (normalized === "??") return "untracked";
  const conflictStatuses = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
  if (conflictStatuses.has(normalized)) return "conflicts";
  if (normalized[0] !== " " && normalized[0] !== "?") return "staged";
  return "changes";
}

function parseRefs(rawRefs: string): string[] {
  const trimmed = rawRefs.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) return [];
  return trimmed.slice(1, -1).split(",").map((part) => part.trim()).filter(Boolean);
}

function splitRefs(refs: string[]) {
  const tags = refs.filter((ref) => ref.startsWith("tag: "));
  const remotes = refs.filter(
    (ref) => ref.startsWith("origin/") || ref.startsWith("upstream/") || ref.startsWith("remotes/")
  );
  const branches = refs.filter((ref) => !tags.includes(ref) && !remotes.includes(ref) && ref !== "HEAD");
  return { tags, remotes, branches };
}

function GraphLane({ prefix }: { prefix: string }) {
  const chars = Array.from(prefix);
  const commitLane = Math.max(0, chars.findIndex((char) => char === "*"));
  const laneGap = 10;
  const height = 26;
  const width = Math.max(1, chars.length) * laneGap + 4;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      {chars.map((char, index) => {
        const x = 2 + index * laneGap;
        if (char === "|" || char === "*") {
          return <line key={`v-${index}`} x1={x} y1={3} x2={x} y2={23} stroke="var(--overlay0)" strokeWidth="1" />;
        }
        if (char === "/") {
          return <line key={`f-${index}`} x1={x + laneGap} y1={3} x2={x} y2={23} stroke="var(--overlay0)" strokeWidth="1" />;
        }
        if (char === "\\") {
          return <line key={`b-${index}`} x1={x} y1={3} x2={x + laneGap} y2={23} stroke="var(--overlay0)" strokeWidth="1" />;
        }
        return null;
      })}
      <circle cx={2 + commitLane * laneGap} cy={13} r={3.2} fill="var(--blue)" />
    </svg>
  );
}

export default function GitPanel({
  loading = false,
  workspaceRoot,
  snapshot,
  graph = [],
  branchSnapshot,
  error = null,
  commitLoading = false,
  onOpenBranchPicker,
  onStageFile,
  onUnstageFile,
  onCommit,
  onLoadCommitDetail,
}: GitPanelProps) {
  const [commitMessage, setCommitMessage] = useState("");
  const [pendingFiles, setPendingFiles] = useState<Record<string, boolean>>({});
  const [activeCommitHash, setActiveCommitHash] = useState<string | null>(null);
  const [activeGraphCommit, setActiveGraphCommit] = useState<WorkspaceGitGraphCommit | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, WorkspaceGitCommitDetail>>({});
  const [activeHistoryTab, setActiveHistoryTab] = useState<"commits" | "graph">("graph");
  const hoverTimerRef = useRef<number | null>(null);
  const graphParentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCommitMessage("");
  }, [workspaceRoot]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveCommitHash(null);
        setActiveGraphCommit(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const changedFiles = snapshot?.changedFiles ?? [];
  const groupedFiles = useMemo(() => {
    const base = {
      conflicts: [] as typeof changedFiles,
      staged: [] as typeof changedFiles,
      changes: [] as typeof changedFiles,
      untracked: [] as typeof changedFiles,
    };
    for (const file of changedFiles) base[classifyStatus(file.status)].push(file);
    return base;
  }, [changedFiles]);

  const stagedCount = groupedFiles.staged.length;
  const hasCommitMessage = commitMessage.trim().length > 0;
  const activeDetail = activeCommitHash ? detailCache[activeCommitHash] : null;
  const graphVirtualizer = useVirtualizer({
    count: graph.length,
    getScrollElement: () => graphParentRef.current,
    estimateSize: () => 30,
    overscan: 8,
  });
  const graphItems = graphVirtualizer.getVirtualItems();

  const requestCommitDetail = (hash: string) => {
    if (!onLoadCommitDetail || detailCache[hash]) return;
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      void onLoadCommitDetail(hash).then((detail) => {
        if (!detail) return;
        setDetailCache((prev) => ({ ...prev, [hash]: detail }));
      });
    }, 110);
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // no-op
    }
  };

  const runFileAction = (path: string, action: "stage" | "unstage") => {
    if (pendingFiles[path]) return;
    setPendingFiles((prev) => ({ ...prev, [path]: true }));
    const task = action === "stage" ? onStageFile?.(path) : onUnstageFile?.(path);
    void Promise.resolve(task).finally(() => {
      setPendingFiles((prev) => ({ ...prev, [path]: false }));
    });
  };

  const renderFileSection = (title: string, key: GitFileSection, action: "stage" | "unstage", actionLabel: string) => {
    const files = groupedFiles[key];
    if (files.length === 0) return null;
    return (
      <section className="mt-2">
        <h4 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-(--overlay1)">{title}</h4>
        <div className="mt-1 space-y-0.5">
          {files.map((file) => (
            <div key={`${file.status}-${file.path}`} className="group flex h-8 items-center gap-2 rounded px-1.5 hover:bg-(--bg-hover)">
              <span className="w-7 rounded bg-[rgba(136,192,208,0.14)] px-1 text-center text-[10px] font-semibold text-(--blue)">
                {file.status.trim() || "·"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-(--subtext0)">{file.path}</span>
              <button
                type="button"
                title={actionLabel}
                onClick={() => runFileAction(file.path, action)}
                disabled={Boolean(pendingFiles[file.path])}
                className="rounded border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--overlay1) opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:bg-(--bg-hover) disabled:opacity-40"
              >
                {pendingFiles[file.path] ? "..." : action === "stage" ? "+" : "-"}
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="relative flex h-full flex-col bg-(--mantle)">
      <header className="flex items-center justify-between border-b border-(--border-subtle) px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-(--overlay1)">Source Control</p>
          <p className="truncate text-[12px] text-(--subtext1)">
            {snapshot ? snapshot.branch : error ? "Not a Git repository" : "No repository data"}
          </p>
        </div>
        {branchSnapshot && onOpenBranchPicker && (
          <button
            type="button"
            onClick={onOpenBranchPicker}
            aria-label="Switch branch"
            title="Switch branch"
            className="rounded border border-(--border-subtle) px-2 py-1 text-[10px] text-(--subtext1) hover:bg-(--bg-hover)"
          >
            Branch
          </button>
        )}
      </header>

      <div className="flex-1 overflow-auto px-2 py-2">
        {loading && <p className="px-1 py-2 text-[12px] text-(--overlay1)">Loading Git...</p>}
        {error && <p className="px-1 py-2 text-[12px] text-(--overlay1)">Git data is unavailable for this folder.</p>}
        {snapshot && !error && (
          <>
            <section className="rounded border border-(--border-subtle) bg-(--surface0) p-2">
              <input
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="Commit message"
                title="Commit message"
                className="h-8 w-full rounded border border-(--border-muted) bg-(--mantle) px-2 text-[12px] text-(--text) outline-none placeholder:text-(--overlay0) focus:border-(--border-active)"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-(--overlay1)">{stagedCount} staged</span>
                <button
                  type="button"
                  onClick={() => void onCommit?.(commitMessage.trim())}
                  disabled={!hasCommitMessage || stagedCount === 0 || commitLoading}
                  title="Commit staged changes"
                  className="rounded border border-(--border-subtle) px-2 py-1 text-[11px] font-medium text-(--subtext1) enabled:hover:bg-(--bg-hover) disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {commitLoading ? "Committing..." : "Commit"}
                </button>
              </div>
            </section>

            {renderFileSection("Merge Changes", "conflicts", "stage", "Stage file")}
            {renderFileSection("Staged Changes", "staged", "unstage", "Unstage file")}
            {renderFileSection("Changes", "changes", "stage", "Stage file")}
            {renderFileSection("Untracked", "untracked", "stage", "Stage file")}

            {changedFiles.length === 0 && (
              <p className="px-1 py-2 text-[12px] text-(--overlay0)">No pending changes.</p>
            )}

            <section className="mt-3">
              <div className="mb-1 flex items-center gap-1 px-1">
                <button
                  type="button"
                  title="Recent commits"
                  onClick={() => setActiveHistoryTab("commits")}
                  className={`rounded px-2 py-1 text-[10px] font-medium ${
                    activeHistoryTab === "commits" ? "bg-(--bg-hover) text-(--text)" : "text-(--overlay1) hover:bg-(--bg-hover)"
                  }`}
                >
                  Commits
                </button>
                <button
                  type="button"
                  title="Commit graph"
                  onClick={() => setActiveHistoryTab("graph")}
                  className={`rounded px-2 py-1 text-[10px] font-medium ${
                    activeHistoryTab === "graph" ? "bg-(--bg-hover) text-(--text)" : "text-(--overlay1) hover:bg-(--bg-hover)"
                  }`}
                >
                  Graph
                </button>
              </div>
              <div className="rounded border border-(--border-subtle) bg-(--surface0)">
                {activeHistoryTab === "commits" ? (
                  snapshot.commits.length === 0 ? (
                    <p className="px-2 py-2 text-[12px] text-(--overlay0)">No commits.</p>
                  ) : (
                    <div className="max-h-56 overflow-auto">
                      {snapshot.commits.map((commit) => (
                        <div
                          key={commit.hash}
                          className="px-2 py-1.5 hover:bg-(--bg-hover)"
                          onMouseEnter={() => {
                            setActiveCommitHash(commit.hash);
                            setActiveGraphCommit(null);
                            requestCommitDetail(commit.hash);
                          }}
                          onMouseLeave={() => setActiveCommitHash((current) => (current === commit.hash ? null : current))}
                        >
                          <p className="truncate text-[11px] text-(--subtext0)">{commit.subject}</p>
                          <p className="truncate text-[10px] text-(--overlay1)">
                            {commit.hash} | {commit.author} | {commit.relativeTime}
                          </p>
                        </div>
                      ))}
                    </div>
                  )
                ) : graph.length === 0 ? (
                  <p className="px-2 py-2 text-[12px] text-(--overlay0)">No commit history.</p>
                ) : (
                  <div ref={graphParentRef} className="max-h-56 overflow-auto">
                    <div style={{ height: `${graphVirtualizer.getTotalSize()}px`, position: "relative" }}>
                      {graphItems.map((item) => {
                        const commit = graph[item.index];
                        const refs = splitRefs(parseRefs(commit.refs));
                        return (
                          <div
                            key={commit.hash}
                            className="absolute left-0 top-0 flex h-[30px] w-full items-center gap-1 px-2 hover:bg-(--bg-hover)"
                            style={{ transform: `translateY(${item.start}px)` }}
                            onMouseEnter={() => {
                              setActiveCommitHash(commit.hash);
                              setActiveGraphCommit(commit);
                              requestCommitDetail(commit.hash);
                            }}
                            onMouseLeave={() => {
                              setActiveCommitHash((current) => (current === commit.hash ? null : current));
                              setActiveGraphCommit((current) => (current?.hash === commit.hash ? null : current));
                            }}
                          >
                            <GraphLane prefix={commit.graphPrefix} />
                            <span className="min-w-0 flex-1 truncate text-[11px] text-(--subtext0)">{commit.subject}</span>
                            {refs.branches.slice(0, 1).map((ref) => (
                              <span key={`${commit.hash}-${ref}`} className="rounded bg-[rgba(136,192,208,0.12)] px-1 py-0.5 text-[9px] text-(--overlay1)">
                                {ref}
                              </span>
                            ))}
                            {refs.tags.slice(0, 1).map((ref) => (
                              <span key={`${commit.hash}-${ref}`} className="rounded bg-[rgba(163,190,140,0.14)] px-1 py-0.5 text-[9px] text-(--overlay1)">
                                {ref.replace("tag: ", "")}
                              </span>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {activeDetail && (
        <aside className="absolute bottom-2 right-2 z-20 w-[350px] rounded-md border border-(--border-muted) bg-(--base) p-2 text-[11px] text-(--subtext1) shadow-[var(--panel-shadow)]">
          <p className="truncate font-semibold text-(--text)">{activeDetail.subject}</p>
          <p className="mt-1 truncate">
            {activeDetail.author} ({activeDetail.email || "n/a"}) • {activeDetail.relativeTime}
          </p>
          <p className="truncate text-[10px] text-(--overlay1)">{activeDetail.dateIso}</p>
          <div className="mt-1 flex items-center gap-1">
            <p className="font-code text-[10px] text-(--overlay1)">{activeDetail.shortHash}</p>
            <button
              type="button"
              title="Copy short hash"
              onClick={() => void copyText(activeDetail.shortHash)}
              className="rounded border border-(--border-subtle) px-1 text-[9px] hover:bg-(--bg-hover)"
            >
              Copy
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1">
            <p className="min-w-0 flex-1 truncate font-code text-[10px] text-(--overlay1)">{activeDetail.hash}</p>
            <button
              type="button"
              title="Copy full hash"
              onClick={() => void copyText(activeDetail.hash)}
              className="rounded border border-(--border-subtle) px-1 text-[9px] hover:bg-(--bg-hover)"
            >
              Copy
            </button>
          </div>
          {activeDetail.parents.length > 0 && (
            <p className="mt-1 truncate text-[10px] text-(--overlay1)">
              Parents: {activeDetail.parents.slice(0, 3).join(", ")}
            </p>
          )}
          {activeGraphCommit && (() => {
            const refs = splitRefs(parseRefs(activeGraphCommit.refs));
            const compactRefs = [...refs.branches, ...refs.remotes, ...refs.tags.map((tag) => tag.replace("tag: ", ""))];
            if (compactRefs.length === 0) return null;
            return (
              <p className="mt-1 truncate text-[10px] text-(--overlay1)">
                Refs: {compactRefs.slice(0, 4).join(", ")}
              </p>
            );
          })()}
          <p className="mt-1">{activeDetail.filesChanged} files, +{activeDetail.insertions} / -{activeDetail.deletions}</p>
          {activeDetail.body && <p className="mt-1 line-clamp-3 text-[10px] text-(--overlay1)">{activeDetail.body}</p>}
        </aside>
      )}
    </div>
  );
}

