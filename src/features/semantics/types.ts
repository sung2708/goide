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

export type SemanticAnalysisResult = {
  filePath: string;
  version: number;
  symbols: SemanticSymbol[];
  folds: SemanticFold[];
  selectionRanges: SemanticSelectionRange[];
};
