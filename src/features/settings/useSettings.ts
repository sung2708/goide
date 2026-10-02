import { useEffect, useSyncExternalStore } from "react";
import { settingsStore, SETTINGS_STORAGE_KEY, THEME_STORAGE_KEY } from "./SettingsStore";
export function useSettings() {
  const snapshot = useSyncExternalStore(settingsStore.subscribe, settingsStore.snapshot);
  useEffect(() => {
    const refresh = (event: StorageEvent) => { if (event.key === null || event.key === SETTINGS_STORAGE_KEY || event.key === THEME_STORAGE_KEY) settingsStore.refresh(); };
    window.addEventListener("storage", refresh); return () => window.removeEventListener("storage", refresh);
  }, []);
  return { ...snapshot, store: settingsStore };
}