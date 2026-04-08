import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import SourceTree from "../sidebar/SourceTree";
import StatusBar from "../statusbar/StatusBar";

const EDITOR_BG = "bg-[#1e1e2e]";
const PANEL_BG = "bg-[#181825]";
const BORDER = "border-[#313244]";
const TEXT_MUTED = "text-[#a6adc8]";

function EditorShell() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  const handleOpenWorkspace = useCallback(async () => {
    if (isOpening) {
      return;
    }

    setIsOpening(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Workspace",
      });

      if (!selected) {
        return;
      }

      const resolvedPath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof resolvedPath === "string") {
        setWorkspacePath(resolvedPath);
      }
    } catch (error) {
      console.error("Failed to open workspace dialog:", error);
    } finally {
      setIsOpening(false);
    }
  }, [isOpening]);

  return (
    <div className={`flex h-full w-full flex-col ${EDITOR_BG} text-[#cdd6f4]`}>
      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`flex min-w-[220px] basis-[22%] flex-col border-r ${BORDER} ${PANEL_BG}`}
        >
          <SourceTree workspacePath={workspacePath} />
        </aside>

        <section className="flex min-w-0 flex-1 basis-[78%] flex-col">
          <header
            className={`flex items-center justify-between border-b ${BORDER} px-4 py-2 text-[11px] uppercase tracking-[0.18em] ${TEXT_MUTED}`}
          >
            <span>Editor</span>
            <button
              className={`rounded border ${BORDER} px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#cdd6f4] transition ${
                isOpening
                  ? "cursor-not-allowed opacity-60"
                  : "hover:border-[#45475a] hover:text-white"
              }`}
              onClick={handleOpenWorkspace}
              type="button"
              disabled={isOpening}
            >
              {isOpening ? "Opening..." : "Open Workspace"}
            </button>
          </header>

          <div className="flex flex-1 items-center justify-center p-6">
            {workspacePath ? (
              <div className="max-w-xl rounded border border-[#45475a] bg-[#11111b] p-6">
                <p className="text-xs uppercase tracking-[0.16em] text-[#a6adc8]">
                  Workspace Loaded
                </p>
                <p className="mt-3 break-all text-sm text-[#cdd6f4]">
                  {workspacePath}
                </p>
                <p className="mt-3 text-xs text-[#9399b2]">
                  File tree and editor tabs will appear in the next story.
                </p>
              </div>
            ) : (
              <div className="max-w-xl rounded border border-[#45475a] bg-[#11111b] p-6 text-center">
                <p className="text-xs uppercase tracking-[0.16em] text-[#a6adc8]">
                  No Workspace Open
                </p>
                <p className="mt-3 text-sm text-[#cdd6f4]">
                  Choose a folder to start. The shell is ready and will remain
                  instant.
                </p>
                <button
                  className={`mt-5 rounded border ${BORDER} px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#cdd6f4] transition ${
                    isOpening
                      ? "cursor-not-allowed opacity-60"
                      : "hover:border-[#45475a] hover:text-white"
                  }`}
                  onClick={handleOpenWorkspace}
                  type="button"
                  disabled={isOpening}
                >
                  {isOpening ? "Opening..." : "Open Workspace"}
                </button>
                <p className="mt-3 text-xs text-[#9399b2]">
                  Canceling keeps this empty state visible so you can retry.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <StatusBar workspacePath={workspacePath} />
    </div>
  );
}

export default EditorShell;
