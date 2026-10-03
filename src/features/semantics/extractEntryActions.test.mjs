import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { extractGoSemanticData } from "./extractGoSemanticData";
let parser;
beforeAll(async () => { await Parser.init({ wasmBinary: readFileSync("node_modules/web-tree-sitter/web-tree-sitter.wasm") }); parser = new Parser(); parser.setLanguage(await Language.load("node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-go.wasm")); });
afterAll(() => parser.delete());
function actions(source) { const tree = parser.parse(source); try { return extractGoSemanticData(tree.rootNode, source).entryActions ?? []; } finally { tree.delete(); } }
it("finds only actual top-level executable main declarations", () => {
  expect(actions('package main\n// func TestFake(t *testing.T) {}\nvar label = `func main() {}`\nfunc main() {}').map(a => a.name)).toEqual(["main"]);
  for (const source of ['package library\nfunc main() {}', 'package main\nfunc main(x int) {}', 'package main\nfunc main() int { return 0 }', 'package main\nfunc main[T any]() {}', 'package main\nfunc (x S) main() {}', 'package main\nfunc main(']) expect(actions(source)).toEqual([]);
});
it("recognizes Test signatures through real Go import/parameter syntax", () => {
  const source = 'package checks\nimport t "testing"\nfunc TestOne(t *t.T) {}\nfunc TestTwo(*t.T) {}\nfunc Test(t *t.T) {}\nfunc Test_wrong(t *t.T) {}\nfunc Testbad(t *t.T) {}\nfunc TestNo(t t.T) {}\nfunc TestMany(a,b *t.T) {}\nfunc TestReturns(t *t.T) bool { return true }\nfunc TestGeneric[A any](t *t.T) {}\nfunc (x S) TestMethod(t *t.T) {}';
  expect(actions(source).map(a => a.name)).toEqual(["TestOne", "TestTwo", "Test", "Test_wrong"]);
  expect(actions('package checks\nimport . "testing"\nfunc TestDot(t *T) {}').map(a => a.name)).toEqual(["TestDot"]);
  expect(actions('package checks\nimport _ "testing"\nfunc TestUnused(t *testing.T) {}')).toEqual([]);
  expect(actions('package checks\nimport "elsewhere/testing"\nfunc TestForeign(t *testing.T) {}')).toEqual([]);
});
it("supports grouped/raw imports and rejects malformed source or shadow packages", () => {
  expect(actions('package checks\nimport (`testing`; "fmt")\nfunc TestRaw(t *testing.T) {}').map(a => a.name)).toEqual(["TestRaw"]);
  expect(actions('package checks\nimport "testing"\nfunc TestBroken(t *testing.T) {')).toEqual([]);
  expect(actions('package checks\nimport "testing"\nfunc TestWrong(t *other.T) {}')).toEqual([]);
});
