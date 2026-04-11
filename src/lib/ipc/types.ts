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

export type RunOutputPayload = {
  runId: string;
  line: string;
  stream: "stdout" | "stderr" | "exit";
  exitCode?: number;
};
