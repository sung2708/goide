import { scanRegex, type RegexSearchRequest } from "./regexSearch";
self.onmessage = (event: MessageEvent<RegexSearchRequest>) => {
  try { self.postMessage({ ok: true, data: scanRegex(event.data) }); }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : "Regex search failed." }); }
};
