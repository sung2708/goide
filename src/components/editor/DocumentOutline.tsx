import { memo, useEffect, useRef, useState } from "react";

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
  isPending?: boolean;
};

const KIND_ABBR: Record<string, string> = {
  function: "fn",
  method: "me",
  struct: "st",
  interface: "if",
  type: "ty",
};

const KIND_COLOR: Record<string, string> = {
  function: "text-[#7aa2f7]",
  method: "text-[#9ece6a]",
  struct: "text-[#e0af68]",
  interface: "text-[#bb9af7]",
  type: "text-[#2ac3de]",
};

const SKELETON_WIDTHS = [65, 45, 80, 55, 70];

function DocumentOutline({
  items,
  activeItemFrom = null,
  onJumpToLine,
  isPending = false,
}: DocumentOutlineProps) {
  const outlineRef = useRef<HTMLElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const itemButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Delay skeleton to avoid flash on fast loads
  const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    if (!isPending) {
      setShowSkeleton(false);
      return;
    }
    const t = setTimeout(() => setShowSkeleton(true), 250);
    return () => clearTimeout(t);
  }, [isPending]);

  useEffect(() => {
    if (
      activeItemRef.current === null ||
      typeof activeItemRef.current.scrollIntoView !== "function"
    ) {
      return;
    }
    activeItemRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
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

  return (
    <aside
      ref={outlineRef}
      aria-label="Document outline"
      className="flex h-full w-52 shrink-0 flex-col border-l border-(--border-subtle) bg-(--mantle)"
      data-testid="document-outline"
    >
      <div className="border-b border-(--border-subtle) px-3 py-1.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-(--overlay1)">
          Outline
        </h2>
      </div>

      {showSkeleton ? (
        <div className="flex flex-col gap-1.5 px-2 py-1">
          {SKELETON_WIDTHS.map((w, i) => (
            <div
              key={w}
              className="h-5 rounded animate-pulse bg-(--surface0)"
              style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-[10px] text-(--overlay0)">No symbols</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-1.5 py-1">
          {items.map((item, itemIndex) => {
            const isActive = activeItemFrom === item.from;
            const kindColor = KIND_COLOR[item.kind] ?? "text-(--overlay1)";
            const kindAbbr = KIND_ABBR[item.kind] ?? item.kind.slice(0, 2);
            return (
              <button
                key={`${item.name}-${item.kind}-${item.line}-${item.from}`}
                ref={(node) => {
                  itemButtonRefs.current[itemIndex] = node;
                  if (isActive) activeItemRef.current = node;
                }}
                type="button"
                className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left outline-none transition-colors duration-100 focus-visible:ring-1 focus-visible:ring-(--border-active) ${
                  isActive
                    ? "bg-(--bg-active) ring-1 ring-(--border-active)"
                    : "hover:bg-(--bg-hover)"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                  if (e.key === "Home") { e.preventDefault(); focusItemAt(0); return; }
                  if (e.key === "End") { e.preventDefault(); focusItemAt(items.length - 1); return; }
                  if (e.key === "ArrowDown") { e.preventDefault(); focusItemAt(Math.min(itemIndex + 1, items.length - 1)); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); focusItemAt(Math.max(itemIndex - 1, 0)); }
                }}
                onClick={() => onJumpToLine?.(item.line)}
                aria-label={`Line ${item.line} ${item.kind} ${item.name}`}
                aria-current={isActive ? "true" : undefined}
                title={`${item.kind} — line ${item.line}`}
              >
                <span className={`w-5 shrink-0 text-[9px] font-bold uppercase ${kindColor}`}>
                  {kindAbbr}
                </span>
                <span
                  className={`flex-1 truncate text-[12px] font-medium ${
                    isActive ? "text-(--blue)" : "text-(--text)"
                  }`}
                >
                  {item.name}
                </span>
                <span className="shrink-0 tabular-nums text-[10px] text-(--overlay0)">
                  {item.line}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

export default memo(DocumentOutline);
