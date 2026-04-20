import type { WorkspaceGitSnapshot } from "../../lib/ipc/types";

type GitPanelProps = {
  loading?: boolean;
  snapshot: WorkspaceGitSnapshot | null;
  error?: string | null;
};

function GitPanel({ loading = false, snapshot, error = null }: GitPanelProps) {
  const isGitUnavailable = Boolean(error);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border-muted)] px-4 py-3">
        <p className="text-[12px] font-semibold uppercase text-[var(--overlay1)] text-balance">
          Git
        </p>
        <p className="mt-1 truncate whitespace-nowrap text-[13px] font-medium text-[var(--subtext1)]">
          {snapshot ? `Branch: ${snapshot.branch}` : isGitUnavailable ? "Not a Git repository" : "No repository data"}
        </p>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {loading && <p className="px-2 py-1.5 text-[13px] text-[var(--overlay1)]">Loading Git...</p>}
        {error && <p className="px-2 py-1.5 text-[13px] text-[var(--overlay1)]">Git is unavailable for this folder.</p>}
        {snapshot && !isGitUnavailable && (
          <>
            <div className="mb-3">
              <p className="px-2 py-1.5 text-[12px] font-semibold text-[var(--subtext1)]">
                Changed Files
              </p>
              {snapshot.changedFiles.length === 0 ? (
                <p className="px-2 py-1.5 text-[13px] text-[var(--overlay0)]">
                  Working tree clean.
                </p>
              ) : (
                snapshot.changedFiles.map((file) => (
                  <div
                    key={`${file.status}-${file.path}`}
                    className="flex items-center gap-2 px-2 py-1.5 text-[13px]"
                  >
                    <span className="w-7 rounded bg-[rgba(140,170,238,0.12)] px-1 text-center text-[11px] font-semibold text-[var(--blue)]">
                      {file.status}
                    </span>
                    <span className="truncate text-[var(--subtext0)]">{file.path}</span>
                  </div>
                ))
              )}
            </div>
            <div>
              <p className="px-2 py-1.5 text-[12px] font-semibold text-[var(--subtext1)]">
                Recent Commits
              </p>
              {snapshot.commits.length === 0 ? (
                <p className="px-2 py-1.5 text-[13px] text-[var(--overlay0)]">No recent commits.</p>
              ) : (
                snapshot.commits.map((commit) => (
                  <div key={commit.hash} className="px-2 py-2">
                    <p className="truncate text-[13px] text-[var(--text)]">{commit.subject}</p>
                    <p className="mt-0.5 truncate text-[12px] text-[var(--overlay1)]">
                      {commit.hash} · {commit.author} · {commit.relativeTime}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default GitPanel;
