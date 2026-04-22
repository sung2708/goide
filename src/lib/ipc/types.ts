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
};

export type ToolchainStatus = {
  go: ToolAvailability;
  gopls: ToolAvailability;
  delve: ToolAvailability;
};

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
