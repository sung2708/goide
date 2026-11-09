import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import "@xterm/xterm/css/xterm.css";

// WebdriverIO bridge for `npm run e2e:build` only; removed from normal builds.
if (import.meta.env.VITE_GORO_E2E === "1") {
  void import("@wdio/tauri-plugin");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
