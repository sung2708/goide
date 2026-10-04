import { expect, it } from "vitest";
import { LocationHistory } from "./LocationHistory";
it("preserves jump origins, supports back/forward and drops the forward branch after a new jump", () => {
  const history = new LocationHistory();
  const a = { file: "a.go", line: 7, column: 4 }, b = { file: "b.go", line: 20, column: 2 }, c = { file: "c.go", line: 1, column: 1 };
  history.visit(a, b); expect(history.peek(-1)).toEqual(a);
  history.move(-1); expect(history.peek(1)).toEqual(b);
  history.visit(a, c); expect(history.peek(1)).toBeNull(); expect(history.peek(-1)).toEqual(a);
});
it("deduplicates identical jumps and bounds retained locations", () => {
  const history = new LocationHistory();
  const a = { file: "a.go", line: 1, column: 1 }; history.visit(a, a);
  expect(history.peek(-1)).toBeNull();
  for (let line = 2; line <= 150; line++) history.visit({ ...a, line: line - 1 }, { ...a, line });
  let count = 0; while (history.peek(-1)) { history.move(-1); count++; }
  expect(count).toBe(99);
});
