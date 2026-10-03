import type { SemanticSyntaxNode as Node } from "./extractGoSemanticData";
import type { SemanticEntryAction } from "./types";
const children = (node: Node | null) => node?.namedChildren.filter((child): child is Node => child !== null) ?? [];
const text = (node: Node | null, source: string) => node ? source.slice(node.startIndex, node.endIndex).trim() : "";

/** Reuse the worker's syntax tree; never scan comments/strings for declarations. */
export function extractEntryActions(root: Node, source: string): SemanticEntryAction[] {
  if (root.hasError || root.type !== "source_file") return [];
  const top = children(root);
  const packageNode = top.find(node => node.type === "package_clause");
  const packageName = text(children(packageNode ?? null).find(node => node.type === "package_identifier") ?? null, source);
  if (!packageName) return [];
  const testingAliases = new Set<string>();
  function imports(node: Node) {
    if (node.type === "import_spec") {
      const path = text(node.childForFieldName("path"), source);
      if (path === '\"testing\"' || path === "`testing`") {
        const alias = text(node.childForFieldName("name"), source) || "testing";
        if (alias !== "_") testingAliases.add(alias);
      }
    }
    for (const child of children(node)) imports(child);
  }
  for (const node of top.filter(node => node.type === "import_declaration")) imports(node);
  const actions: SemanticEntryAction[] = [];
  for (const node of top) {
    if (node.type !== "function_declaration" || node.hasError || !node.childForFieldName("body") || node.childForFieldName("result") || node.childForFieldName("type_parameters")) continue;
    const name = text(node.childForFieldName("name"), source);
    const params = children(node.childForFieldName("parameters"));
    if (name === "main" && packageName === "main" && params.length === 0) {
      actions.push({ kind: "main", name, range: { from: node.startIndex, to: node.endIndex } });
      continue;
    }
    // Match Go's Test naming rule, including Unicode identifiers; Native validates the saved target again.
    if (!/^Test(?:$|[^\p{Ll}])/u.test(name) || params.length !== 1 || params[0].type !== "parameter_declaration") continue;
    const parameter = params[0];
    if (children(parameter).filter(child => child.type === "identifier").length > 1) continue;
    const pointer = parameter.childForFieldName("type");
    if (pointer?.type !== "pointer_type") continue;
    const target = children(pointer)[0];
    const isTestingT = target?.type === "qualified_type"
      ? text(target.childForFieldName("name"), source) === "T" && testingAliases.has(text(target.childForFieldName("package"), source))
      : target?.type === "type_identifier" && text(target, source) === "T" && testingAliases.has(".");
    if (isTestingT) actions.push({ kind: "test", name, range: { from: node.startIndex, to: node.endIndex } });
  }
  return actions;
}
