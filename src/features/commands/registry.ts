export type Command = {
  id: string; title: string; category?: string; description?: string; shortcut?: string; allowInInput?: boolean; disabled?: string;
  run: () => unknown | Promise<unknown>;
};
export function validateCommands(commands: Command[]): void {
  const ids = new Set<string>();
  for (const command of commands) {
    if (ids.has(command.id)) throw new Error(`Duplicate command ID: ${command.id}`);
    ids.add(command.id);
  }
}
export function matchesShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">, shortcut: string, mac: boolean): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const modifiers = new Set(parts.slice(0, -1));
  const key = event.key === " " ? "space" : event.key.toLowerCase();
  return key === parts[parts.length - 1]
    && event.ctrlKey === (modifiers.has("ctrl") || (!mac && modifiers.has("mod")))
    && event.metaKey === (modifiers.has("meta") || (mac && modifiers.has("mod")))
    && event.shiftKey === modifiers.has("shift") && event.altKey === modifiers.has("alt");
}
export async function runCommand(command: Command | undefined): Promise<void> {
  if (!command) throw new Error("Command unavailable.");
  if (command.disabled) throw new Error(command.disabled);
  const result = await command.run();
  if (result && typeof result === "object" && "ok" in result && result.ok === false) {
    const error = "error" in result ? result.error : null;
    throw new Error(error && typeof error === "object" && "message" in error ? String(error.message) : `${command.title} failed.`);
  }
}
