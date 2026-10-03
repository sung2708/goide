import { prepareFileIndex, rankPreparedFiles } from "./fileRanking";
let files: ReturnType<typeof prepareFileIndex> = [];
self.onmessage = (event: MessageEvent<{ files?: string[]; recent: string[]; query: string; id: number }>) => {
  if (event.data.files) files = prepareFileIndex(event.data.files);
  self.postMessage({ id: event.data.id, files: rankPreparedFiles(files, event.data.query, event.data.recent) });
};
