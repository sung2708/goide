import { useEffect, useState } from "react";
import Dialog from "../../components/primitives/Dialog";
import { SETTING_DEFINITIONS, type SettingKey, type Settings } from "./model";
import { useSettings } from "./useSettings";

function NumberPreference({
  value,
  label,
  min,
  max,
  commit,
}: {
  value: number;
  label: string;
  min?: number;
  max?: number;
  commit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit(event.target.valueAsNumber);
        if (
          !Number.isInteger(event.target.valueAsNumber) ||
          (min !== undefined && event.target.valueAsNumber < min) ||
          (max !== undefined && event.target.valueAsNumber > max)
        ) {
          setDraft(String(value));
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className="w-20 rounded-none border border-[var(--border-default)] bg-[var(--surface0)] px-2.5 py-1 text-xs text-[var(--text)] outline-none transition-colors focus:border-[var(--border-interaction)] tabular-nums"
    />
  );
}

function ExecutablePreference({
  value,
  label,
  commit,
}: {
  value: string;
  label: string;
  commit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type="text"
      aria-label={label}
      value={draft}
      maxLength={4096}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) commit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className="w-64 max-w-[55%] rounded-none border border-[var(--border-default)] bg-[var(--surface0)] px-2.5 py-1 font-mono text-xs text-[var(--text)] placeholder-[var(--overlay1)] outline-none transition-colors focus:border-[var(--border-interaction)]"
      placeholder="Absolute executable path"
    />
  );
}

export default function SettingsDialog({
  open,
  onClose,
  toolchainError,
}: {
  open: boolean;
  onClose: () => void;
  toolchainError?: string | null;
}) {
  const { values, error, store } = useSettings();
  const [query, setQuery] = useState("");

  const visible = SETTING_DEFINITIONS.filter((setting) =>
    `${setting.label} ${setting.key} ${setting.group}`
      .toLowerCase()
      .includes(query.toLowerCase().trim())
  );

  const update = (key: SettingKey, value: Settings[SettingKey]) => store.update(key, value);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      ariaLabel="Settings"
      className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-center justify-center bg-black/45 backdrop-blur-[6px] p-4"
      panelClassName="w-[min(48rem,95vw)] max-h-[85vh] flex flex-col overflow-hidden rounded-none border border-[var(--surface-glass-border)] bg-[var(--surface-glass)] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-[var(--blur-elevated)] text-[var(--text)]"
    >
      <div className="border-b border-[var(--border-structural)] px-6 py-4">
        <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">Settings</h2>
        <p className="mt-0.5 text-xs text-[var(--subtext0)]">
          Preferences apply immediately. Go formatting and linting managed via gopls.
        </p>
        <div className="mt-3.5 relative">
          <input
            autoFocus
            aria-label="Search settings"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings…"
            className="w-full rounded-none border border-[var(--border-default)] bg-[var(--surface0)] px-3 py-1.5 text-xs text-[var(--text)] placeholder-[var(--overlay1)] outline-none transition-colors focus:border-[var(--border-interaction)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-3 scrollbar-thin">
        {(error || toolchainError) && (
          <div role="alert" className="mb-4 rounded-none border border-[rgba(235,160,172,0.3)] bg-[rgba(235,160,172,0.08)] px-3 py-2 text-xs text-[var(--red)]">
            {[error, toolchainError].filter(Boolean).join("\n")}
          </div>
        )}

        {visible.length === 0 && (
          <p role="status" className="py-8 text-center text-xs text-[var(--overlay1)]">
            No matching settings.
          </p>
        )}

        {[...new Set(visible.map((setting) => setting.group))].map((group) => (
          <div key={group} className="mb-5 last:mb-2">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-primary)]">
              {group}
            </div>
            <div className="divide-y divide-[var(--border-structural)]/40 rounded-none border border-[var(--border-structural)]/60 bg-[var(--surface0)]/30 px-3.5">
              {visible
                .filter((setting) => setting.group === group)
                .map((setting) => (
                  <label
                    key={setting.key}
                    className="flex items-center justify-between gap-4 py-2.5 text-xs cursor-pointer"
                  >
                    <span className="font-medium text-[var(--subtext1)]">{setting.label}</span>
                    {setting.type === "boolean" ? (
                      <input
                        type="checkbox"
                        aria-label={setting.label}
                        checked={values[setting.key] === true}
                        onChange={(event) => update(setting.key, event.target.checked)}
                        className="size-4 cursor-pointer rounded-none accent-[var(--brand-primary)]"
                      />
                    ) : setting.type === "number" ? (
                      <NumberPreference
                        label={setting.label}
                        min={setting.min}
                        max={setting.max}
                        value={Number(values[setting.key])}
                        commit={(value) => update(setting.key, value)}
                      />
                    ) : setting.type === "string" ? (
                      <ExecutablePreference
                        label={setting.label}
                        value={String(values[setting.key])}
                        commit={(value) => update(setting.key, value)}
                      />
                    ) : (
                      <select
                        aria-label={setting.label}
                        value={String(values[setting.key])}
                        onChange={(event) =>
                          update(setting.key, event.target.value as Settings[SettingKey])
                        }
                        className="rounded-none border border-[var(--border-default)] bg-[var(--surface0)] px-2.5 py-1 text-xs text-[var(--text)] outline-none transition-colors focus:border-[var(--border-interaction)] cursor-pointer"
                      >
                        {setting.options?.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border-structural)] bg-[var(--surface0)]/30 px-6 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={store.reset}
          className="text-xs text-[var(--subtext0)] hover:text-[var(--red)] transition-colors"
        >
          Reset preferences to defaults
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-none border border-[var(--border-default)] bg-[var(--surface0)] px-4 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface1)] transition-colors"
        >
          Close
        </button>
      </div>
    </Dialog>
  );
}
