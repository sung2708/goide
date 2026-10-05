import { useCallback, useEffect, useRef } from "react";
import { matchesShortcut, runCommand, validateCommands, type Command } from "./registry";
import { rememberCommand } from "./search";
export function useCommandRegistry(commands: Command[], onError: (message: string) => void) {
  validateCommands(commands);
  const latest = useRef({ commands, onError }); latest.current = { commands, onError };
  const pending = useRef(new Set<string>());
  const execute = useCallback(async (id: string) => {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    try { await runCommand(latest.current.commands.find(command => command.id === id)); rememberCommand(id); }
    catch (error) { latest.current.onError(error instanceof Error ? error.message : "Command failed."); }
    finally { pending.current.delete(id); }
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if ((event.target as Element | null)?.closest?.('dialog[open], [role="dialog"], [role="alertdialog"]')) return;
      const command = latest.current.commands.find(item => item.shortcut && matchesShortcut(event, item.shortcut, navigator.platform.startsWith("Mac")));
      if (!command) return;
      const surface = event.target as Element | null;
      if (!command.allowInInput && !surface?.closest?.(".goro-editor") && surface?.closest?.('input, textarea, [contenteditable="true"], .xterm')) return;
      event.preventDefault(); event.stopPropagation(); void execute(command.id);
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [execute]);
  return execute;
}
