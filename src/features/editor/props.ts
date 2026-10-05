import type { DocumentSnapshot } from '../documents/DocumentSession';
import type { EditorFindCommands } from '../navigation/editorCommands';
import type { VisibleLineRange } from '../concurrency/signalDensity';
import type { CompletionItem, EditorDiagnostic } from '../../lib/ipc/types';
import type { SemanticAnalysisClient } from '../semantics/createSemanticAnalysisClient';
import type { SemanticEntryAction } from '../semantics/types';
import type { EditorHoverRequest, EditorHoverResult } from '../language/useEditorHover';
import type { EditorSignatureResult } from '../language/useEditorSignature';
import type { DocumentOutlineItem } from '../../components/editor/DocumentOutline';
import type { JumpRequest, EditorCompletionRequest, InteractionAnchor } from './contracts';
export type CodeEditorProps = { documentSnapshot?: DocumentSnapshot;
  value: string;
  onCommandsChange?: (commands: EditorFindCommands | null) => void;
  selectionContextKey?: string | null;
  hintLine?: number | null;
  executionLine?: number | null;
  counterpartLine?: number | null;
  jumpRequest?: JumpRequest | null;
  onHoverLineChange?: (line: number | null) => void;
  onSelectionLineChange?: (line: number | null) => void;
  onCursorOffsetChange?: (offset: number | null) => void;
  onModifierClickLine?: (line: number) => boolean;
  onCounterpartAnchorChange?: (anchor: InteractionAnchor | null) => void;
  onInteractionAnchorChange?: (anchor: InteractionAnchor | null) => void;
  onViewportRangeChange?: (range: VisibleLineRange | null) => void;
  onSave?: (content: string) => void;
  onChange?: (value: string) => void;
  onRequestCompletions?: (
    request: EditorCompletionRequest
  ) => Promise<CompletionItem[]>;
  onRequestHover?: (request: EditorHoverRequest) => Promise<EditorHoverResult>;
  onRequestSignature?: (request: EditorHoverRequest) => Promise<EditorSignatureResult>;
  signatureRequestTrigger?: number;
  filePath?: string | null;
  semanticAnalysisClient?: SemanticAnalysisClient;
  executionActionsEnabled?: boolean;
  onEntryAction?: (action: SemanticEntryAction, intent: "run" | "debug", source: string) => void;
  onDocumentSymbolsChange?: (symbols: DocumentOutlineItem[]) => void;
  editable?: boolean;
  diagnostics?: EditorDiagnostic[];
  breakpoints?: number[];
  onToggleBreakpoint?: (line: number) => void;
  suppressFindWidget?: boolean;
  externalSearchQuery?: string | null;
  externalSearchTarget?: { line: number; from: number; to: number; preview: string } | null;
};




