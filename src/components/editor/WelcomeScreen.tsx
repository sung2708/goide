type WelcomeScreenProps = {
  workspacePath: string | null;
  isOpening: boolean;
  onOpenWorkspace: () => void;
  onQuickOpen: () => void;
  onSearch: () => void;
  onTerminal: () => void;
  error?: string | null;
};

export default function WelcomeScreen({
  workspacePath, isOpening, onOpenWorkspace, onQuickOpen, onSearch, onTerminal, error,
}: WelcomeScreenProps) {
  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <p className="welcome-eyebrow"><span className="welcome-dot" /> A WORKSPACE FOR GO</p>
        <h2 className="welcome-wordmark">
          <img className="welcome-mascot" src="/brand/mascot.svg" alt="" width="104" height="104" />
          Goro
        </h2>
        <p className="welcome-tagline">Understand Go in motion.</p>
        <div className="welcome-grid">
          <section aria-label="Start working">
            <h3 className="welcome-section-label">01 / START</h3>
            <button type="button" className="welcome-primary" onClick={onOpenWorkspace} disabled={isOpening}>
              <span>{isOpening ? "Opening…" : "Open Workspace"}</span><span aria-hidden="true">↗</span>
            </button>
            <p className="welcome-description">
              {workspacePath ? "Workspace Active. Select a file from the explorer or find it by name." : "Open a folder. Make yourself at home."}
            </p>
            {workspacePath && <p className="welcome-workspace" title={workspacePath}>{workspacePath.split(/[\\/]/).pop()}</p>}
            {error && <p role="alert" className="text-sm text-(--red)">{error}</p>}
          </section>
          <section aria-label="Workspace tools">
            <h3 className="welcome-section-label">02 / YOUR TOOLS</h3>
            <button type="button" className="welcome-tool" onClick={onQuickOpen} disabled={!workspacePath}>
              <span>Find a file</span><kbd>Ctrl P</kbd>
            </button>
            <button type="button" className="welcome-tool" onClick={onSearch}>
              <span>Search workspace</span><kbd>Ctrl Shift F</kbd>
            </button>
            <button type="button" className="welcome-tool" onClick={onTerminal} disabled={!workspacePath}>
              <span>Open terminal</span><span aria-hidden="true">↗</span>
            </button>
          </section>
        </div>
        <div className="welcome-footnote"><span>CODE · RUNTIME · CONCURRENCY</span><span>BUILT FOR GO ↗</span></div>
        <p className="welcome-brand-credit">Go gopher by Renee French · CC BY 4.0 · adapted for Goro</p>
      </div>
    </div>
  );
}
