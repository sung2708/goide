import { expect, it } from "vitest";
import { preserveEditorOffset } from "./preserveEditorSelection";
it("preserves the source token through whitespace-only formatting", () => {
  const before = 'package main\nfunc main(){ fmt.Print("👋") }\n', after = 'package main\n\nfunc main() {\n\tfmt.Print("👋")\n}\n';
  expect(preserveEditorOffset(before, after, before.indexOf("Print") + 3)).toBe(after.indexOf("Print") + 3);
  expect(preserveEditorOffset(before, after, before.indexOf("👋") + 2)).toBe(after.indexOf("👋") + 2);
});
it("clamps rows/columns for other edits without splitting Unicode", () => {
  expect(preserveEditorOffset("abc\ndef", "x", 7)).toBe(1);
  expect(preserveEditorOffset("abc", "👋", 1)).toBe(0);
});
