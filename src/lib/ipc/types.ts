export type ApiError = {
  code: string;
  message: string;
};

export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: ApiError;
};

export type FsEntry = {
  name: string;
  path: string;
  isDir: boolean;
};
export type WorkspaceFileInfo = { sizeBytes: number; readOnly: boolean };

export type WorkspaceFsSyncMode = "watch" | "polling";

export type StartWorkspaceFsWatchResponse = {
  workspaceRoot: string;
  watchId: string;
  mode: WorkspaceFsSyncMode;
};

export type ConcurrencyConstructKind =
  | "channel"
  | "select"
  | "mutex"
  | "waitGroup";

export enum ConcurrencyConfidence {
  Predicted = "predicted",
  Likely = "likely",
  Confirmed = "confirmed",
}

export type ChannelOperation = "send" | "receive";

export type ConcurrencyConstruct = {
  kind: ConcurrencyConstructKind;
  line: number;
  column: number;
  symbol: string | null;
  scopeKey?: string | null;
  confidence: ConcurrencyConfidence;
  channelOperation?: ChannelOperation | null;
};

export type AnalyzeConcurrencyRequest = {
  workspaceRoot: string;
  relativePath: string;
};

export type CompletionRequest = {
  requestId?: string;
  workspaceRoot: string;
  relativePath: string;
  line: number;
  column: number;
  triggerCharacter?: string | null;
  fileContent?: string | null;
};

export type CompletionRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type CompletionTextEdit = {
  range: CompletionRange;
  newText: string;
};

export type CompletionItem = {
  label: string;
  detail?: string | null;
  documentation?: string | null;
  kind?: string | null;
  insertText: string;
  range?: CompletionRange | null;
  additionalTextEdits?: CompletionTextEdit[];
};

export type RunOutputPayload = {
  runId: string;
  line: string;
  stream: "stdout" | "stderr" | "exit";
  exitCode?: number;
};

export type DiagnosticSeverity = "error" | "warning" | "info";

export type EditorDiagnosticRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type EditorDiagnostic = {
  severity: DiagnosticSeverity;
  message: string;
  source?: string | null;
  code?: string | null;
  range: EditorDiagnosticRange;
};

export type DiagnosticsToolingAvailability = "available" | "unavailable";

export type DiagnosticsResponse = {
  diagnostics: EditorDiagnostic[];
  toolingAvailability: DiagnosticsToolingAvailability;
};

export type LanguageQueryKind = "definition" | "references" | "hover";
export type GoProjectRequest = { workspaceRoot: string; relativeDirectory: string; requestId: string };
export type GoModuleAction = "tidy" | "download";
export type GoModuleRequest = GoProjectRequest & { action: GoModuleAction; expectedWorkFile: string | null };
export type GoModuleOutput = { action: GoModuleAction; directory: string; success: boolean; exitCode: number | null; stdout: string; stderr: string };
export type GoProjectInfo = {
  directory: string; mode: "workspace" | "module" | "directory"; workFile: string | null; workError: string | null; limited: boolean;
  modules: { directory: string; relativeDirectory: string | null; modFile: string; insideWorkspace: boolean; modulePath: string | null; goVersion: string | null; error: string | null }[];
  environment: Record<"GOROOT" | "GOPATH" | "GOMOD" | "GOWORK" | "GOVERSION" | "GOOS" | "GOARCH" | "CGO_ENABLED" | "GOTOOLCHAIN", string>;
};
export type LanguageLocation = { path: string; line: number; column: number; endLine: number; endColumn: number };
export type LanguageQuery = { requestId?: string; workspaceRoot: string; relativePath: string; line: number; column: number; kind: LanguageQueryKind; buffers: { path: string; content: string }[] };
export type LanguageCancelRequest = { workspaceRoot: string; requestId: string };
export type LanguageQueryResult = { locations: LanguageLocation[]; text: string | null; outsideWorkspace: number };
export type SignatureParameter = { label: string; range: [number, number] | null; documentation: string | null };
export type SignatureInformation = { label: string; documentation: string | null; parameters: SignatureParameter[]; activeParameter: number | null };
export type SignatureHelp = { signatures: SignatureInformation[]; activeSignature: number };
export type LanguageFormatRequest = { requestId?: string; workspaceRoot: string; relativePath: string; buffers: { path: string; content: string }[] };
export type LanguageEditPlan = { files: { path: string; before: string; after: string; readOnly: boolean }[]; rename?: { oldName: string; newName: string } };
export type LanguageRenameRequest = { query: LanguageQuery; newName: string };

