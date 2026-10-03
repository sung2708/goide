pub use crate::integration::code_actions::{
    Action as LanguageCodeActionDto, PreviewRequest as LanguageCodeActionPreviewDto,
    QueryRequest as LanguageCodeActionQueryDto,
};
pub use crate::integration::delve::inspection::{
    Output as DebuggerInspectionOutputDto, Request as DebuggerInspectionRequestDto,
};
pub use crate::integration::fs::FileInfo as WorkspaceFileInfoDto;
pub use crate::integration::go_project::actions::{
    Output as GoModuleOutputDto, Request as GoModuleRequestDto,
};
pub use crate::integration::go_project::{
    ProjectInfo as GoProjectInfoDto, Request as GoProjectRequestDto,
};
pub use crate::integration::go_tests::{Output as GoTestOutputDto, Request as GoTestRequestDto};
pub use crate::integration::language::{
    Query as LanguageQueryDto, QueryResult as LanguageQueryResultDto,
};
pub use crate::integration::language_edits::{
    EditPlan as LanguageEditPlanDto, FormatRequest as LanguageFormatRequestDto,
};
pub use crate::integration::language_requests::CancelRequest as LanguageCancelRequestDto;
pub use crate::integration::rename_symbol::{
    RenamePlan as LanguageRenamePlanDto, RenameRequest as LanguageRenameRequestDto,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse<T> {
    pub ok: bool,
    pub data: Option<T>,
    pub error: Option<ApiError>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(code: &str, message: &str) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(ApiError {
                code: code.to_string(),
                message: message.to_string(),
            }),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FsEntryDto {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceFsSyncModeDto {
    Watch,
    Polling,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartWorkspaceFsWatchResponseDto {
    pub workspace_root: String,
    pub watch_id: String,
    pub mode: WorkspaceFsSyncModeDto,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConcurrencyConfidenceDto {
    Predicted,
    Likely,
    Confirmed,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum ConcurrencyConstructKindDto {
    Channel,
    Select,
    Mutex,
    WaitGroup,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum ChannelOperationDto {
    Send,
    Receive,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConcurrencyConstructDto {
    pub kind: ConcurrencyConstructKindDto,
    pub line: usize,
    pub column: usize,
    pub symbol: Option<String>,
    pub scope_key: Option<String>,
    pub confidence: ConcurrencyConfidenceDto,
    pub channel_operation: Option<ChannelOperationDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeConcurrencyRequest {
    pub workspace_root: String,
    pub relative_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "kebab-case")]
pub enum DeepTraceConstructKindDto {
    Channel,
    Select,
    Mutex,
    WaitGroup,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivateDeepTraceRequestDto {
    pub request_id: String,
    pub workspace_root: String,
    pub relative_path: String,
    pub line: usize,
    pub column: usize,
    pub construct_kind: DeepTraceConstructKindDto,
    pub symbol: Option<String>,
    pub counterpart_relative_path: Option<String>,
    pub counterpart_line: Option<usize>,
    pub counterpart_column: Option<usize>,
    pub counterpart_confidence: Option<ConcurrencyConfidenceDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivateDeepTraceResponseDto {
    pub mode: String,
    pub scope_key: Option<String>,
    pub debugger_state: Option<DebuggerStateDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartDebugSessionRequestDto {
    pub request_id: String,
    pub test_name: Option<String>,
    pub workspace_root: String,
    pub relative_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAvailabilityResponseDto {
    pub runtime_availability: String,
}

pub use crate::integration::toolchain::paths::ToolPaths as ToolPathsDto;
pub use crate::integration::toolchain::ToolAvailability as ToolAvailabilityDto;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainStatusDto {
    pub go: ToolAvailabilityDto,
    pub gopls: ToolAvailabilityDto,
    pub delve: ToolAvailabilityDto,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSignalDto {
    pub thread_id: i64,
    pub status: String,
    pub wait_reason: String,
    pub confidence: ConcurrencyConfidenceDto,
    pub scope_key: String,
    pub scope_relative_path: String,
    pub scope_line: usize,
    pub scope_column: usize,
    pub relative_path: String,
    pub line: usize,
    pub column: usize,
    pub sample_relative_path: Option<String>,
    pub sample_line: Option<usize>,
    pub sample_column: Option<usize>,
    pub correlation_id: Option<String>,
    pub counterpart_relative_path: Option<String>,
    pub counterpart_line: Option<usize>,
    pub counterpart_column: Option<usize>,
    pub counterpart_confidence: Option<ConcurrencyConfidenceDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePanelSnapshotDto {
    pub session_active: bool,
    pub signal_count: usize,
    pub blocked_count: usize,
    pub goroutine_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTopologyInteractionDto {
    pub thread_id: i64,
    pub kind: String,
    pub wait_reason: String,
    pub source: String,
    pub target: Option<String>,
    pub confidence: ConcurrencyConfidenceDto,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTopologySnapshotDto {
    pub session_active: bool,
    pub interactions: Vec<RuntimeTopologyInteractionDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DebuggerBreakpointDto {
    pub relative_path: String,
    pub line: usize,
}

/// Lower-level debugger session state already used by current debugger
/// controls. Keep this aligned with `DebugSessionSnapshotDto`, which is the
/// higher-level frontend lifecycle wrapper for the rebuilt debug flow.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DebuggerStateDto {
    pub workspace_root: Option<String>,
    pub session_id: Option<String>,
    pub stop_token: Option<String>,
    pub selected_thread_id: Option<i64>,
    pub session_active: bool,
    pub cleanup_pending: bool,
    pub paused: bool,
    pub active_relative_path: Option<String>,
    pub active_line: Option<usize>,
    pub active_column: Option<usize>,
    pub breakpoints: Vec<DebuggerBreakpointDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DebuggerControlContextDto {
    pub workspace_root: String,
    pub session_id: String,
    pub stop_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DebuggerStopContextDto {
    pub session_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DebuggerControlObservationDto {
    pub session_id: String,
    pub stop_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DebugFailureDto {
    pub code: String,
    pub title: String,
    pub message: String,
    pub details: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DebugSessionSnapshotDto {
    pub status: String,
    pub paused: bool,
    pub active_relative_path: Option<String>,
    pub active_line: Option<usize>,
    pub active_column: Option<usize>,
    pub breakpoints: Vec<DebuggerBreakpointDto>,
    pub failure: Option<DebugFailureDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToggleBreakpointRequestDto {
    pub workspace_root: String,
    pub session_id: Option<String>,
    pub relative_path: String,
    pub line: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchMatchDto {
    pub line: usize,
    pub preview: String,
    #[serde(default)]
    pub ranges: Vec<WorkspaceSearchRangeDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchRangeDto {
    pub from: usize,
    pub to: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchFileDto {
    pub relative_path: String,
    pub matches: Vec<WorkspaceSearchMatchDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitChangedFileDto {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitCommitDto {
    pub hash: String,
    pub author: String,
    pub relative_time: String,
    pub subject: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitSnapshotDto {
    pub branch: String,
    pub changed_files: Vec<WorkspaceGitChangedFileDto>,
    pub commits: Vec<WorkspaceGitCommitDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitFileActionRequestDto {
    pub workspace_root: String,
    pub relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitCommitRequestDto {
    pub workspace_root: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitCommitFileStatDto {
    pub path: String,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitCommitDetailDto {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub relative_time: String,
    pub date_iso: String,
    pub subject: String,
    pub body: String,
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub files: Vec<WorkspaceGitCommitFileStatDto>,
    pub patch_preview: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitGraphEntryDto {
    pub line: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitGraphCommitDto {
    pub graph_prefix: String,
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub date_iso: String,
    pub relative_time: String,
    pub refs: String,
    pub subject: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitBranchDto {
    pub name: String,
    pub kind: String,
    pub is_current: bool,
    pub upstream: Option<String>,
    pub is_remote_tracking_candidate: bool,
    /// For remote-tracking branches: the remote name (e.g. "origin", "upstream").
    /// None for local branches.
    pub remote_name: Option<String>,
    /// For remote-tracking branches: the full ref as returned by git
    /// (e.g. "origin/develop"). Used as the --track argument when creating a
    /// local tracking branch. None for local branches.
    pub remote_ref: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitChangedFileSummaryDto {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBranchSnapshotDto {
    pub current_branch: Option<String>,
    pub is_detached_head: bool,
    pub detached_head_ref: Option<String>,
    pub branches: Vec<WorkspaceGitBranchDto>,
    pub has_uncommitted_changes: bool,
    pub changed_files_summary: Vec<WorkspaceGitChangedFileSummaryDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchWorkspaceBranchRequestDto {
    pub workspace_root: String,
    pub target_branch: String,
    /// Full remote ref to use as the tracking source when creating a new local
    /// branch (e.g. "upstream/develop"). When None the backend falls back to
    /// checking whether any remote ref named `<remote>/<target_branch>` exists.
    pub remote_ref: Option<String>,
    pub pre_switch_action: String,
    pub commit_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompletionRequestDto {
    #[serde(default)]
    pub request_id: Option<String>,
    pub workspace_root: String,
    pub relative_path: String,
    pub line: usize,
    pub column: usize,
    pub trigger_character: Option<String>,
    pub file_content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompletionRangeDto {
    pub start_line: usize,
    pub start_column: usize,
    pub end_line: usize,
    pub end_column: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompletionTextEditDto {
    pub range: CompletionRangeDto,
    pub new_text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompletionItemDto {
    pub label: String,
    pub detail: Option<String>,
    pub documentation: Option<String>,
    pub kind: Option<String>,
    pub insert_text: String,
    pub range: Option<CompletionRangeDto>,
    pub additional_text_edits: Vec<CompletionTextEditDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticSeverityDto {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRangeDto {
    pub start_line: usize,
    pub start_column: usize,
    pub end_line: usize,
    pub end_column: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EditorDiagnosticDto {
    pub severity: DiagnosticSeverityDto,
    pub message: String,
    pub source: Option<String>,
    pub code: Option<String>,
    pub range: DiagnosticRangeDto,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticsToolingAvailabilityDto {
    Available,
    Unavailable,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsResponseDto {
    pub diagnostics: Vec<EditorDiagnosticDto>,
    pub tooling_availability: DiagnosticsToolingAvailabilityDto,
}

// ---------------------------------------------------------------------------
// Shell session DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnsureShellSessionRequestDto {
    pub workspace_root: String,
    pub surface_key: String,
    pub cwd_relative_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnsureShellSessionResponseDto {
    pub shell_session_id: String,
    pub reused: bool,
    pub shell_health: ShellHealthDto,
    pub selected_shell: Option<String>,
    /// Buffered PTY output from the session to replay into a fresh xterm surface.
    /// Empty string for brand-new sessions; contains prior output for reused sessions.
    pub replay: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShellInputRequestDto {
    pub shell_session_id: String,
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShellResizeRequestDto {
    pub shell_session_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DisposeShellSessionRequestDto {
    pub shell_session_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShellOutputPayloadDto {
    pub shell_session_id: String,
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ShellHealthDto {
    Launch,
    Degraded,
    Exit,
}

/// Event emitted when a PTY reader loop ends unexpectedly (shell exited on its
/// own, not via an explicit dispose call).  The frontend uses this to surface
/// a disconnected / retry state inside the Shell tab.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShellExitPayloadDto {
    pub shell_session_id: String,
    pub shell_health: ShellHealthDto,
    pub selected_shell: Option<String>,
}

pub use crate::integration::git::{
    CommitDetails as GitCommitDetailsDto, ConflictContent as GitConflictContentDto,
    FileDiff as GitFileDiffDto, HistoryPage as GitHistoryPageDto,
    HistorySearchRequest as GitHistorySearchRequestDto, Mutation as GitMutationDto,
    RepositoryStatus as GitRepositoryStatusDto, StashList as GitStashListDto,
};
pub use crate::integration::replacement::{
    ReplacementPlan as ReplacementPlanDto, ReplacementRequest as ReplacementRequestDto,
};
pub use crate::integration::search::{
    SearchOptions as SearchOptionsDto, SearchReport as SearchReportDto,
};
pub use crate::integration::signature_help::SignatureHelp as SignatureHelpDto;

#[cfg(test)]
mod tests {
    use super::{EnsureShellSessionRequestDto, ShellExitPayloadDto, ShellHealthDto};

    #[test]
    fn shell_exit_payload_serializes_health_and_selected_shell() {
        let payload = ShellExitPayloadDto {
            shell_session_id: "shell:abc".to_string(),
            shell_health: ShellHealthDto::Exit,
            selected_shell: Some("pwsh".to_string()),
        };

        let json = serde_json::to_value(payload).expect("payload should serialize");
        assert_eq!(json["shellSessionId"], "shell:abc");
        assert_eq!(json["shellHealth"], "exit");
        assert_eq!(json["selectedShell"], "pwsh");
    }

    /// Verify that EnsureShellSessionRequestDto serializes to camelCase `surfaceKey`
    /// and does NOT include any `editorSessionKey` field in the JSON output.
    #[test]
    fn ensure_shell_session_request_dto_serializes_surface_key() {
        let dto = EnsureShellSessionRequestDto {
            workspace_root: "/workspace".to_string(),
            surface_key: "panel:shell".to_string(),
            cwd_relative_path: None,
        };

        let json = serde_json::to_value(&dto).expect("dto should serialize");
        assert_eq!(
            json["surfaceKey"], "panel:shell",
            "expected surfaceKey field in JSON"
        );
        assert!(
            json.get("editorSessionKey").is_none(),
            "editorSessionKey must not appear in JSON after rename"
        );
        assert_eq!(json["workspaceRoot"], "/workspace");
    }
}
