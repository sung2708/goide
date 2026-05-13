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
}

const MAIN_TABS: Array<{ tab: ActivityBarTab; icon: IconDefinition; label: string }> = [
  { tab: "explorer", icon: faFolder, label: "Explorer" },
  { tab: "search", icon: faMagnifyingGlass, label: "Search" },
  { tab: "git", icon: faCodeBranch, label: "Source Control" },
  { tab: "concurrency", icon: faShareNodes, label: "Concurrency Signals" },
];

const DEBUG_TAB = { tab: "debug" as ActivityBarTab, icon: faBug, label: "Debug" };

const ActivityBar: React.FC<ActivityBarProps> = ({
  activeTab,
  onTabChange,
  signalCount = 0,
  showDebugTab = false,
}) => {
  const tabs = showDebugTab ? [...MAIN_TABS, DEBUG_TAB] : MAIN_TABS;

  return (
    <div className="flex w-11 flex-col border-r border-(--border-subtle) bg-(--crust)">
      <div className="flex h-9 items-center justify-center">
        <span className="select-none text-[10px] font-bold uppercase tracking-widest text-(--blue)">
          go
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 py-2">
        {tabs.map(({ tab, icon, label }) => {
          const isActive = activeTab === tab;
          return (
            <div key={tab} className="relative">
              {isActive && (
                <div className="absolute inset-y-0 left-0 w-0.5 rounded-r-sm bg-(--blue)" />
              )}
              <button
                type="button"
                onClick={() => onTabChange(tab)}
                aria-label={label}
                aria-pressed={isActive}
                title={label}
                className={cn(
                  "relative flex w-full items-center justify-center py-2.5 outline-none transition-colors duration-100 focus-visible:bg-(--bg-active)",
                  isActive
                    ? "bg-(--bg-active) text-(--blue)"
                    : "text-(--overlay1) hover:bg-(--bg-hover) hover:text-(--subtext1)"
                )}
              >
                <FontAwesomeIcon icon={icon} className="text-[16px]" />
                {tab === "concurrency" && signalCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-(--mauve) px-0.5 text-[8px] font-bold leading-none text-(--crust)">
                    {signalCount > 99 ? "99+" : signalCount}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActivityBar;
