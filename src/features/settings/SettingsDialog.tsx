import { useEffect, useState } from "react";
import Dialog from "../../components/primitives/Dialog";
import { SETTING_DEFINITIONS, type SettingKey, type Settings } from "./model";
import { useSettings } from "./useSettings";
function NumberPreference({ value, label, min, max, commit }: { value: number; label: string; min?: number; max?: number; commit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return <input type="number" aria-label={label} min={min} max={max} value={draft} onChange={event => setDraft(event.target.value)} onBlur={event => { commit(event.target.valueAsNumber); if (!Number.isInteger(event.target.valueAsNumber) || (min !== undefined && event.target.valueAsNumber < min) || (max !== undefined && event.target.valueAsNumber > max)) setDraft(String(value)); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} className="w-24 rounded bg-(--surface0) p-1" />;
}
export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { values, error, store } = useSettings(); const [query, setQuery] = useState("");
  const visible = SETTING_DEFINITIONS.filter(setting => `${setting.label} ${setting.key} ${setting.group}`.toLowerCase().includes(query.toLowerCase().trim()));
  const update = (key: SettingKey, value: Settings[SettingKey]) => store.update(key, value);
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }} ariaLabel="Settings" panelClassName="w-[min(48rem,95vw)] max-h-[85vh] overflow-auto rounded border border-(--border) bg-(--base) p-5 text-(--text)">
    <h2>Settings</h2><p className="mb-3 text-sm">Application preferences apply immediately. Go save actions use gopls and keep disk conflict checks.</p>
    <input autoFocus aria-label="Search settings" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search settings" className="mb-3 w-full rounded bg-(--surface0) p-2" />
    {error && <p role="alert">{error}</p>}
    {visible.length === 0 && <p role="status">No matching settings.</p>}
    {[...new Set(visible.map(setting => setting.group))].map(group => <fieldset key={group} className="mb-4 space-y-3 border border-(--border) p-3"><legend>{group}</legend>{visible.filter(setting => setting.group === group).map(setting => <label key={setting.key} className="flex items-center justify-between gap-4"><span>{setting.label}</span>{setting.type === "boolean" ? <input type="checkbox" aria-label={setting.label} checked={values[setting.key] === true} onChange={event => update(setting.key, event.target.checked)} /> : setting.type === "number" ? <NumberPreference label={setting.label} min={setting.min} max={setting.max} value={Number(values[setting.key])} commit={value => update(setting.key, value)} /> : <select aria-label={setting.label} value={String(values[setting.key])} onChange={event => update(setting.key, event.target.value as Settings[SettingKey])} className="rounded bg-(--surface0) p-1">{setting.options?.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>}</label>)}</fieldset>)}
    <div className="flex justify-end gap-4"><button onClick={store.reset}>Reset preferences to defaults</button><button onClick={onClose}>Close</button></div>
  </Dialog>;
}