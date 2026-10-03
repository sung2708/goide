import { expect, it } from "vitest";
import { rankFiles, prepareFileIndex, rankPreparedFiles } from "./fileRanking";
it("measures bounded ranking on a synthetic 20,000-file index", () => {
  const files = Array.from({ length: 20000 }, (_, index) => `internal/package-${index % 100}/file${index}.go`);
  const preparationStart = performance.now(); const index = prepareFileIndex(files); const preparationMs = performance.now() - preparationStart;
  const timings = ["file19999.go", "f199", "internal/package-42"].map(query => {
    const start = performance.now(); const results = rankPreparedFiles(index, query, []);
    const elapsed = performance.now() - start;
    expect(results.length).toBeLessThanOrEqual(200); return Math.round(elapsed * 100) / 100;
  });
  expect(rankFiles(files, "file19999.go", [])[0]).toBe("internal/package-99/file19999.go");
  console.info("Synthetic file ranking (not UI latency)", JSON.stringify({ files: files.length, preparationMs: Math.round(preparationMs), queryTimesMs: timings }));
});
