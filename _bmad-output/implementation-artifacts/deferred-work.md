
## Deferred from: code review of 3-3-causal-thread-line.md (2026-04-11)
- **Sync Logic Performance**: The `updateListener` in `CodeEditor.tsx` performs frequent DOM reads via `getBoundingClientRect` on every geometry/viewport update. While acceptable for the current UX, it should be optimized or debounced if performance degrades in larger files.
