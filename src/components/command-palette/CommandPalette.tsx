import { useMemo, useState } from "react";
import type { Command } from "../../features/commands/registry";
import { rankCommands, recentCommands } from "../../features/commands/search";
import QuickPick from "../primitives/QuickPick";
import MatchLabel from "../primitives/MatchLabel";

type Props = { commands: Command[]; execute: (id: string) => Promise<void>; onClose: () => void };
export default function CommandPalette({ commands, execute, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [recent] = useState(recentCommands);
  const items = useMemo(() => rankCommands(commands, query, recent).map(({ command, positions }) => ({
    id: command.id, label: command.title, disabled: command.disabled, description: command.description ?? command.category,
    shortcut: command.shortcut?.replace("Mod", navigator.platform.startsWith("Mac") ? "Cmd" : "Ctrl"),
    content: <MatchLabel text={command.title} positions={positions} />,
  })), [commands, query, recent]);
  return <QuickPick title="Command palette" inputLabel="Search commands" placeholder="Type a command or search…" query={query} onQuery={setQuery}
    items={items} empty="No commands found" dataTestId="command-palette" onClose={onClose}
    onChoose={id => { onClose(); void execute(id); }} />;
}
