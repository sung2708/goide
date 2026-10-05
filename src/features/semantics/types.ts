export type SemanticRange = {
  from: number;
  to: number;
};

export type SemanticSymbol = {
  name: string;
  kind: "function" | "method" | "type" | "interface" | "struct";
  range: SemanticRange;
};

export type SemanticFold = {
  from: number;
  to: number;
  placeholder?: string;
};

export type SemanticSelectionRange = {
  from: number;
  to: number;
};

export type SemanticEntryAction = {
  kind: "main" | "test";
  name: string;
  range: SemanticRange;
};

export type SemanticAnalysisResult = {
  syntaxDiagnostics?: import("./extractGoSyntaxDiagnostics").GoSyntaxDiagnostic[];
  entryActions?: SemanticEntryAction[];
  /** Added by the client from the exact synced version, never inferred from a later buffer. */
  sourceText?: string;
  filePath: string;
  version: number;
  symbols: SemanticSymbol[];
  folds: SemanticFold[];
  selectionRanges: SemanticSelectionRange[];
};
