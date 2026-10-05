/** gopls formatting rejects incomplete Go. This must not prevent saving a draft.
 * Keep transport, cancellation, disk and other tooling failures visible. */
export function isGoSyntaxPreparationError(message: string): boolean {
  if (!message.startsWith("LSP error: ")) return false;
  try {
    const error = JSON.parse(message.slice("LSP error: ".length));
    return error.code === 0 && typeof error.message === "string" &&
      /(?:^|\n)(?:[^:\n]+:)?\d+:\d+: (?:expected\b|found\b|illegal\b|invalid\b|missing\b|string literal not terminated|raw string literal not terminated|comment not terminated)/.test(error.message);
  } catch { return false; }
}
