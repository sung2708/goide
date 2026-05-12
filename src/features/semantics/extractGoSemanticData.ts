import type {
  SemanticAnalysisResult,
  SemanticFold,
  SemanticSelectionRange,
  SemanticSymbol,
} from "./types";

export type SemanticSyntaxNode = {
  type: string;
  startIndex: number;
  endIndex: number;
  namedChildren: Array<SemanticSyntaxNode | null>;
  childForFieldName: (fieldName: string) => SemanticSyntaxNode | null;
};

type ExtractedSemanticData = Pick<
  SemanticAnalysisResult,
  "symbols" | "folds" | "selectionRanges"
>;

function nodeText(node: SemanticSyntaxNode | null, source: string): string | null {
  if (!node) {
    return null;
  }

  return source.slice(node.startIndex, node.endIndex).trim();
}

function pushFold(
  folds: SemanticFold[],
  source: string,
  from: number,
  to: number
): void {
  const openBraceIndex = source.indexOf("{", from);
  const closeBraceIndex = source.lastIndexOf("}", to - 1);
  if (openBraceIndex < 0 || closeBraceIndex <= openBraceIndex) {
    return;
  }

  folds.push({
    from: openBraceIndex + 1,
    to: closeBraceIndex,
  });
}

function maybeAddTypeSymbol(
  node: SemanticSyntaxNode,
  source: string,
  symbols: SemanticSymbol[],
  folds: SemanticFold[]
): void {
  if (node.type !== "type_spec") {
    return;
  }

  const nameNode = node.childForFieldName("name");
  const typeNode = node.childForFieldName("type");
  const name = nodeText(nameNode, source);
  if (!name || !typeNode) {
    return;
  }

  let kind: SemanticSymbol["kind"] | null = null;
  if (typeNode.type === "struct_type") {
    kind = "struct";
  } else if (typeNode.type === "interface_type") {
    kind = "interface";
  } else {
    kind = "type";
  }

  symbols.push({
    name,
    kind,
    range: {
      from: node.startIndex,
      to: node.endIndex,
    },
  });

  pushFold(folds, source, typeNode.startIndex, typeNode.endIndex);
}

function maybeAddCallableSymbol(
  node: SemanticSyntaxNode,
  source: string,
  symbols: SemanticSymbol[],
  folds: SemanticFold[]
): void {
  if (node.type !== "function_declaration" && node.type !== "method_declaration") {
    return;
  }

  const nameNode = node.childForFieldName("name");
  const bodyNode = node.childForFieldName("body");
  const name = nodeText(nameNode, source);
  if (!name) {
    return;
  }

  symbols.push({
    name,
    kind: node.type === "method_declaration" ? "method" : "function",
    range: {
      from: node.startIndex,
      to: node.endIndex,
    },
  });

  if (bodyNode) {
    pushFold(folds, source, bodyNode.startIndex, bodyNode.endIndex);
  }
}

function walkTree(
  node: SemanticSyntaxNode,
  source: string,
  symbols: SemanticSymbol[],
  folds: SemanticFold[],
  selectionRanges: SemanticSelectionRange[]
): void {
  if (node.type !== "source_file" && node.endIndex > node.startIndex) {
    selectionRanges.push({
      from: node.startIndex,
      to: node.endIndex,
    });
  }

  maybeAddTypeSymbol(node, source, symbols, folds);
  maybeAddCallableSymbol(node, source, symbols, folds);

  for (const child of node.namedChildren) {
    if (!child) {
      continue;
    }
    walkTree(child, source, symbols, folds, selectionRanges);
  }
}

function dedupeFolds(folds: SemanticFold[]): SemanticFold[] {
  const seen = new Set<string>();
  const result: SemanticFold[] = [];
  for (const fold of folds) {
    const key = `${fold.from}:${fold.to}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(fold);
  }
  return result;
}

export function extractGoSemanticData(
  root: SemanticSyntaxNode,
  source: string
): ExtractedSemanticData {
  const symbols: SemanticSymbol[] = [];
  const folds: SemanticFold[] = [];
  const selectionRanges: SemanticSelectionRange[] = [];

  walkTree(root, source, symbols, folds, selectionRanges);

  return {
    symbols,
    folds: dedupeFolds(folds),
    selectionRanges,
  };
}
