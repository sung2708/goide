import type { WorkspaceSession } from "../../features/workspaces/history";
type WelcomeScreenProps = {
  workspacePath: string | null;
  isOpening: boolean;
  onOpenWorkspace: () => void;
  onNewProject?: () => void;
  onQuickOpen: () => void;
  onSearch: () => void;
  onTerminal: () => void;
  error?: string | null;
  recentWorkspaces?: readonly WorkspaceSession[];
  onReopenWorkspace?: (root: string) => void;
  onForgetWorkspace?: (root: string) => void;
};

export default function WelcomeScreen({
  workspacePath,
  isOpening,
  onOpenWorkspace,
  onNewProject,
  onQuickOpen,
  onSearch,
  onTerminal,
  error,
  recentWorkspaces = [],
  onReopenWorkspace,
  onForgetWorkspace,
}: WelcomeScreenProps) {
  const folderName = workspacePath ? workspacePath.split(/[\\/]/).pop() : null;

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        {/* Minimal Brand Header */}
        <header className="welcome-header">
          <div className="welcome-brand-mark">
            <img src="/brand/icon-small.svg" alt="" width="28" height="28" className="welcome-mascot-sm" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="welcome-title">Goro</h1>
                <span className="welcome-badge">Go IDE</span>
              </div>
              <p className="welcome-subtitle">Understand Go in motion.</p>
            </div>
          </div>
        </header>

        {/* Active Workspace Pill if loaded */}
        {folderName && (
          <div className="welcome-workspace-pill">
            <div className="flex items-center gap-2 min-w-0">
              <span className="welcome-status-dot" />
              <span className="welcome-workspace-label">Workspace active:</span>
              <span className="welcome-workspace-name truncate" title={workspacePath ?? ""}>
                {folderName}
              </span>
            </div>
            <button
              type="button"
              className="welcome-pill-action"
              onClick={onOpenWorkspace}
              disabled={isOpening}
            >
              Switch
            </button>
          </div>
        )}

        {/* Error notification if any */}
        {error && (
          <div role="alert" className="welcome-error-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Unified Precision Actions List */}
        <nav className="welcome-actions" aria-label="Quick actions">
          {onNewProject && <button type="button" className="welcome-action-item" onClick={onNewProject} disabled={isOpening}><span className="welcome-action-left">New Go Project…</span></button>}
          <button
            type="button"
            className="welcome-action-item welcome-action-primary"
            onClick={onOpenWorkspace}
            disabled={isOpening}
            aria-label="Open workspace folder"
          >
            <span className="welcome-action-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
              </svg>
              <span>{isOpening ? "Opening folder…" : "Open Folder…"}</span>
            </span>
            <kbd>Ctrl O</kbd>
          </button>

          <button
            type="button"
            className="welcome-action-item"
            onClick={onQuickOpen}
            disabled={!workspacePath}
            title={workspacePath ? "Search files by name" : "Open a folder first"}
          >
            <span className="welcome-action-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>Go to File…</span>
            </span>
            <kbd>Ctrl P</kbd>
          </button>

          <button
            type="button"
            className="welcome-action-item"
            onClick={onSearch}
          >
            <span className="welcome-action-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <span>Find in Files…</span>
            </span>
            <kbd>Ctrl Shift F</kbd>
          </button>

          <button
            type="button"
            className="welcome-action-item"
            onClick={onTerminal}
            disabled={!workspacePath}
            title={workspacePath ? "Open terminal" : "Open a folder first"}
          >
            <span className="welcome-action-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              <span>Open Terminal</span>
            </span>
            <kbd>Ctrl `</kbd>
          </button>
        </nav>

        {recentWorkspaces.length > 0 && <section aria-label="Recent workspaces">
          <h3 className="welcome-section-label">RECENT WORKSPACES</h3>
          {recentWorkspaces.map(({ root }) => <div key={root} className="flex items-center gap-2">
            <button type="button" className="welcome-action-item min-w-0 flex-1" disabled={isOpening} onClick={() => onReopenWorkspace?.(root)} title={root}>
              <span className="truncate">{root}</span>
            </button>
            <button type="button" disabled={isOpening} aria-label={`Remove ${root} from recent workspaces`} onClick={() => onForgetWorkspace?.(root)}>Remove</button>
          </div>)}
        </section>}
        {/* Minimal Footer */}
        <footer className="welcome-footer">
          <div className="flex items-center gap-2">
            <span className="welcome-engine-tag">LOCAL WORKSPACE</span>
          </div>
          <span className="welcome-credit">Goro · A desktop IDE for Go</span>
        </footer>
      </div>
    </div>
  );
}
