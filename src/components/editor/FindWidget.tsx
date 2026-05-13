import type { RefObject } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAngleDown,
  faAngleUp,
  faArrowsTurnToDots,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";

export type FindWidgetProps = {
  query: string;
  replaceText: string;
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  matchInfo: { current: number; total: number };
  queryInputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (q: string) => void;
  onReplaceTextChange: (t: string) => void;
  onToggleMatchCase: () => void;
  onToggleWholeWord: () => void;
  onToggleRegex: () => void;
  onFindNext: () => void;
  onFindPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
};

function IconBtn({
  text,
  label,
  active = false,
  onClick,
}: {
  text: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors duration-100 ${
        active
          ? "bg-(--selection-bg) text-(--blue)"
          : "text-(--overlay1) hover:bg-[rgba(255,255,255,0.06)] hover:text-(--subtext1)"
      }`}
    >
      <span className="text-[10px] font-semibold">{text}</span>
    </button>
  );
}

function NavBtn({
  icon,
  label,
  onClick,
}: {
  icon: typeof faAngleUp;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-(--overlay1) transition-colors duration-100 hover:bg-[rgba(255,255,255,0.06)] hover:text-(--subtext1)"
    >
      <FontAwesomeIcon icon={icon} className="text-[13px]" />
    </button>
  );
}

export default function FindWidget({
  query,
  replaceText,
  matchCase,
  wholeWord,
  useRegex,
  matchInfo,
  queryInputRef,
  onQueryChange,
  onReplaceTextChange,
  onToggleMatchCase,
  onToggleWholeWord,
  onToggleRegex,
  onFindNext,
  onFindPrev,
  onReplace,
  onReplaceAll,
  onClose,
}: FindWidgetProps) {
  const hasQuery = query.length > 0;
  const hasMatches = matchInfo.total > 0;

  function renderCounter() {
    if (hasMatches) {
      return (
        <span className="shrink-0 text-[10px] text-(--overlay1)">
          {matchInfo.current} of {matchInfo.total}
        </span>
      );
    }
    if (hasQuery) {
      return (
        <span className="shrink-0 text-[10px] text-(--red)">No results</span>
      );
    }
    return null;
  }

  return (
    <div
      data-testid="find-widget"
      className="absolute right-3 top-2 z-50 w-[min(420px,calc(100%-1.5rem))] overflow-hidden rounded-md border border-(--border-muted) bg-(--mantle) shadow-(--panel-shadow-soft)"
    >
      {/* Find row */}
      <div className="flex items-center gap-1 border-b border-(--surface1) px-2 py-1">
        <span className="shrink-0 text-(--overlay1)">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="text-[13px]" />
        </span>

        <input
          ref={queryInputRef}
          type="text"
          value={query}
          placeholder="Find"
          aria-label="Find in file"
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) {
                onFindPrev();
              } else {
                onFindNext();
              }
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          className="min-w-0 flex-1 rounded bg-(--crust) px-1.5 py-0.5 text-[12px] text-(--text) outline-none placeholder:text-(--overlay0) focus:ring-1 focus:ring-(--border-active)"
        />

        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn text="Aa" label="Match Case" active={matchCase} onClick={onToggleMatchCase} />
          <IconBtn text="W" label="Match Whole Word" active={wholeWord} onClick={onToggleWholeWord} />
          <IconBtn text=".*" label="Use Regular Expression" active={useRegex} onClick={onToggleRegex} />
        </div>

        <div className="mx-1 h-4 w-px shrink-0 bg-(--surface1)" />

        {renderCounter()}

        <NavBtn icon={faAngleUp} label="Previous Match" onClick={onFindPrev} />
        <NavBtn icon={faAngleDown} label="Next Match" onClick={onFindNext} />

        <div className="mx-1 h-4 w-px shrink-0 bg-(--surface1)" />

        <button
          type="button"
          aria-label="Close find widget"
          onClick={onClose}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-(--overlay1) transition-colors duration-100 hover:bg-[rgba(255,255,255,0.06)] hover:text-(--subtext1)"
        >
          <span className="text-[13px] leading-none">x</span>
        </button>
      </div>

      {/* Replace row */}
      <div className="flex items-center gap-1 px-2 py-1">
        <span className="shrink-0 text-(--overlay1)">
          <FontAwesomeIcon icon={faArrowsTurnToDots} className="text-[13px]" />
        </span>

        <input
          type="text"
          value={replaceText}
          placeholder="Replace"
          aria-label="Replace text"
          onChange={(e) => onReplaceTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          className="min-w-0 flex-1 rounded bg-(--crust) px-1.5 py-0.5 text-[12px] text-(--text) outline-none placeholder:text-(--overlay0) focus:ring-1 focus:ring-(--border-active)"
        />

        <button
          type="button"
          aria-label="Replace"
          onClick={onReplace}
          className="shrink-0 rounded border border-(--surface1) bg-(--surface0) px-2 py-0.5 text-[11px] text-(--subtext1) transition-colors duration-100 hover:border-(--border-active) hover:text-(--text)"
        >
          Replace
        </button>
        <button
          type="button"
          aria-label="Replace All"
          onClick={onReplaceAll}
          className="shrink-0 rounded border border-(--surface1) bg-(--surface0) px-2 py-0.5 text-[11px] text-(--subtext1) transition-colors duration-100 hover:border-(--border-active) hover:text-(--text)"
        >
          Replace All
        </button>
      </div>
    </div>
  );
}