export type DeepTraceConstructKind =
  | "channel"
  | "select"
  | "mutex"
  | "wait-group";

export type ActivateDeepTraceRequest = {
  workspaceRoot: string;
  relativePath: string;
  line: number;
  column: number;
  constructKind: DeepTraceConstructKind;
  symbol?: string | null;
  counterpartRelativePath?: string | null;
  counterpartLine?: number | null;
  counterpartColumn?: number | null;
  counterpartConfidence?: ConcurrencyConfidence | null;
};

export type ActivateDeepTraceResponse = {
  mode: "deep-trace";
  scopeKey?: string | null;
};

export type StartDebugSessionRequest = {
  workspaceRoot: string;
  relativePath: string;
};

export type RuntimeAvailabilityResponse = {
  runtimeAvailability: "available" | "unavailable";
};

export type ToolAvailability = {
  available: boolean;
  version?: string | null;
  path?: string | null;
  status?: "ready" | "missing" | "failed" | "unknown";
  error?: string | null;
};

export type ToolchainStatus = {
  go: ToolAvailability;
  gopls: ToolAvailability;
  delve: ToolAvailability;
};
export type ToolPaths = { go: string; gopls: string; dlv: string };

export type RuntimeSignal = {
  threadId: number;
  status: string;
  waitReason: string;
  confidence: ConcurrencyConfidence;
  scopeKey: string;
  scopeRelativePath?: string;
  scopeLine?: number;
  scopeColumn?: number;
  relativePath: string;
  line: number;
  column: number;
  sampleRelativePath?: string | null;
  sampleLine?: number | null;
  sampleColumn?: number | null;
  correlationId?: string | null;
  counterpartRelativePath?: string | null;
  counterpartLine?: number | null;
  counterpartColumn?: number | null;
  counterpartConfidence?: ConcurrencyConfidence | null;
};

export type RuntimePanelSnapshot = {
  sessionActive: boolean;
  signalCount: number;
  blockedCount: number;
  goroutineCount: number;
};

export type RuntimeTopologyInteraction = {
  threadId: number;
  kind: string;
  waitReason: string;
  source: string;
  target?: string | null;
  confidence: ConcurrencyConfidence;
};

export type RuntimeTopologySnapshot = {
  sessionActive: boolean;
  interactions: RuntimeTopologyInteraction[];
};

export type DebuggerBreakpoint = {
  relativePath: string;
  line: number;
};

/**
 * Lower-level debugger session state already used by current debugger
 * controls. Keep this aligned with `DebugSessionSnapshot`, which is the
 * higher-level frontend lifecycle wrapper for the rebuilt debug flow.
 */
export type DebuggerState = {
  sessionActive: boolean;
  paused: boolean;
  activeRelativePath?: string | null;
  activeLine?: number | null;
  activeColumn?: number | null;
  breakpoints: DebuggerBreakpoint[];
};

export type DebugFailure = {
  code: string;
  title: string;
  message: string;
  details: string | null;
};

export type DebugSessionSnapshot = {
  status: "idle" | "starting" | "running" | "paused" | "stopping" | "failed";
  paused: boolean;
  activeRelativePath: string | null;
  activeLine: number | null;
  activeColumn: number | null;
  breakpoints: DebuggerBreakpoint[];
  failure: DebugFailure | null;
};

export type ToggleBreakpointRequest = {
  relativePath: string;
  line: number;
};

export type WorkspaceSearchMatch = {
  line: number;
  preview: string;
};

export type WorkspaceSearchFile = {
  relativePath: string;
  matches: WorkspaceSearchMatch[];
};

export type WorkspaceGitChangedFile = {
  path: string;
  status: string;
};

export type WorkspaceGitCommit = {
  hash: string;
  author: string;
  relativeTime: string;
  subject: string;
};

export type WorkspaceGitSnapshot = {
  branch: string;
  changedFiles: WorkspaceGitChangedFile[];
  commits: WorkspaceGitCommit[];
};

export type WorkspaceGitGraphEntry = {
  line: string;
};

export type WorkspaceGitGraphCommit = {
  graphPrefix: string;
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  email: string;
  dateIso: string;
  relativeTime: string;
  refs: string;
  subject: string;
};

