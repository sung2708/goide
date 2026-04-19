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
