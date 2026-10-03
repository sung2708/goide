import { useEffect } from "react";
import { updateService } from "./service";
import { settingsStore } from "../settings/SettingsStore";
import { automaticCheck } from "./startup";
let started = false;
export function useStartupUpdates() {
  useEffect(() => {
    void updateService.initialize();
    if (started || !(globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return;
    started = true;
    setTimeout(() => void automaticCheck(updateService, () => settingsStore.snapshot().values, localStorage).catch(() => { /* Startup errors remain quiet; manual check stays available. */ }), 8000);
  }, []);
}
