import type * as Monaco from "monaco-editor";
import { marked } from "marked";
import DOMPurify from "dompurify";

export type MarkdownBlock = { fromLine: number; toLine: number; source: string; kind: string };
export function markdownBlocks(source: string): MarkdownBlock[] {
  let line = 1;
  return marked.lexer(source).flatMap(token => {
    const start = line, raw = token.raw;
    line += (raw.match(/\n/g) ?? []).length;
    if (token.type === "space") return [];
    return [{ fromLine: start, toLine: Math.max(start, line - (raw.endsWith("\n") ? 1 : 0)), source: raw, kind: token.type }];
  });
}
export function renderMarkdown(source: string): HTMLElement {
  const node = document.createElement("div"); node.className = "goro-markdown-preview";
  node.innerHTML = DOMPurify.sanitize(marked.parse(source, { async: false }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "iframe", "object", "embed", "form", "input", "video", "audio", "source", "link", "meta"],
    FORBID_ATTR: ["style", "srcset", "href", "xlink:href", "poster", "background"],
    // Strip network URLs before assigning HTML to a live document, including
    // responsive/media/SVG resource paths; only inert raster data URLs survive.
    ALLOWED_URI_REGEXP: /^data:image\/(png|jpeg|gif|webp);base64,/i,
  });
  // Preview cannot fetch resources or navigate the desktop WebView. Source links
  // remain available when editing the block; embedded data images work offline.
  for (const image of node.querySelectorAll("img")) if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(image.getAttribute("src") ?? "")) image.replaceWith(document.createTextNode(image.alt));
  for (const link of node.querySelectorAll("a")) { link.removeAttribute("href"); link.removeAttribute("target"); }
  return node;
}

/** Live preview uses public content widgets and decorations. The model stays untouched,
 * so save/undo/LSP offsets always refer to the original Markdown source. */
export function mountMarkdownPreview(editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) {
  let hovered: number | null = null, frame = 0, timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let cachedModel: Monaco.editor.ITextModel | null = null, cachedVersion = -1;
  let cachedBlocks: MarkdownBlock[] = [];
  const widgets = new Map<number, Monaco.editor.IContentWidget>();
  const decoration = editor.createDecorationsCollection();
  const refresh = () => {
    if (disposed) return;
    const model = editor.getModel(); if (!model) return;
    const selected = editor.getSelection();
    if (cachedModel !== model || cachedVersion !== model.getVersionId()) {
      for (const widget of widgets.values()) editor.removeContentWidget(widget); widgets.clear();
      cachedModel = model; cachedVersion = model.getVersionId();
      cachedBlocks = markdownBlocks(model.getValue()).filter(block => block.toLine <= model.getLineCount());
    }
    const blocks = cachedBlocks;
    const hidden: Monaco.editor.IModelDeltaDecoration[] = [];
    const retained = new Set<number>();
      const visible = editor.getVisibleRanges();
      const first = visible.length ? Math.max(1, Math.min(...visible.map(range => range.startLineNumber)) - 10) : 1;
      const last = visible.length ? Math.max(...visible.map(range => range.endLineNumber)) + 10 : 0;
      // Cached blocks are source ordered. Skip off-screen blocks and never walk
      // every row of a long fenced block during hover or scrolling.
      let low = 0, high = blocks.length;
      while (low < high) { const mid = (low + high) >>> 1; if (blocks[mid].toLine < first) low = mid + 1; else high = mid; }
      for (let index = low; index < blocks.length && blocks[index].fromLine <= last; index++) {
        const block = blocks[index];
        for (let line = Math.max(first, block.fromLine); line <= Math.min(last, block.toLine); line++) {
        if (!visible.some(range => line >= range.startLineNumber - 10 && line <= range.endLineNumber + 10)) continue;
        if (hovered === line || selected && selected.startLineNumber <= line && selected.endLineNumber >= line) continue;
        retained.add(line);
        const existing = widgets.get(line);
        if (existing) {
          existing.getDomNode().style.width = `${Math.max(100, editor.getLayoutInfo().contentWidth - 24)}px`;
          existing.getDomNode().style.maxHeight = `${editor.getOption(monaco.editor.EditorOption.lineHeight)}px`;
          editor.layoutContentWidget(existing);
          hidden.push({ range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: model.getLineMaxColumn(line) }, options: { inlineClassName: "goro-markdown-source-hidden" } });
          continue;
        }
        const source = model.getLineContent(line);
        const node = block.kind === "code" ? document.createElement("div") : renderMarkdown(source);
        if (block.kind === "code") { node.className = "goro-markdown-preview"; const code = document.createElement("code"); code.textContent = /^\s*(```|~~~)/.test(source) ? "" : source; node.append(code); }
        node.onmouseenter = () => { hovered = line; schedule(); };
        node.style.width = `${Math.max(100, editor.getLayoutInfo().contentWidth - 24)}px`;
        node.style.maxHeight = `${editor.getOption(monaco.editor.EditorOption.lineHeight)}px`;
        const widget: Monaco.editor.IContentWidget = { getId: () => `goro.markdown.${line}`, getDomNode: () => node, getPosition: () => ({ position: { lineNumber: line, column: 1 }, preference: [monaco.editor.ContentWidgetPositionPreference.EXACT] }) };
        widgets.set(line, widget); editor.addContentWidget(widget);
        hidden.push({ range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: model.getLineMaxColumn(line) }, options: { inlineClassName: "goro-markdown-source-hidden" } });
        }
      }
    for (const [line, widget] of widgets) if (!retained.has(line)) { editor.removeContentWidget(widget); widgets.delete(line); }
    decoration.set(hidden);
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(refresh); };
  const listeners = [
    editor.onDidChangeModelContent(() => { clearTimeout(timer); timer = setTimeout(schedule, 120); }),
    editor.onDidChangeCursorSelection(schedule),
    editor.onDidLayoutChange(schedule),
    editor.onDidScrollChange(schedule),
    editor.onMouseMove(event => { const line = event.target.position?.lineNumber; if (line !== undefined && line !== hovered) { hovered = line; schedule(); } }),
    editor.onMouseLeave(() => { hovered = null; schedule(); }),
  ];
  schedule();
  return () => { disposed = true; clearTimeout(timer); cancelAnimationFrame(frame); for (const listener of listeners) listener.dispose(); for (const widget of widgets.values()) editor.removeContentWidget(widget); widgets.clear(); decoration.clear(); };
}
