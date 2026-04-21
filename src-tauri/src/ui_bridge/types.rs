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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartDebugSessionRequestDto {
    pub workspace_root: String,
    pub relative_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAvailabilityResponseDto {
    pub runtime_availability: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToolAvailabilityDto {
    pub available: bool,
    pub version: Option<String>,
}

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

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DebuggerStateDto {
    pub session_active: bool,
    pub paused: bool,
    pub active_relative_path: Option<String>,
    pub active_line: Option<usize>,
    pub active_column: Option<usize>,
    pub breakpoints: Vec<DebuggerBreakpointDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToggleBreakpointRequestDto {
    pub relative_path: String,
    pub line: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchMatchDto {
    pub line: usize,
    pub preview: String,
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
