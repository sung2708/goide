import { expect, it } from "vitest";
import { isGoSyntaxPreparationError } from "./savePreparationErrors";
it("recognizes only gopls parser failures, preserving operational errors", () => {
  const message = (code: number, text: string) => `LSP error: ${JSON.stringify({ code, message: text })}`;
  expect(isGoSyntaxPreparationError(message(0, "4:7: expected '}', found 'EOF'"))).toBe(true);
  for (const error of [message(-32800, "4:7: expected '}', found 'EOF'"), message(0, "Native tool exceeded its execution deadline."), "Disk changed", "LSP error: broken JSON", message(0, "connection unavailable")]) expect(isGoSyntaxPreparationError(error)).toBe(false);
});
