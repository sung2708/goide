export default function MatchLabel({ text, positions }: { text: string; positions: number[] }) {
  const matched = new Set(positions);
  let offset = 0;
  return <>{[...text].map(char => {
    const from = offset; offset += char.length;
    return matched.has(from) ? <mark key={from} className="bg-transparent font-semibold text-inherit underline underline-offset-2">{char}</mark> : <span key={from}>{char}</span>;
  })}</>;
}
