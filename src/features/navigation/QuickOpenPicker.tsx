import QuickPick from "../../components/primitives/QuickPick";
import MatchLabel from "../../components/primitives/MatchLabel";
import { matchFile } from "./fileRanking";
type Props = { query: string; onQuery: (query: string) => void; files: string[]; loading: boolean; error: string | null; notice: string | null; onClose: () => void; onChoose: (path: string) => void };
export default function QuickOpenPicker({ query, onQuery, files, loading, error, notice, onClose, onChoose }: Props) {
  return <QuickPick title="Quick Open" inputLabel="Quick open file" placeholder="Find file..." query={query} onQuery={onQuery}
    loading={loading} error={error} notice={notice} empty="No files found" onClose={onClose} onChoose={onChoose}
    items={files.map(path => {
      const normalized = path.replace(/\\/g, "/"), start = normalized.lastIndexOf("/") + 1;
      const positions = matchFile(normalized, query)?.positions.filter(offset => offset >= start).map(offset => offset - start) ?? [];
      return { id: path, label: path, description: normalized.slice(0, start - 1), content: <MatchLabel text={normalized.slice(start)} positions={positions} /> };
    })} />;
}
