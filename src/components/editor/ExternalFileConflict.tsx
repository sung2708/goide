type Props = { exists: boolean; disk: string | null; editor: string; onReload: () => void; onKeep: () => void; onCopy: () => void };
export default function ExternalFileConflict({ exists, disk, editor, onReload, onKeep, onCopy }: Props) {
  return <section aria-label="External file conflict" className="border-b border-(--yellow) bg-(--mantle) p-3 text-xs text-(--text)">
    <p role="alert">{exists ? "This file changed outside Goro. Your editor edits are retained." : "This file was deleted outside Goro. Your editor edits are retained; automatic saving is blocked."}</p>
    <details className="mt-2"><summary className="cursor-pointer">Compare editor and disk</summary><div className="mt-2 grid grid-cols-2 gap-2"><div><h3>Editor</h3><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{editor.slice(0, 65536)}</pre></div><div><h3>Disk</h3><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{disk?.slice(0, 65536) ?? "File deleted"}</pre></div></div>{editor.length > 65536 || (disk?.length ?? 0) > 65536 ? <p>Comparison truncated to 64 KiB per side.</p> : null}</details>
    <div className="mt-2 flex gap-3"><button disabled={!exists} onClick={onReload}>Reload disk (discard editor edits)</button><button disabled={!exists} onClick={onKeep}>Keep editor and overwrite reviewed disk</button><button onClick={onCopy}>Copy editor text</button></div>
  </section>;
}
