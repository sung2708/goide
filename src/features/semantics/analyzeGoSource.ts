import { Language, Parser } from "web-tree-sitter";
import runtimeWasmUrl from "web-tree-sitter/web-tree-sitter.wasm?url";
import goLanguageWasmUrl from "@vscode/tree-sitter-wasm/wasm/tree-sitter-go.wasm?url";
import type { SemanticAnalysisResult } from "./types";
import { extractGoSemanticData } from "./extractGoSemanticData";

type AnalyzeGoSourceInput = {
  filePath: string;
  text: string;
  version: number;
};

let parserPromise: Promise<Parser> | null = null;

async function getGoParser(): Promise<Parser> {
  if (parserPromise) {
    return parserPromise;
  }

  parserPromise = (async () => {
    await Parser.init({
      locateFile(fileName: string) {
        if (fileName.endsWith(".wasm")) {
          return runtimeWasmUrl;
        }
        return fileName;
      },
    });

    const parser = new Parser();
    const language = await Language.load(goLanguageWasmUrl);
    parser.setLanguage(language);
    return parser;
  })();

  return parserPromise;
}

export async function analyzeGoSource(
  input: AnalyzeGoSourceInput
): Promise<SemanticAnalysisResult> {
  const parser = await getGoParser();
  const tree = parser.parse(input.text);
  if (!tree) {
    return {
      filePath: input.filePath,
      version: input.version,
      symbols: [],
      folds: [],
      selectionRanges: [],
    };
  }

  try {
    const extracted = extractGoSemanticData(tree.rootNode, input.text);
    return {
      filePath: input.filePath,
      version: input.version,
      ...extracted,
    };
  } finally {
    tree.delete();
  }
}
