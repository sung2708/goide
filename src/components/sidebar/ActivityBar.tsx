import { cn } from "../../lib/utils/cn";
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBug,
  faCodeBranch,
  faFolder,
  faMagnifyingGlass,
  faShareNodes,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

export type ActivityBarTab = "explorer" | "search" | "git" | "concurrency" | "debug";

interface ActivityBarProps {
  activeTab: ActivityBarTab;
  onTabChange: (tab: ActivityBarTab) => void;
  signalCount?: number;
  showDebugTab?: boolean;
  onOpenSettings?: () => void;
  onToggleBottomPanel?: () => void;
  isBottomPanelOpen?: boolean;
}

const MAIN_TABS: Array<{ tab: ActivityBarTab; icon: IconDefinition; label: string; shortcut?: string }> = [
  { tab: "explorer", icon: faFolder, label: "Explorer", shortcut: "Ctrl+Shift+E" },
  { tab: "search", icon: faMagnifyingGlass, label: "Search", shortcut: "Ctrl+Shift+F" },
  { tab: "git", icon: faCodeBranch, label: "Source Control", shortcut: "Ctrl+Shift+G" },
  { tab: "concurrency", icon: faShareNodes, label: "Concurrency Signals" },
];

const DEBUG_TAB = { tab: "debug" as ActivityBarTab, icon: faBug, label: "Debug", shortcut: "Ctrl+Shift+D" };

const ActivityBar: React.FC<ActivityBarProps> = ({
  activeTab,
  onTabChange,
  signalCount = 0,
  showDebugTab = false,
  onOpenSettings,
  onToggleBottomPanel,
  isBottomPanelOpen = false,
}) => {
  const tabs = showDebugTab ? [...MAIN_TABS, DEBUG_TAB] : MAIN_TABS;

  return (
    <nav aria-label="Workspace views" className="activity-bar flex w-11 shrink-0 flex-col justify-between border-r border-[var(--border-structural)] bg-[var(--surface-chrome)] backdrop-blur-[12px] select-none">
      {/* Top primary navigation tabs */}
      <div className="flex flex-col gap-1 py-2">
        {tabs.map(({ tab, icon, label, shortcut }) => {
          const isActive = activeTab === tab;
          const tooltip = shortcut ? `${label} (${shortcut})` : label;
          return (
            <div key={tab} className="relative">
              {isActive && (
                <div className="absolute inset-y-1.5 left-0 w-[2.5px] rounded-r bg-[var(--brand-primary)]" />
              )}
              <button
                type="button"
                onClick={() => onTabChange(tab)}
                aria-label={label}
                aria-pressed={isActive}
                title={tooltip}
                className={cn(
                  "relative flex size-9 mx-auto items-center justify-center rounded transition-all duration-100",
                  isActive
                    ? "bg-[var(--surface0)]/80 text-[var(--text)] font-semibold shadow-xs"
                    : "text-[var(--overlay1)] hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
                )}
              >
                <FontAwesomeIcon icon={icon} className="text-[14px]" />
                {tab === "concurrency" && signalCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 text-[8px] font-bold leading-none text-[var(--crust)] shadow-xs">
                    {signalCount > 99 ? "99+" : signalCount}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom utility actions */}
      <div className="flex flex-col gap-1 pb-2">
        {onToggleBottomPanel && (
          <button
            type="button"
            onClick={onToggleBottomPanel}
            aria-label={isBottomPanelOpen ? "Close terminal dock" : "Open terminal dock"}
            title="Toggle Terminal Dock (Ctrl+J)"
            className={cn(
              "flex size-9 mx-auto items-center justify-center rounded transition-colors duration-100",
              isBottomPanelOpen
                ? "bg-[var(--surface0)] text-[var(--text)]"
                : "text-[var(--overlay1)] hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
            )}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <line x1="3" y1="15" x2="21" y2="15" />
            </svg>
          </button>
        )}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open Settings (Ctrl+,)"
            title="Open Settings (Ctrl+,)"
            className="flex size-9 mx-auto items-center justify-center rounded text-[var(--overlay1)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>
    </nav>
  );
};

export default ActivityBar;
