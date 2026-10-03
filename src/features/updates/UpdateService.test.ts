import { describe, expect, it, vi } from "vitest";
import { UpdateService, type UpdateState } from "./UpdateService";
import { automaticCheck } from "./startup";
import { DEFAULT_SETTINGS } from "../settings/model";
const state = (overrides: Partial<UpdateState> = {}): UpdateState => ({ revision: 1, currentVersion: "0.2.0-alpha.1", channel: "alpha", configured: true, phase: "idle", release: null, received: 0, total: null, lastChecked: null, error: null, ...overrides });
describe("update service concurrency and native authority", () => {
  it("startup check is quiet, caches successful checks and never overwrites manual downloaded state", async () => {
    let current = state(); let cache: string | null = null;
    const check = vi.fn(async () => { current = state({ phase: "updateAvailable" }); }); const download = vi.fn(async () => undefined);
    const service = { initialize: async () => undefined, snapshot: () => current, check, download };
    const storage = { getItem: () => cache, setItem: (_: string, value: string) => { cache = value; } };
    await automaticCheck(service, () => DEFAULT_SETTINGS, storage, () => 100000);
    expect(check).toHaveBeenCalledTimes(1); expect(download).not.toHaveBeenCalled(); expect(cache).not.toBeNull();
    current = state(); await automaticCheck(service, () => DEFAULT_SETTINGS, storage, () => 100100); expect(check).toHaveBeenCalledTimes(1);
    current = state({ phase: "downloaded" }); cache = null; await automaticCheck(service, () => DEFAULT_SETTINGS, storage); expect(check).toHaveBeenCalledTimes(1);
  });
  it("startup respects disabled checks and auto-download opt-in; failed checks are not cached", async () => {
    let current = state(); const storage = { getItem: () => null, setItem: vi.fn() };
    const check = vi.fn(async () => { current = state({ phase: "error" }); }); const download = vi.fn(async () => undefined);
    const service = { initialize: async () => undefined, snapshot: () => current, check, download };
    await automaticCheck(service, () => ({ ...DEFAULT_SETTINGS, "updates.autoCheck": false }), storage); expect(check).not.toHaveBeenCalled();
    await automaticCheck(service, () => DEFAULT_SETTINGS, storage); expect(storage.setItem).not.toHaveBeenCalled(); expect(download).not.toHaveBeenCalled();
    current = state(); check.mockImplementation(async () => { current = state({ phase: "updateAvailable" }); });
    await automaticCheck(service, () => ({ ...DEFAULT_SETTINGS, "updates.autoDownload": true }), storage); expect(download).toHaveBeenCalledTimes(1);
  });
  it("deduplicates checks, downloads and subscription initialization", async () => {
    let finish!: (value: UpdateState) => void;
    const invoke = vi.fn(() => new Promise<UpdateState>(resolve => { finish = resolve; }));
    const listen = vi.fn(async () => () => undefined);
    const service = new UpdateService({ invoke: invoke as never, listen });
    const first = service.check("alpha"), second = service.check("alpha");
    expect(second).toBe(first); expect(invoke).toHaveBeenCalledTimes(1);
    finish(state({ phase: "updateAvailable", release: { version: "0.2.0-alpha.2", notes: "text", publishedAt: null } })); await first;
    const download = service.download(); expect(service.download()).toBe(download);
    finish(state({ revision: 2, phase: "downloaded" })); await download;
    const init = service.initialize(); expect(service.initialize()).toBe(init);
    await Promise.resolve(); finish(state({ revision: 3 })); await init;
    expect(listen).toHaveBeenCalledTimes(1);
  });
  it("ignores stale events and never invents download completion from progress", async () => {
    let event!: (value: UpdateState) => void;
    const service = new UpdateService({ invoke: async <T>() => state() as T, listen: async apply => { event = apply; return () => undefined; } });
    await service.initialize();
    event(state({ revision: 10, phase: "downloading", received: 100, total: 100 }));
    event(state({ revision: 9, phase: "downloaded" }));
    expect(service.snapshot().phase).toBe("downloading");
    event(state({ revision: 11, phase: "error", error: { code: "update_signature", message: "Verification failed" } }));
    expect(service.snapshot().error?.code).toBe("update_signature");
  });
  it("requires verified native state and registered safe-close consent before installation", async () => {
    let event!: (value: UpdateState) => void;
    const invoke = vi.fn(async () => state());
    const service = new UpdateService({ invoke: invoke as never, listen: async apply => { event = apply; return () => undefined; } });
    await service.initialize(); const consent = vi.fn(); const stop = service.registerInstall(consent);
    service.requestInstall(); expect(consent).not.toHaveBeenCalled();
    event(state({ revision: 2, phase: "downloaded" })); service.requestInstall(); expect(consent).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalledWith("goro_update_install"); stop(); service.requestInstall(); expect(consent).toHaveBeenCalledTimes(1);
  });
  it("does not expose transport credentials or private IPC errors", async () => {
    const service = new UpdateService({ invoke: async () => { throw new Error("https://secret:token@private.example/"); }, listen: async () => () => undefined });
    await service.check(); expect(service.snapshot().error?.message).not.toContain("token"); expect(service.snapshot().phase).toBe("error");
  });
});
