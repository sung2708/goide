import type { CompletionItem } from "../../lib/ipc/types";
import type { EditorHoverRequest, EditorHoverResult } from "../language/useEditorHover";
import type { EditorSignatureResult } from "../language/useEditorSignature";

export type EditorCompletionRequest = { line: number; column: number; explicit: boolean; triggerCharacter?: string | null; fileContent?: string | null; signal?: AbortSignal };
export type JumpRequest = { line: number; column?: number; requestId: number };
export type InteractionAnchor = { top: number; left: number };
export type EditorLanguageAdapter = {
  completions?: (request: EditorCompletionRequest) => Promise<CompletionItem[]>;
  hover?: (request: EditorHoverRequest) => Promise<EditorHoverResult>;
  signature?: (request: EditorHoverRequest) => Promise<EditorSignatureResult>;
};
