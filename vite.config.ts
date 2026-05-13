import { readFileSync } from "node:fs";
import { createLogger, defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const logger = createLogger();
const loggerWarn = logger.warn;

logger.warn = (message, options) => {
  if (
    message.includes("node_modules/web-tree-sitter/web-tree-sitter.js") &&
    message.includes('Use of eval in "node_modules/web-tree-sitter/web-tree-sitter.js"')
  ) {
    return;
  }

  loggerWarn(message, options);
};

function shimWebTreeSitterNodeImports() {
  const target = "/node_modules/web-tree-sitter/web-tree-sitter.js";

  return {
    name: "shim-web-tree-sitter-node-imports",
    enforce: "pre" as const,
    // Rewrite at load time so Rollup never sees the two dynamic import() calls
    // for Node-only modules.  The plugin must be registered in both
    // plugins[] (client env) and worker.plugins() (worker env) because Vite 7
    // Environment API gives each env an independent plugin chain.
    load(id: string) {
      const normalizedId = id.replace(/\\/g, "/");
      if (!normalizedId.endsWith(target)) {
        return null;
      }
      let code = readFileSync(id, "utf-8");
      code = code.replace(
        /const fs2 = await import\("fs\/promises"\);/,
        'const fs2 = { readFile: async () => { throw new Error("fs/promises is unavailable in the browser runtime"); } };',
      );
      code = code.replace(
        /const \{ createRequire \} = await import\("module"\);/,
        'const { createRequire } = { createRequire: () => { throw new Error("createRequire is unavailable in the browser runtime"); } };',
      );
      return { code, map: null };
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  customLogger: logger,
  plugins: [shimWebTreeSitterNodeImports(), tailwindcss(), react()],
  worker: {
    format: "es",
    plugins: () => [shimWebTreeSitterNodeImports()],
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["src/test/setup.ts"],
    exclude: [...configDefaults.exclude, ".worktrees/**"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");

          if (normalizedId.includes("node_modules")) {
            if (
              normalizedId.includes("/node_modules/react/") ||
              normalizedId.includes("/node_modules/react-dom/")
            ) {
              return "react";
            }

            if (
              normalizedId.includes("/node_modules/@codemirror/") ||
              normalizedId.includes("/node_modules/@uiw/react-codemirror/")
            ) {
              return "codemirror";
            }

            if (
              normalizedId.includes("/node_modules/@tauri-apps/api/") ||
              normalizedId.includes("/node_modules/@tauri-apps/plugin-dialog/") ||
              normalizedId.includes("/node_modules/@tauri-apps/plugin-opener/")
            ) {
              return "tauri";
            }

            if (
              normalizedId.includes("/node_modules/@fortawesome/") 
            ) {
              return "icons";
            }

            if (
              normalizedId.includes("/node_modules/@xterm/") 
            ) {
              return "terminal-vendor";
            }

            if (
              normalizedId.includes("/node_modules/web-tree-sitter/")
            ) {
              return "semantics-vendor";
            }
          }

          if (
            normalizedId.includes("/src/components/panels/BottomPanel.") ||
            normalizedId.includes("/src/components/panels/LogsTerminalView.") ||
            normalizedId.includes("/src/components/panels/ShellTerminalView.") ||
            normalizedId.includes("/src/components/panels/TerminalSurface.") ||
            normalizedId.includes("/src/components/editor/useRunOutputState.")
          ) {
            return "terminal-ui";
          }

          if (
            normalizedId.includes("/src/components/panels/GitPanel.") ||
            normalizedId.includes("/src/components/panels/BranchPicker.") ||
            normalizedId.includes("/src/components/panels/BranchSwitchDialog.") ||
            normalizedId.includes("/src/components/editor/useWorkspaceGitState.")
          ) {
            return "git-ui";
          }

          if (
            normalizedId.includes("/src/components/panels/RuntimeTopologyPanel.") ||
            normalizedId.includes("/src/components/panels/DebugFailureDialog.") ||
            normalizedId.includes("/src/components/editor/useRuntimeTopology.")
          ) {
            return "debug-ui";
          }

          if (
            normalizedId.includes("/src/features/semantics/") ||
            normalizedId.includes("/src/components/editor/DocumentOutline.")
          ) {
            return "semantics-ui";
          }
        },
      },
    },
  },
}));
