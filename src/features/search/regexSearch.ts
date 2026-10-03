export type RegexSearchRequest = { text: string; query: string; replacement: string; matchCase: boolean; wholeWord: boolean };
export type RegexSearchMatch = { from: number; to: number; replacement: string };
export type RegexSearchReport = { matches: RegexSearchMatch[]; limited: boolean };
/** Called in a terminable worker. Offsets and capture semantics match editor UTF-16. */
export function scanRegex(request: RegexSearchRequest): RegexSearchReport {
  if (!request.query || request.query.length > 4096 || request.text.length > 4 * 1024 * 1024 || request.replacement.length > 65536) throw new Error("Regex search exceeds its text/pattern/replacement budget.");
  const pattern = request.wholeWord ? `(?<![\\p{L}\\p{N}\\p{M}_])(?:${request.query})(?![\\p{L}\\p{N}\\p{M}_])` : request.query;
  const regex = new RegExp(pattern, request.matchCase ? "gmu" : "gimu");
  const matches: RegexSearchMatch[] = [];
  let expanded = 0;
  for (const match of request.text.matchAll(regex)) {
    if (matches.length >= 2000) return { matches, limited: true };
    const replacement = request.replacement.replace(/\$\$|\$\{([\w]+)\}|\$([A-Za-z0-9_]+)/g, (token, braced, bare) => {
      if (token === "$$") return "$";
      const name: string = braced ?? bare;
      return /^\d+$/.test(name) ? match[Number(name)] ?? "" : match.groups?.[name] ?? "";
    });
    expanded += replacement.length;
    if (expanded > 4 * 1024 * 1024) throw new Error("Expanded replacement exceeds the 4 MiB budget.");
    matches.push({ from: match.index, to: match.index + match[0].length, replacement });
  }
  return { matches, limited: false };
}
