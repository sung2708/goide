import { positionAt } from "../language/useLanguageQueries";
const common: Record<string, string> = { bytes: "bytes", cmp: "cmp", context: "context", csv: "encoding/csv", errors: "errors", filepath: "path/filepath", flag: "flag", fmt: "fmt", http: "net/http", io: "io", json: "encoding/json", log: "log", maps: "maps", math: "math", os: "os", rand: "math/rand", regexp: "regexp", slices: "slices", sort: "sort", strconv: "strconv", strings: "strings", sync: "sync", testing: "testing", time: "time", url: "net/url" };
export const packageContext = (prefix: string) => /^\s*package(?:\s+[A-Za-z_][A-Za-z0-9_]*)?\s*$/.test(prefix);
export const functionContext = (prefix: string) => /^\s*func\s+(?:\([^)]*\)\s*)?(?:[A-Za-z_][A-Za-z0-9_]*)?$/.test(prefix);
/** Preserve Goro's package-member preview before the user types a dot.
 * This is an edit-context adapter; all member intelligence still comes from gopls. */
export function packageCompletionPreview(source: string, offset: number, alias: string) {
  if (alias.length < 2) return null;
  const aliases = new Map<string, string>();
  const add = (rawAlias: string | undefined, path: string) => { const name = rawAlias ?? path.split("/").pop(); if (name && name !== "_" && name !== ".") aliases.set(name, path); };
  for (const match of source.matchAll(/^\s*import\s+(?:(\w+|[._])\s+)?"([^"]+)"\s*$/gm)) add(match[1], match[2]);
  for (const block of source.matchAll(/^\s*import\s*\(([\s\S]*?)^\s*\)/gm)) for (const match of block[1].matchAll(/^\s*(?:(\w+|[._])\s+)?"([^"]+)"/gm)) add(match[1], match[2]);
  const path = aliases.get(alias) ?? common[alias]; if (!path) return null;
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  let insertion: { offset: number; text: string } | null = null;
  if (!aliases.has(alias)) {
    const declaration = /^[ \t]*package[ \t]+[A-Za-z_][A-Za-z0-9_]*[^\r\n]*/m.exec(source); if (!declaration) return null;
    const at = declaration.index + declaration[0].length;
    insertion = { offset: at, text: `${eol}import "${path}"${source.slice(at).startsWith(eol + eol) ? "" : eol}` };
  }
  const shiftedOffset = offset + (insertion && insertion.offset <= offset ? insertion.text.length : 0);
  const virtual = insertion ? source.slice(0, insertion.offset) + insertion.text + source.slice(insertion.offset) : source;
  const content = virtual.slice(0, shiftedOffset) + "." + virtual.slice(shiftedOffset);
  return { alias, insertion, content, position: positionAt(content, shiftedOffset + 1)! };
}
