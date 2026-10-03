import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { UpdateService, type UpdateState } from "./UpdateService";
import { settingsStore } from "../settings/SettingsStore";
export const updateService = new UpdateService({ invoke: (command, args) => {
  const channel = settingsStore.snapshot().values["updates.channel"];
  return invoke(command, command === "goro_update_download" || command === "goro_update_install" ? { channel: channel === "default" ? null : channel } : args);
}, listen: apply => listen<UpdateState>("goro-update-state", event => apply(event.payload)) });
