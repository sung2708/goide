import { beforeEach, expect, it } from "vitest";
import { rankCommands, recentCommands, rememberCommand } from "./search";
import { fuzzyMatch } from "../navigation/fuzzy";
import { validateCommands } from "./registry";
const command = (id: string, title: string) => ({ id, title, run: () => undefined });
beforeEach(() => sessionStorage.clear());
it("ranks title prefix ahead of fuzzy and ID-only matches regardless of registration order", () => {
  const commands = [command("format", "Other Action"), command("file.format", "File Format"), command("editor.format", "Format Document")];
  expect(rankCommands(commands, "format", []).map(item => item.command.id)).toEqual(["editor.format", "file.format", "format"]);
  expect(rankCommands(commands, "fmt", ["file.format"])[0].command.id).toBe("editor.format");
});
it("keeps UTF-16 highlight offsets after emoji and case expansion", () => {
  expect(fuzzyMatch("😀 Định dạng", "đd")?.positions).toEqual([3, 8]);
  expect(fuzzyMatch("İValue", "iv")?.positions).toEqual([0, 1]);
  expect(fuzzyMatch("GoTestPackage", "gtp")?.positions).toEqual([0, 2, 6]);
  expect(fuzzyMatch("Save", "xyz")).toBeNull();
});
it("bounds and deduplicates local command history, tolerates corrupt storage", () => {
  for (let i = 0; i < 45; i++) rememberCommand(`command.${i}`);
  rememberCommand("command.40");
  expect(recentCommands()).toHaveLength(30); expect(recentCommands()[0]).toBe("command.40");
  expect(rankCommands([command("one", "AAA"), command("two", "ZZZ")], "", ["two"])[0].command.id).toBe("two");
  sessionStorage.setItem("goide.recentCommands:v1", "bad-json"); expect(recentCommands()).toEqual([]);
});
it("rejects command identity collisions", () => {
  expect(() => validateCommands([command("save", "Save"), command("save", "Other")])).toThrow("Duplicate command ID: save");
});
