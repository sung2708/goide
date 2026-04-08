type StatusBarProps = {
  workspacePath: string | null;
};

function StatusBar({ workspacePath }: StatusBarProps) {
  return (
    <div className="flex h-8 items-center justify-between border-t border-[#313244] bg-[#11111b] px-4 text-[11px] text-[#a6adc8]">
      <div className="flex items-center gap-3">
        <span className="uppercase tracking-[0.16em] text-[#9399b2]">
          Workspace
        </span>
        <span className="truncate text-[#cdd6f4]">
          {workspacePath ?? "None selected"}
        </span>
      </div>
      <span className="uppercase tracking-[0.16em] text-[#9399b2]">
        Status: Ready
      </span>
    </div>
  );
}

export default StatusBar;