export type WorkspaceGitFileActionRequest = {
  workspaceRoot: string;
  relativePath: string;
};

export type WorkspaceGitCommitRequest = {
  workspaceRoot: string;
  message: string;
};

export type WorkspaceGitCommitFileStat = {
  path: string;
  additions: number;
  deletions: number;
};

export type WorkspaceGitCommitDetail = {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  email: string;
  relativeTime: string;
  dateIso: string;
  subject: string;
  body: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: WorkspaceGitCommitFileStat[];
  patchPreview: string;
};

export type WorkspaceGitBranch = {
  name: string;
  kind: "current" | "local" | "remote";
  isCurrent: boolean;
  upstream?: string | null;
  isRemoteTrackingCandidate: boolean;
  /** Remote name for remote-tracking branches, e.g. "origin" or "upstream". */
  remoteName?: string | null;
  /**
   * Full remote ref for remote-tracking branches, e.g. "origin/develop".
   * This is the value passed to `git switch --track` when creating a local
   * tracking branch.  Absent for local/current branches.
   */
  remoteRef?: string | null;
};

export type WorkspaceGitChangedFileSummary = {
  path: string;
  status: string;
};

export type WorkspaceBranchSnapshot = {
  currentBranch: string | null;
  isDetachedHead: boolean;
  detachedHeadRef: string | null;
  branches: WorkspaceGitBranch[];
  hasUncommittedChanges: boolean;
  changedFilesSummary: WorkspaceGitChangedFileSummary[];
};

export type SwitchWorkspaceBranchRequest = {
  workspaceRoot: string;
  targetBranch: string;
  /**
   * Full remote ref to use as the tracking source when creating a new local
   * branch (e.g. "upstream/develop").  Should be set from
   * `WorkspaceGitBranch.remoteRef` when switching to a remote branch.
   */
  remoteRef?: string | null;
  preSwitchAction: "none" | "commit" | "stash" | "discard";
  commitMessage?: string | null;
};

// ---- Shell session IPC types ----

/** Identifies which tab in the BottomPanel is active. */
export type BottomPanelTab = "logs" | "shell" | "problems";

/** Request to create or reuse a shell session for a given workspace surface. */
export type EnsureShellSessionRequest = {
  workspaceRoot: string;
  surfaceKey: string;
  cwdRelativePath?: string;
};

/** Response from ensureShellSession. */
export type EnsureShellSessionResponse = {
  shellSessionId: string;
  reused: boolean;
  shellHealth: "launch" | "degraded" | "exit";
  selectedShell: string | null;
  /**
   * Buffered PTY output to replay into a fresh xterm surface.
   * Non-empty when `reused` is true and the session has prior output.
   * Empty string for brand-new sessions.
   */
  replay: string;
};

/** Send raw PTY input data to an active shell session. */
export type ShellInputRequest = {
  shellSessionId: string;
  data: string;
};

/** Notify the backend of a terminal resize for an active shell session. */
export type ShellResizeRequest = {
  shellSessionId: string;
  cols: number;
  rows: number;
};

/** Dispose (terminate) an active shell session. */
export type DisposeShellSessionRequest = {
  shellSessionId: string;
};

/** Event payload for shell output arriving from the backend. */
export type ShellOutputPayload = {
  shellSessionId: string;
  data: string;
};
export type { GitRepositoryStatus, GitFileStatus, GitFileDiff, GitHistoryCommit, GitHistoryPage, GitCommitDetails, GitConflictContent, GitMutation } from "./git";
export type WorkspaceSearchOptions = { matchCase: boolean; wholeWord: boolean; useRegex: boolean; include: string[]; exclude: string[] };
export type WorkspaceSearchReport = { files: WorkspaceSearchFile[]; limited: boolean; reason: string | null; scannedFiles: number };
export type WorkspaceReplacementRequest = { workspaceRoot: string; query: string; replacement: string; options: WorkspaceSearchOptions; files: WorkspaceSearchFile[]; single: boolean };
export type WorkspaceReplacementPlan = { path: string; before: string; after: string; occurrences: number };

export type LanguageCodeAction = { title: string; kind: string | null; preferred: boolean; disabledReason: string | null };
export type LanguageCodeActionQuery = { query: LanguageQuery; diagnostics: EditorDiagnostic[] };
export type LanguageCodeActionPreview = { query: LanguageCodeActionQuery; action: LanguageCodeAction };
