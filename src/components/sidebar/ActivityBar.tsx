import { cn } from "../../lib/utils/cn";
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faBug, 
  faMagnifyingGlass, 
  faCodeBranch,
  faShareNodes,
} from "@fortawesome/free-solid-svg-icons";
import { 
  faFolder 
} from "@fortawesome/free-regular-svg-icons";

// Map the icons to the names the user requested
const byPrefixAndName = {
  fas: {
    'bug': faBug,
    'magnifying-glass': faMagnifyingGlass,
    'code-branch': faCodeBranch,
    'share-nodes': faShareNodes,
  },
  far: {
    'folder': faFolder,
  },
};

export type ActivityBarTab = "explorer" | "search" | "git" | "concurrency" | "debug";

interface ActivityBarProps {
  activeTab: ActivityBarTab;
  onTabChange: (tab: ActivityBarTab) => void;
  signalCount?: number;
}

const ActivityBar: React.FC<ActivityBarProps> = ({ activeTab, onTabChange, signalCount = 0 }) => {
  return (
    <div className="flex w-12 flex-col items-center border-r border-[var(--border-muted)] bg-[var(--crust)] py-4 gap-4">
      <ActivityItem 
        icon={<FontAwesomeIcon icon={byPrefixAndName.far['folder']} />} 
        active={activeTab === "explorer"} 
        onClick={() => onTabChange("explorer")} 
        title="Explorer"
      />
      <ActivityItem 
        icon={<FontAwesomeIcon icon={byPrefixAndName.fas['magnifying-glass']} />} 
        active={activeTab === "search"} 
        onClick={() => onTabChange("search")} 
        title="Search"
      />
      <ActivityItem 
        icon={<FontAwesomeIcon icon={byPrefixAndName.fas['code-branch']} />} 
        active={activeTab === "git"} 
        onClick={() => onTabChange("git")} 
        title="Git"
      />
      <ActivityItem 
        icon={<FontAwesomeIcon icon={byPrefixAndName.fas['share-nodes']} />} 
        active={activeTab === "concurrency"} 
        onClick={() => onTabChange("concurrency")} 
        title="Concurrency Signals"
        badge={signalCount > 0 ? signalCount : undefined}
      />
      <div className="mt-auto">
        <ActivityItem 
          icon={<FontAwesomeIcon icon={byPrefixAndName.fas['bug']} />} 
          active={activeTab === "debug"} 
          onClick={() => onTabChange("debug")} 
          title="Runtime Debug"
        />
      </div>
    </div>
  );
};

interface ActivityItemProps {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
  badge?: number;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ icon, active, onClick, title, badge }) => {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        aria-label={title}
        aria-pressed={active}
        title={title}
        className={cn(
          "flex size-10 items-center justify-center rounded-lg transition-colors duration-200",
          active
            ? "bg-[rgba(140,170,238,0.1)] text-[var(--blue)]"
            : "text-[var(--overlay1)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--subtext1)]"
        )}
      >
        <div className="text-[18px] flex items-center justify-center">
          {icon}
        </div>
      </button>
      {active && (
        <div className="absolute -left-0 top-2 h-6 w-1 rounded-r-full bg-[var(--blue)]" />
      )}
      {badge !== undefined && (
        <div className="absolute -bottom-1 -right-1 flex min-w-[16px] items-center justify-center rounded-full bg-[var(--mauve)] px-1 py-0.5 text-[8px] font-bold text-[var(--crust)] shadow-sm">
          {badge > 999 ? "999+" : badge}
        </div>
      )}
    </div>
  );
};

export default ActivityBar;
