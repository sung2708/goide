import { useEffect, useRef } from "react";

export type DocumentOutlineItem = {
  name: string;
  kind: string;
  line: number;
  from: number;
  to: number;
};

type DocumentOutlineProps = {
  items: DocumentOutlineItem[];
  activeItemFrom?: number | null;
  onJumpToLine?: (line: number) => void;
};

const KIND_LABELS: Record<string, string> = {
  function: "fn",
  method: "method",
  struct: "struct",
  interface: "iface",
  type: "type",
};

function DocumentOutline({
  items,
  activeItemFrom = null,
  onJumpToLine,
}: DocumentOutlineProps) {
  const outlineRef = useRef<HTMLElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const itemButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (
      activeItemRef.current === null ||
      typeof activeItemRef.current.scrollIntoView !== "function"
    ) {
      return;
    }

    activeItemRef.current.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeItemFrom]);

  useEffect(() => {
    if (
      outlineRef.current === null ||
      activeItemRef.current === null ||
      !(document.activeElement instanceof HTMLElement)
    ) {
      return;
    }

    if (!outlineRef.current.contains(document.activeElement)) {
      return;
    }

    activeItemRef.current.focus();
  }, [activeItemFrom]);

  itemButtonRefs.current = [];

  const focusItemAt = (index: number) => {
    itemButtonRefs.current[index]?.focus();
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <aside
      ref={outlineRef}
      aria-label="Document outline"
      className="flex h-full w-64 shrink-0 flex-col border-l border-[rgba(113,125,144,0.2)] bg-[var(--mantle)]"
      data-testid="document-outline"
    >
      <div className="border-b border-[rgba(113,125,144,0.2)] px-3 py-2">
        <h2 className="text-xs font-semibold text-[var(--subtext1)]">Document Outline</h2>
        <p className="mt-1 text-[11px] text-[var(--overlay1)]">
          Tree-sitter symbols for the active file.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-1">
          {items.map((item, itemIndex) => {
            const isActive = activeItemFrom === item.from;
            return (
              <button
                key={`${item.name}-${item.kind}-${item.line}-${item.from}`}
                ref={(node) => {
                  itemButtonRefs.current[itemIndex] = node;
                  if (isActive) {
                    activeItemRef.current = node;
                  }
                }}
                type="button"
                className={`w-full rounded px-2 py-2 text-left transition-colors duration-100 ${
                  isActive
                    ? "bg-[rgba(126,162,220,0.18)] ring-1 ring-[rgba(126,162,220,0.35)]"
                    : "hover:bg-[var(--bg-hover)]"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onKeyDown={(event) => {
                  if (event.key === "Home") {
                    event.preventDefault();
                    focusItemAt(0);
                    return;
                  }

                  if (event.key === "End") {
                    event.preventDefault();
                    focusItemAt(items.length - 1);
                    return;
                  }

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusItemAt(Math.min(itemIndex + 1, items.length - 1));
                    return;
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    focusItemAt(Math.max(itemIndex - 1, 0));
                  }
                }}
                onClick={() => onJumpToLine?.(item.line)}
                aria-label={`Line ${item.line} ${item.kind} ${item.name}`}
                aria-current={isActive ? "true" : undefined}
                title={`Jump to line ${item.line}.`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`truncate text-[12px] font-medium ${
                      isActive ? "text-[var(--blue)]" : "text-[var(--text)]"
                    }`}
                  >
                    {item.name}
                  </span>
                  <span className="rounded bg-[var(--surface0)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--overlay1)]">
                    {KIND_LABELS[item.kind] ?? item.kind}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[var(--overlay1)]">L{item.line}</div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export default DocumentOutline;
