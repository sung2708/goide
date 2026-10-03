import type { Settings } from "../settings/model";
import type { UpdateService } from "./UpdateService";
const CACHE = "goro.update-check.v1";
export async function automaticCheck(service: Pick<UpdateService, "initialize" | "snapshot" | "check" | "download">, preferences: () => Readonly<Settings>, storage: Pick<Storage, "getItem" | "setItem">, now = Date.now) {
  await service.initialize();
  const values = preferences();
  // A manual check/download during the startup delay owns its result. Never reset it.
  if (!values["updates.autoCheck"] || service.snapshot().phase !== "idle") return;
  const channel = values["updates.channel"] === "default" ? undefined : values["updates.channel"];
  const key = `${service.snapshot().currentVersion}/${channel ?? "default"}`;
  try { const raw = storage.getItem(CACHE); if (raw && raw.length < 1024) { const saved = JSON.parse(raw); if (saved.key === key && typeof saved.at === "number" && now() >= saved.at && now() - saved.at < 86400000) return; } } catch { /* Nonessential cache. */ }
  await service.check(channel);
  const state = service.snapshot();
  if (["upToDate", "updateAvailable"].includes(state.phase)) { try { storage.setItem(CACHE, JSON.stringify({ key, at: now() })); } catch { /* Session remains usable. */ } }
  if (state.phase === "updateAvailable" && preferences()["updates.autoDownload"]) await service.download();
}
