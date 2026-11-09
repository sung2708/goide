// PreToolUse guard: block git actions that AGENTS.md reserves for the maintainer.
// Exit code 2 denies the tool call and shows stderr to Claude.
import { readFileSync } from "node:fs";

let command = "";
try {
  command = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command ?? "";
} catch {
  process.exit(0);
}

const rules = [
  [/\bgit\s+push\b[^\n;&|]*\s(--force\b|-f\b|--force-with-lease\b)/, "force-push"],
  [/\bgit\s+push\b[^\n;&|]*(\s--delete\b|\s-d\b|\s:[\w./-]+)/, "deleting a remote branch"],
  [/\bgit\s+push\b[^\n;&|]*(\s--tags\b|\srefs\/tags\/|\sv\d+\.\d+\.\d+)/, "pushing a release tag"],
  [/\bgit\s+push\b[^\n;&|]*(\s|:)(main|refs\/heads\/main)(\s|$)/, "pushing to main"],
];

for (const [pattern, action] of rules) {
  if (pattern.test(command)) {
    console.error(
      `Blocked by .claude/hooks/guard-git.mjs: ${action} is reserved for the maintainer (see AGENTS.md). ` +
        "Stop and give the user the exact command to run themselves.",
    );
    process.exit(2);
  }
}
process.exit(0);
