import type { SemanticSyntaxNode } from "./extractGoSemanticData";
import type { SemanticRange } from "./types";

export type GoSyntaxDiagnostic = { range: SemanticRange; message: string };
/** Use the already parsed worker tree; no network or filesystem round trip. */
export function extractGoSyntaxDiagnostics(root: SemanticSyntaxNode): GoSyntaxDiagnostic[] {
  const results: GoSyntaxDiagnostic[] = [];
  const visit = (node: SemanticSyntaxNode) => {
    if (results.length >= 100) return;
    if (node.isMissing) {
      results.push({ range: { from: node.startIndex, to: node.endIndex }, message: `Expected ${node.type}.` });
      return;
    }
    const before = results.length;
    for (const child of node.children ?? node.namedChildren) if (child && (child.hasError || child.isMissing || child.type === "ERROR")) visit(child);
    if (node.type === "ERROR" && results.length === before) results.push({ range: { from: node.startIndex, to: node.endIndex }, message: "Invalid Go syntax." });
  };
  if (root.hasError || root.type === "ERROR") visit(root);
  return results;
}
