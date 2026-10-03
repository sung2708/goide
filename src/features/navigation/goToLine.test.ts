import { expect, it } from "vitest";
import { parseLineTarget } from "./goToLine";
it("validates line/column syntax and clamps against current UTF-16 document bounds", () => {
  const text = "a\r\n😀x\n";
  expect(parseLineTarget("2:3", text)).toEqual({ line: 2, column: 3 });
  expect(parseLineTarget("99:999", text)).toEqual({ line: 3, column: 1 });
  for (const query of ["0", "-1", "2:0", "2:x", "1:2:3", "9999999999999999999999"]) expect(parseLineTarget(query, text)).toBeNull();
});
