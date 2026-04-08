type SourceTreeProps = {
  workspacePath: string | null;
};

function SourceTree({ workspacePath }: SourceTreeProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#313244] px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[#a6adc8]">
          Source Tree
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-4 text-xs text-[#bac2de]">
        <p className="font-medium text-[#cdd6f4]">
          {workspacePath ? "Workspace Connected" : "Workspace Not Open"}
        </p>
        <p className="text-[#9399b2]">
          File explorer will appear in Story 1.3.
        </p>
      </div>
    </div>
  );
}

export default SourceTree;
