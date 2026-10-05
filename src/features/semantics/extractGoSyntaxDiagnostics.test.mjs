import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { extractGoSyntaxDiagnostics } from "./extractGoSyntaxDiagnostics";
let parser;
beforeAll(async () => { await Parser.init({ wasmBinary: readFileSync("node_modules/web-tree-sitter/web-tree-sitter.wasm") }); parser = new Parser(); parser.setLanguage(await Language.load("node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-go.wasm")); });
afterAll(() => parser.delete());
function diagnostics(source) { const tree = parser.parse(source); try { return extractGoSyntaxDiagnostics(tree.rootNode); } finally { tree.delete(); } }
it("reports missing syntax through the real Go parser without gopls", () => {
  const source = 'package main\nfunc main() {\n';
  const errors = diagnostics(source);
  expect(errors.length).toBeGreaterThan(0);
  for (const error of errors) { expect(error.range.from).toBeGreaterThanOrEqual(0); expect(error.range.to).toBeLessThanOrEqual(source.length); }
});
it("clears syntax errors after a fix and does not invent errors in comments or strings", () => {
  expect(diagnostics('package main\n// } syntax\nfunc main() { _ = "👋 thiếu }" }\n')).toEqual([]);
});
it("keeps real Unicode offsets on the row containing invalid code", () => {
  const source = 'package main\n// tiếng Việt 👋\nvar = 1\n';
  const errors = diagnostics(source); expect(errors.length).toBeGreaterThan(0);
  expect(source.slice(0, errors[0].range.from).split('\n').length).toBe(3);
});
