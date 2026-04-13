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

export type CompletionItem = {
  label: string;
  detail?: string | null;
  kind?: string | null;
  insertText: string;
  range?: CompletionRange | null;
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

export type RuntimeSignal = {
  threadId: number;
  status: string;
  waitReason: string;
  confidence: ConcurrencyConfidence;
  scopeKey: string;
  relativePath: string;
  line: number;
  column: number;
  correlationId?: string | null;
  counterpartRelativePath?: string | null;
  counterpartLine?: number | null;
  counterpartColumn?: number | null;
  counterpartConfidence?: ConcurrencyConfidence | null;
};
