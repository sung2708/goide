use anyhow::{anyhow, Context, Result};
use crate::integration::command::std_command;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Output, Stdio};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::Duration;

use crate::integration::fs;
use crate::integration::lsp_manager;

const LSP_REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConstructKind {
    Channel,
    Select,
    Mutex,
    WaitGroup,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Confidence {
    Predicted,
    Likely,
    Confirmed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChannelOperation {
    Send,
    Receive,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedConstruct {
    pub kind: ConstructKind,
    pub line: usize,
    pub column: usize,
    pub symbol: Option<String>,
    pub scope_key: Option<String>,
    pub confidence: Confidence,
    pub channel_operation: Option<ChannelOperation>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticRange {
    pub start_line: usize,
    pub start_column: usize,
    pub end_line: usize,
    pub end_column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileDiagnostic {
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub source: Option<String>,
    pub code: Option<String>,
    pub range: DiagnosticRange,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticsToolingAvailability {
    Available,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileDiagnosticsResult {
    pub diagnostics: Vec<FileDiagnostic>,
    pub tooling_availability: DiagnosticsToolingAvailability,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletionRange {
    pub start_line: usize,
    pub start_column: usize,
    pub end_line: usize,
    pub end_column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletionTextEdit {
    pub range: CompletionRange,
    pub new_text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletionItem {
    pub label: String,
    pub detail: Option<String>,
    pub documentation: Option<String>,
    pub kind: Option<String>,
    pub insert_text: String,
    pub range: Option<CompletionRange>,
    pub additional_text_edits: Vec<CompletionTextEdit>,
}

fn is_mutex_name(text: &str) -> bool {
    text == "Mutex" || text.ends_with(".Mutex")
}

fn is_waitgroup_name(text: &str) -> bool {
    text == "WaitGroup" || text.ends_with(".WaitGroup")
}

fn confidence_for_identifier(text: &str) -> Confidence {
    if text.contains('.') {
        Confidence::Likely
    } else {
        Confidence::Predicted
    }
}

pub fn analyze_file(workspace_root: &str, relative_path: &str) -> Result<Vec<DetectedConstruct>> {
    let source = fs::read_file(workspace_root, relative_path)?;
    let tokens = tokenize_identifiers(&source);

    let mut results = detect_from_tokens(tokens);
    results.extend(detect_channel_flow_markers(&source));

    if let Ok(gopls_results) = analyze_with_gopls(workspace_root, relative_path) {
        merge_gopls_constructs(&mut results, gopls_results);
    }

    results.sort_by(|a, b| {
        a.line
            .cmp(&b.line)
            .then_with(|| a.column.cmp(&b.column))
            .then_with(|| a.kind_name().cmp(b.kind_name()))
            .then_with(|| {
                a.symbol
                    .as_deref()
                    .unwrap_or("")
                    .cmp(b.symbol.as_deref().unwrap_or(""))
            })
    });
    results.dedup_by(|a, b| {
        a.kind == b.kind
            && a.line == b.line
            && a.column == b.column
            && a.symbol == b.symbol
            && a.scope_key == b.scope_key
            && a.channel_operation == b.channel_operation
    });

    Ok(results)
}

fn merge_gopls_constructs(
    results: &mut [DetectedConstruct],
    gopls_results: Vec<DetectedConstruct>,
) {
    for gopls_construct in gopls_results {
        // Find existing lexer detection on the same line.
        // Typical Go syntax: 'mu sync.Mutex' or 'var mu sync.Mutex'
        // The identifier (gopls symbol) comes BEFORE the type (lexer token).
        // For channels, merge only declaration tokens (channel_operation == None),
        // never send/receive flow markers.
        if let Some(existing) = results.iter_mut().find(|item| {
            (item.kind != ConstructKind::Channel || item.channel_operation.is_none())
                && item.line == gopls_construct.line
                && item.column >= gopls_construct.column
        }) {
            // If they are on the same line and gopls found a symbol nearby, upgrade confidence.
            existing.confidence = Confidence::Confirmed;
            if existing.symbol.is_none()
                || existing.symbol.as_deref() == Some("sync.Mutex")
                || existing.symbol.as_deref() == Some("sync.WaitGroup")
            {
                existing.symbol = Some(gopls_construct.symbol.clone().unwrap_or_default());
            }
        }
    }
}

fn detect_from_tokens(tokens: Vec<WordToken>) -> Vec<DetectedConstruct> {
    let mut results = Vec::new();
    for token in tokens {
        match token.text.as_str() {
            "chan" => results.push(DetectedConstruct {
                kind: ConstructKind::Channel,
                line: token.line,
                column: token.column,
                symbol: None,
                scope_key: None,
                confidence: Confidence::Predicted,
                channel_operation: None,
            }),
            "select" => results.push(DetectedConstruct {
                kind: ConstructKind::Select,
                line: token.line,
                column: token.column,
                symbol: None,
                scope_key: None,
                confidence: Confidence::Predicted,
                channel_operation: None,
            }),
            name if is_mutex_name(name) => results.push(DetectedConstruct {
                kind: ConstructKind::Mutex,
                line: token.line,
                column: token.column,
                symbol: Some("sync.Mutex".to_string()),
                scope_key: None,
                confidence: confidence_for_identifier(&token.text),
                channel_operation: None,
            }),
            name if is_waitgroup_name(name) => results.push(DetectedConstruct {
                kind: ConstructKind::WaitGroup,
                line: token.line,
                column: token.column,
                symbol: Some("sync.WaitGroup".to_string()),
                scope_key: None,
                confidence: confidence_for_identifier(&token.text),
                channel_operation: None,
            }),
            _ => {}
        }
    }

    results
}

fn is_symbol_char(ch: char) -> bool {
    ch == '_' || ch == '.' || ch.is_ascii_alphanumeric()
}

fn scan_left_identifier(
    chars: &[char],
    line_start: usize,
    op_start: usize,
) -> Option<(usize, String)> {
    if op_start <= line_start {
        return None;
    }

    let mut i = op_start;
    while i > line_start && chars[i - 1].is_ascii_whitespace() {
        i -= 1;
    }
    if i <= line_start {
        return None;
    }

    let end = i;
    while i > line_start && is_symbol_char(chars[i - 1]) {
        i -= 1;
    }
    if i == end {
        return None;
    }

    Some((i, chars[i..end].iter().collect()))
}

fn scan_right_identifier(chars: &[char], op_start: usize) -> Option<(usize, String)> {
    let mut i = op_start + 2;
    while i < chars.len() && chars[i].is_ascii_whitespace() {
        i += 1;
    }
    if i >= chars.len() || chars[i] == '\n' {
        return None;
    }

    let start = i;
    while i < chars.len() && chars[i] != '\n' && is_symbol_char(chars[i]) {
        i += 1;
    }
    if i == start {
        return None;
    }

    Some((start, chars[start..i].iter().collect()))
}

fn prev_non_whitespace_char(chars: &[char], mut from_exclusive: usize) -> Option<char> {
    while from_exclusive > 0 {
        from_exclusive -= 1;
        let ch = chars[from_exclusive];
        if !ch.is_ascii_whitespace() {
            return Some(ch);
        }
    }
    None
}

fn is_first_non_whitespace_on_line(chars: &[char], line_start: usize, idx: usize) -> bool {
    let mut cursor = line_start;
    while cursor < idx {
        if !chars[cursor].is_ascii_whitespace() {
            return false;
        }
        cursor += 1;
    }
    true
}

fn is_receive_leading_keyword(text: &str) -> bool {
    matches!(
        text,
        "case" | "return" | "go" | "defer" | "if" | "for" | "switch" | "select"
    )
}

fn detect_channel_flow_markers(source: &str) -> Vec<DetectedConstruct> {
    let mut results = Vec::new();
    let chars: Vec<char> = source.chars().collect();
    let mut i = 0usize;
    let mut line = 1usize;
    let mut state = LexState::Normal;
    let mut line_start = 0usize;
    let mut block_stack: Vec<ScopeFrame> = Vec::new();
    let mut paren_stack: Vec<usize> = Vec::new();
    let mut next_scope_id = 1usize;
    let mut pending_block_scope: Option<ScopeFrame> = None;

    while i < chars.len() {
        let ch = chars[i];
        let next = chars.get(i + 1).copied();

        match state {
            LexState::Normal => {
                if ch == '/' && next == Some('/') {
                    state = LexState::LineComment;
                    i += 2;
                    continue;
                }
                if ch == '/' && next == Some('*') {
                    state = LexState::BlockComment;
                    i += 2;
                    continue;
                }
                if ch == '"' {
                    state = LexState::DoubleQuoteString;
                    i += 1;
                    continue;
                }
                if ch == '`' {
                    state = LexState::RawString;
                    i += 1;
                    continue;
                }
                if ch == '\'' {
                    state = LexState::RuneLiteral;
                    i += 1;
                    continue;
                }

                if ch == '<' && next == Some('-') {
                    let left = scan_left_identifier(&chars, line_start, i);
                    let right = scan_right_identifier(&chars, i);

                    // Ignore type direction markers: chan<- T or <-chan T
                    if left.as_ref().map(|(_, s)| s.as_str()) == Some("chan")
                        || right.as_ref().map(|(_, s)| s.as_str()) == Some("chan")
                    {
                        i += 2;
                        continue;
                    }

                    let prev_non_ws = prev_non_whitespace_char(&chars, i);
                    let receive_context = left
                        .as_ref()
                        .map(|(_, text)| is_receive_leading_keyword(text))
                        .unwrap_or(false)
                        || left.is_none()
                            && matches!(
                                prev_non_ws,
                                Some('=')
                                    | Some(':')
                                    | Some('(')
                                    | Some(',')
                                    | Some('{')
                                    | Some('[')
                            )
                        || left.is_none() && is_first_non_whitespace_on_line(&chars, line_start, i);

                    let marker = if let Some((start_idx, symbol)) = left.as_ref() {
                        if !is_receive_leading_keyword(symbol) {
                            Some((*start_idx, symbol.clone(), ChannelOperation::Send))
                        } else {
                            right
                                .as_ref()
                                .map(|(idx, sym)| (*idx, sym.clone(), ChannelOperation::Receive))
                        }
                    } else if receive_context {
                        right
                            .as_ref()
                            .map(|(idx, sym)| (*idx, sym.clone(), ChannelOperation::Receive))
                    } else {
                        None
                    };

                    if let Some((start_idx, symbol, channel_operation)) = marker {
                        let column = start_idx.saturating_sub(line_start) + 1;
                        results.push(DetectedConstruct {
                            kind: ConstructKind::Channel,
                            line,
                            column,
                            symbol: Some(symbol),
                            scope_key: Some(build_scope_key(line, &block_stack)),
                            confidence: Confidence::Predicted,
                            channel_operation: Some(channel_operation),
                        });
                    }

                    i += 2;
                    continue;
                }

                if ch == '\n' {
                    line += 1;
                    line_start = i + 1;
                }
                if ch == '(' {
                    paren_stack.push(i);
                } else if ch == ')' {
                    let open_paren = paren_stack.pop();
                    if next_non_whitespace_char(&chars, i + 1) == Some('{')
                        && open_paren
                            .map(|open_idx| is_function_signature_paren(&chars, open_idx))
                            .unwrap_or(false)
                    {
                        let scope_frame = ScopeFrame {
                            id: next_scope_id,
                            kind: ScopeKind::Function,
                        };
                        next_scope_id += 1;
                        pending_block_scope = Some(scope_frame);
                    }
                } else if ch == '{' {
                    let scope_frame = pending_block_scope.take().unwrap_or_else(|| {
                        let frame = ScopeFrame {
                            id: next_scope_id,
                            kind: ScopeKind::Block,
                        };
                        next_scope_id += 1;
                        frame
                    });
                    block_stack.push(scope_frame);
                } else if ch == '}' {
                    block_stack.pop();
                }
                i += 1;
            }
            LexState::LineComment => {
                if ch == '\n' {
                    state = LexState::Normal;
                    line += 1;
                    line_start = i + 1;
                }
                i += 1;
            }
            LexState::BlockComment => {
                if ch == '*' && next == Some('/') {
                    state = LexState::Normal;
                    i += 2;
                    continue;
                }
                if ch == '\n' {
                    line += 1;
                    line_start = i + 1;
                }
                i += 1;
            }
            LexState::DoubleQuoteString => {
                if ch == '\\' {
                    i += 2;
                    continue;
                }
                if ch == '"' {
                    state = LexState::Normal;
                }
                if ch == '\n' {
                    line += 1;
                    line_start = i + 1;
                }
                i += 1;
            }
            LexState::RawString => {
                if ch == '`' {
                    state = LexState::Normal;
                }
                if ch == '\n' {
                    line += 1;
                    line_start = i + 1;
                }
                i += 1;
            }
            LexState::RuneLiteral => {
                if ch == '\\' {
                    i += 2;
                    continue;
                }
                if ch == '\'' {
                    state = LexState::Normal;
                }
                if ch == '\n' {
                    line += 1;
                    line_start = i + 1;
                }
                i += 1;
            }
        }
    }

    results
}

fn next_non_whitespace_char(chars: &[char], mut from: usize) -> Option<char> {
    while from < chars.len() {
        let ch = chars[from];
        if !ch.is_ascii_whitespace() {
            return Some(ch);
        }
        from += 1;
    }
    None
}

fn scan_prev_identifier(chars: &[char], mut from_exclusive: usize) -> Option<(usize, String)> {
    while from_exclusive > 0 && chars[from_exclusive - 1].is_ascii_whitespace() {
        from_exclusive -= 1;
    }
    if from_exclusive == 0 {
        return None;
    }

    let end = from_exclusive;
    while from_exclusive > 0 && is_symbol_char(chars[from_exclusive - 1]) {
        from_exclusive -= 1;
    }
    if from_exclusive == end {
        return None;
    }
    Some((from_exclusive, chars[from_exclusive..end].iter().collect()))
}

fn is_function_signature_paren(chars: &[char], open_paren_idx: usize) -> bool {
    let Some((first_start, first_ident)) = scan_prev_identifier(chars, open_paren_idx) else {
        return false;
    };

    if first_ident == "func" {
        return true;
    }

    let Some((_, second_ident)) = scan_prev_identifier(chars, first_start) else {
        return false;
    };
    second_ident == "func"
}

fn build_scope_key(line: usize, block_stack: &[ScopeFrame]) -> String {
    if block_stack.is_empty() {
        return format!("L{}::global", line);
    }
    let mut key = String::new();
    for (index, scope) in block_stack.iter().enumerate() {
        if index > 0 {
            key.push('>');
        }
        key.push(match scope.kind {
            ScopeKind::Function => 'F',
            ScopeKind::Block => 'B',
        });
        key.push_str(&scope.id.to_string());
    }
    key
}

impl DetectedConstruct {
    fn kind_name(&self) -> &'static str {
        match self.kind {
            ConstructKind::Channel => "channel",
            ConstructKind::Select => "select",
            ConstructKind::Mutex => "mutex",
            ConstructKind::WaitGroup => "waitgroup",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WordToken {
    text: String,
    line: usize,
    column: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LexState {
    Normal,
    LineComment,
    BlockComment,
    DoubleQuoteString,
    RawString,
    RuneLiteral,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ScopeKind {
    Function,
    Block,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ScopeFrame {
    id: usize,
    kind: ScopeKind,
}

fn tokenize_identifiers(source: &str) -> Vec<WordToken> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = source.chars().collect();
    let mut i = 0usize;
    let mut line = 1usize;
    let mut column = 1usize;
    let mut state = LexState::Normal;

    while i < chars.len() {
        let ch = chars[i];
        let next = chars.get(i + 1).copied();

        match state {
            LexState::Normal => {
                if ch == '/' && next == Some('/') {
                    state = LexState::LineComment;
                    advance_pair(&mut i, &mut line, &mut column, ch, '/');
                    continue;
                }
                if ch == '/' && next == Some('*') {
                    state = LexState::BlockComment;
                    advance_pair(&mut i, &mut line, &mut column, ch, '*');
                    continue;
                }
                if ch == '"' {
                    state = LexState::DoubleQuoteString;
                    advance_one(&mut i, &mut line, &mut column, ch);
                    continue;
                }
                if ch == '`' {
                    state = LexState::RawString;
                    advance_one(&mut i, &mut line, &mut column, ch);
                    continue;
                }
                if ch == '\'' {
                    state = LexState::RuneLiteral;
                    advance_one(&mut i, &mut line, &mut column, ch);
                    continue;
                }
                if is_ident_start(ch) {
                    let start_line = line;
                    let start_col = column;
                    let mut text = String::new();
                    text.push(ch);
                    advance_one(&mut i, &mut line, &mut column, ch);
                    while i < chars.len() && is_ident_continue(chars[i]) {
                        text.push(chars[i]);
                        let next_char = chars[i];
                        advance_one(&mut i, &mut line, &mut column, next_char);
                    }
                    tokens.push(WordToken {
                        text,
                        line: start_line,
                        column: start_col,
                    });
                    continue;
                }

                advance_one(&mut i, &mut line, &mut column, ch);
            }
            LexState::LineComment => {
                if ch == '\n' {
                    state = LexState::Normal;
                }
                advance_one(&mut i, &mut line, &mut column, ch);
            }
            LexState::BlockComment => {
                if ch == '*' && next == Some('/') {
                    state = LexState::Normal;
                    advance_pair(&mut i, &mut line, &mut column, ch, '/');
                    continue;
                }
                advance_one(&mut i, &mut line, &mut column, ch);
            }
            LexState::DoubleQuoteString => {
                if ch == '\\' {
                    advance_one(&mut i, &mut line, &mut column, ch);
                    if i < chars.len() {
                        let escaped = chars[i];
                        advance_one(&mut i, &mut line, &mut column, escaped);
                    }
                    continue;
                }
                if ch == '"' {
                    state = LexState::Normal;
                }
                advance_one(&mut i, &mut line, &mut column, ch);
            }
            LexState::RawString => {
                if ch == '`' {
                    state = LexState::Normal;
                }
                advance_one(&mut i, &mut line, &mut column, ch);
            }
            LexState::RuneLiteral => {
                if ch == '\\' {
                    advance_one(&mut i, &mut line, &mut column, ch);
                    if i < chars.len() {
                        let escaped = chars[i];
                        advance_one(&mut i, &mut line, &mut column, escaped);
                    }
                    continue;
                }
                if ch == '\'' {
                    state = LexState::Normal;
                }
                advance_one(&mut i, &mut line, &mut column, ch);
            }
        }
    }

    tokens
}

fn is_ident_start(ch: char) -> bool {
    ch == '_' || ch.is_ascii_alphabetic()
}

fn is_ident_continue(ch: char) -> bool {
    ch == '_' || ch == '.' || ch.is_ascii_alphanumeric()
}

fn advance_one(i: &mut usize, line: &mut usize, column: &mut usize, ch: char) {
    *i += 1;
    if ch == '\n' {
        *line += 1;
        *column = 1;
    } else {
        *column += 1;
    }
}

fn advance_pair(i: &mut usize, line: &mut usize, column: &mut usize, first: char, second: char) {
    advance_one(i, line, column, first);
    advance_one(i, line, column, second);
}

pub fn analyze_file_diagnostics(
    workspace_root: &str,
    relative_path: &str,
) -> Result<FileDiagnosticsResult> {
    let workspace_path = Path::new(workspace_root);
    if !workspace_path.is_dir() {
        return Err(anyhow!(
            "workspace root does not exist or is not a directory: {workspace_root}"
        ));
    }

    let output = std_command("gopls")
        .arg("check")
        .arg(relative_path)
        .current_dir(workspace_root)
        .output();

    let output = match output {
        Ok(out) => out,
        Err(err) => {
            if err.kind() == io::ErrorKind::NotFound {
                return Ok(FileDiagnosticsResult {
                    diagnostics: Vec::new(),
                    tooling_availability: DiagnosticsToolingAvailability::Unavailable,
                });
            }
            return Err(err).context("failed to execute gopls check command");
        }
    };

    let diagnostics = collect_gopls_diagnostics_from_streams(
        workspace_root,
        relative_path,
        &output.stdout,
        &output.stderr,
    )?;
    Ok(FileDiagnosticsResult {
        diagnostics,
        tooling_availability: DiagnosticsToolingAvailability::Available,
    })
}

fn collect_gopls_diagnostics_from_streams(
    workspace_root: &str,
    relative_path: &str,
    stdout: &[u8],
    stderr: &[u8],
) -> Result<Vec<FileDiagnostic>> {
    let mut results = Vec::new();

    // Parse both streams to avoid missing diagnostics in mixed-output environments.
    if !stdout.is_empty() {
        results.extend(parse_gopls_diagnostics_output(
            workspace_root,
            relative_path,
            stdout,
        )?);
    }
    if !stderr.is_empty() {
        results.extend(parse_gopls_diagnostics_output(
            workspace_root,
            relative_path,
            stderr,
        )?);
    }

    Ok(results)
}

pub fn get_file_completions(
    workspace_root: &str,
    relative_path: &str,
    line: usize,
    column: usize,
    _trigger_character: Option<&str>,
    file_content: Option<&str>,
) -> Result<Vec<CompletionItem>> {
    let workspace_path = normalize_platform_pathbuf(
        Path::new(workspace_root)
            .canonicalize()
            .with_context(|| format!("workspace root does not exist: {workspace_root}"))?,
    );
    let target_path = normalize_platform_pathbuf(
        workspace_path
            .join(relative_path)
            .canonicalize()
            .with_context(|| format!("completion target does not exist: {relative_path}"))?,
    );
    if !target_path.starts_with(&workspace_path) {
        return Err(anyhow!("completion target escapes workspace root"));
    }
    let content;
    let effective_content = match file_content {
        Some(value) => value,
        None => {
            content = fs::read_file(workspace_root, relative_path)?;
            &content
        }
    };

    match get_file_completions_via_lsp(
        &workspace_path,
        &target_path,
        line,
        column,
        effective_content,
    ) {
        Ok(items) => return Ok(items),
        Err(error) => {
            if error
                .downcast_ref::<io::Error>()
                .map(|err| err.kind() == io::ErrorKind::NotFound)
                .unwrap_or(false)
            {
                return Ok(Vec::new());
            }
        }
    }

    let location = format!("{relative_path}:{line}:{column}");
    let output = match run_gopls_completion(workspace_root, &location, file_content) {
        Ok(out) => out,
        Err(err) => {
            if err.kind() == io::ErrorKind::NotFound {
                return Ok(Vec::new());
            }
            return Err(err).context("failed to execute gopls completion command");
        }
    };

    if !output.status.success() {
        return Ok(Vec::new());
    }

    if output.stdout.is_empty() && output.stderr.is_empty() {
        return Ok(Vec::new());
    }

    let output_bytes = if !output.stdout.is_empty() {
        &output.stdout
    } else {
        &output.stderr
    };

    Ok(parse_gopls_completion_output(output_bytes))
}

struct ChildGuard {
    child: Child,
}

impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn get_file_completions_via_lsp(
    workspace_root: &Path,
    target_path: &Path,
    line: usize,
    column: usize,
    file_content: &str,
) -> Result<Vec<CompletionItem>> {
    let session_handle = lsp_manager::get_lsp_session();
    let mut guard = session_handle.lock().map_err(|_| anyhow!("LSP session lock poisoned"))?;
    
    let session = if let Some(s) = guard.as_mut() {
        if s.workspace_root == workspace_root {
            s
        } else {
            *guard = None;
            lsp_manager::start_new_lsp_session(workspace_root, &mut *guard)?
        }
    } else {
        lsp_manager::start_new_lsp_session(workspace_root, &mut *guard)?
    };

    let target_uri = path_to_file_uri(target_path);
    
    if !session.open_files.contains(&target_uri) {
        lsp_manager::write_lsp_notification_sync(
            &mut session.stdin,
            "textDocument/didOpen",
            json!({
                "textDocument": {
                    "uri": target_uri,
                    "languageId": "go",
                    "version": 1,
                    "text": file_content
                }
            }),
        )?;
        session.open_files.insert(target_uri.clone());
    } else {
        lsp_manager::write_lsp_notification_sync(
            &mut session.stdin,
            "textDocument/didChange",
            json!({
                "textDocument": {
                    "uri": target_uri,
                    "version": session.next_id,
                },
                "contentChanges": [
                    { "text": file_content }
                ]
            }),
        )?;
    }

    let mut completion_response: Option<Value> = None;
    for attempt in 0..20 {
        let request_id = session.next_id;
        session.next_id += 1;

        write_lsp_request(
            &mut session.stdin,
            request_id,
            "textDocument/completion",
            json!({
                "textDocument": {
                    "uri": target_uri
                },
                "position": {
                    "line": line.saturating_sub(1),
                    "character": column.saturating_sub(1)
                }
            }),
        )?;

        let response = lsp_manager::wait_lsp_response_sync(&session.rx, request_id)?;
        if lsp_manager::lsp_error_message_sync(&response) == Some("no views") {
            std::thread::sleep(Duration::from_millis(100));
            continue;
        }
        completion_response = Some(response);
        break;
    }

    let completion_response =
        completion_response.ok_or_else(|| anyhow!("gopls completion failed after retries"))?;
    lsp_manager::ensure_lsp_response_success_sync(completion_response.clone())?;
    Ok(parse_lsp_completion_response(&completion_response))
}

fn wait_lsp_response(rx: &mpsc::Receiver<Value>, id: i64) -> Result<Value> {
    loop {
        let message = rx
            .recv_timeout(LSP_REQUEST_TIMEOUT)
            .context("timed out waiting for gopls response")?;
        if message.get("id").and_then(Value::as_i64) == Some(id) {
            return Ok(message);
        }
    }
}

fn ensure_lsp_response_success(response: Value) -> Result<()> {
    if let Some(message) = lsp_error_message(&response) {
        return Err(anyhow!(message.to_string()));
    }
    Ok(())
}

fn lsp_error_message(response: &Value) -> Option<&str> {
    response
        .get("error")?
        .get("message")
        .and_then(Value::as_str)
        .or(Some("unknown gopls LSP error"))
}

fn write_lsp_request<W: Write>(
    writer: &mut W,
    id: i64,
    method: &str,
    params: Value,
) -> io::Result<()> {
    write_lsp_message(
        writer,
        &json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        }),
    )
}

fn write_lsp_notification<W: Write>(writer: &mut W, method: &str, params: Value) -> io::Result<()> {
    write_lsp_message(
        writer,
        &json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        }),
    )
}

fn write_lsp_message<W: Write>(writer: &mut W, value: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(value)?;
    write!(writer, "Content-Length: {}\r\n\r\n", body.len())?;
    writer.write_all(&body)?;
    writer.flush()
}

fn read_lsp_message<R: BufRead>(reader: &mut R) -> Result<Value> {
    let mut content_length: Option<usize> = None;

    loop {
        let mut line = String::new();
        let read = reader.read_line(&mut line)?;
        if read == 0 {
            return Err(anyhow!("gopls LSP stream closed"));
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((name, value)) = trimmed.split_once(':') {
            if name.eq_ignore_ascii_case("content-length") {
                content_length = Some(value.trim().parse::<usize>()?);
            }
        }
    }

    let length = content_length.ok_or_else(|| anyhow!("LSP message missing Content-Length"))?;
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body)?;
    Ok(serde_json::from_slice(&body)?)
}

fn path_to_file_uri(path: &Path) -> String {
    let normalized = normalize_path_for_file_uri(&path.to_string_lossy())
        .replace('\\', "/")
        .replace(' ', "%20");
    if normalized.starts_with("//") {
        format!("file:{normalized}")
    } else {
        format!("file:///{normalized}")
    }
}

#[cfg(windows)]
fn normalize_platform_pathbuf(path: PathBuf) -> PathBuf {
    PathBuf::from(normalize_path_for_file_uri(&path.to_string_lossy()))
}

#[cfg(not(windows))]
fn normalize_platform_pathbuf(path: PathBuf) -> PathBuf {
    path
}

#[cfg(windows)]
fn normalize_path_for_file_uri(path: &str) -> String {
    if let Some(stripped) = path.strip_prefix("\\\\?\\UNC\\") {
        return format!("\\\\{stripped}");
    }
    if let Some(stripped) = path.strip_prefix("\\\\?\\") {
        return stripped.to_string();
    }
    path.to_string()
}

#[cfg(not(windows))]
fn normalize_path_for_file_uri(path: &str) -> String {
    path.to_string()
}

fn parse_lsp_completion_response(response: &Value) -> Vec<CompletionItem> {
    let Some(result) = response.get("result") else {
        return Vec::new();
    };
    if result.is_null() {
        return Vec::new();
    }

    let item_values: Vec<&Value> = if let Some(items) = result.as_array() {
        items.iter().collect()
    } else {
        result
            .get("items")
            .and_then(Value::as_array)
            .map(|items| items.iter().collect())
            .unwrap_or_default()
    };

    let mut items = Vec::new();
    for value in item_values {
        let Some(label) = value.get("label").and_then(Value::as_str) else {
            continue;
        };
        let detail = value
            .get("detail")
            .and_then(Value::as_str)
            .or_else(|| {
                value
                    .get("labelDetails")
                    .and_then(|label| label.get("description"))
                    .and_then(Value::as_str)
            })
            .map(str::to_string);
        let documentation = extract_lsp_documentation(value);
        let kind = value
            .get("kind")
            .and_then(Value::as_i64)
            .and_then(completion_kind_label)
            .map(str::to_string);
        let insert_text = extract_lsp_insert_text(value, label);
        let range = extract_lsp_completion_range(value);
        let additional_text_edits = extract_lsp_additional_text_edits(value);

        items.push(CompletionItem {
            label: label.to_string(),
            detail,
            documentation,
            kind,
            insert_text,
            range,
            additional_text_edits,
        });
    }
    items.dedup_by(|a, b| a.label == b.label && a.detail == b.detail);
    items
}

fn extract_lsp_documentation(item: &Value) -> Option<String> {
    let raw = item
        .get("documentation")
        .and_then(|documentation| {
            documentation
                .as_str()
                .or_else(|| documentation.get("value").and_then(Value::as_str))
        })?
        .trim();
    if raw.is_empty() {
        return None;
    }

    Some(summarize_completion_documentation(raw))
}

fn summarize_completion_documentation(raw: &str) -> String {
    let mut text = raw
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take_while(|line| !line.starts_with("```"))
        .collect::<Vec<_>>()
        .join(" ");
    text = text.replace(['`', '[', ']'], "");
    const MAX_SUMMARY_LEN: usize = 180;
    if text.chars().count() > MAX_SUMMARY_LEN {
        let mut truncated: String = text.chars().take(MAX_SUMMARY_LEN).collect();
        truncated.push_str("...");
        truncated
    } else {
        text
    }
}

fn extract_lsp_insert_text(item: &Value, label: &str) -> String {
    let raw = item
        .get("textEdit")
        .and_then(|edit| edit.get("newText"))
        .and_then(Value::as_str)
        .or_else(|| item.get("insertText").and_then(Value::as_str))
        .unwrap_or(label);
    if item.get("insertTextFormat").and_then(Value::as_i64) == Some(2) {
        return strip_lsp_snippet_placeholders(raw);
    }
    raw.to_string()
}

fn strip_lsp_snippet_placeholders(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0usize;
    while index < chars.len() {
        if chars[index] == '$' && chars.get(index + 1) == Some(&'{') {
            index += 2;
            while index < chars.len() && chars[index].is_ascii_digit() {
                index += 1;
            }
            if chars.get(index) == Some(&':') {
                index += 1;
            }
            while index < chars.len() && chars[index] != '}' {
                output.push(chars[index]);
                index += 1;
            }
            if chars.get(index) == Some(&'}') {
                index += 1;
            }
            continue;
        }
        if chars[index] == '$' && chars.get(index + 1).is_some_and(|ch| ch.is_ascii_digit()) {
            index += 2;
            continue;
        }
        output.push(chars[index]);
        index += 1;
    }
    output
}

fn extract_lsp_completion_range(item: &Value) -> Option<CompletionRange> {
    let range = item
        .get("textEdit")
        .and_then(|edit| edit.get("range"))
        .or_else(|| item.get("range"))?;
    lsp_range_to_completion_range(range)
}

fn extract_lsp_additional_text_edits(item: &Value) -> Vec<CompletionTextEdit> {
    item.get("additionalTextEdits")
        .and_then(Value::as_array)
        .map(|edits| {
            edits
                .iter()
                .filter_map(|edit| {
                    let range = lsp_range_to_completion_range(edit.get("range")?)?;
                    let new_text = edit.get("newText")?.as_str()?.to_string();
                    Some(CompletionTextEdit { range, new_text })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn lsp_range_to_completion_range(range: &Value) -> Option<CompletionRange> {
    let start = range.get("start")?;
    let end = range.get("end")?;
    Some(CompletionRange {
        start_line: start.get("line")?.as_u64()? as usize + 1,
        start_column: start.get("character")?.as_u64()? as usize + 1,
        end_line: end.get("line")?.as_u64()? as usize + 1,
        end_column: end.get("character")?.as_u64()? as usize + 1,
    })
}

fn completion_kind_label(kind: i64) -> Option<&'static str> {
    match kind {
        2 => Some("method"),
        3 => Some("function"),
        5 | 10 => Some("property"),
        6 => Some("variable"),
        9 => Some("module"),
        14 => Some("keyword"),
        21 => Some("constant"),
        22 => Some("type"),
        _ => None,
    }
}

fn run_gopls_completion(
    workspace_root: &str,
    location: &str,
    file_content: Option<&str>,
) -> io::Result<Output> {
    let Some(content) = file_content else {
        return run_gopls_completion_without_overlay(workspace_root, location);
    };

    let output = run_gopls_completion_with_overlay(workspace_root, location, content)?;
    if output.status.success() || !is_unsupported_modified_flag(&output.stderr) {
        return Ok(output);
    }

    run_gopls_completion_without_overlay(workspace_root, location)
}

fn run_gopls_completion_without_overlay(
    workspace_root: &str,
    location: &str,
) -> io::Result<Output> {
    std_command("gopls")
        .arg("completion")
        .arg(location)
        .current_dir(workspace_root)
        .output()
}

fn run_gopls_completion_with_overlay(
    workspace_root: &str,
    location: &str,
    file_content: &str,
) -> io::Result<Output> {
    let mut child = std_command("gopls")
        .arg("completion")
        .arg("-modified")
        .arg(location)
        .current_dir(workspace_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(file_content.as_bytes())?;
    }

    child.wait_with_output()
}

fn is_unsupported_modified_flag(stderr: &[u8]) -> bool {
    let text = String::from_utf8_lossy(stderr);
    text.contains("flag provided but not defined: -modified")
}

fn analyze_with_gopls(workspace_root: &str, relative_path: &str) -> Result<Vec<DetectedConstruct>> {
    let output = std_command("gopls")
        .arg("symbols")
        .arg(relative_path)
        .current_dir(workspace_root)
        .output();

    let output = match output {
        Ok(out) => out,
        Err(err) => {
            if err.kind() == io::ErrorKind::NotFound {
                return Ok(Vec::new());
            }
            return Err(err).context("failed to execute gopls symbols command");
        }
    };

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_gopls_symbols_output(stdout.as_bytes())
}

fn parse_gopls_symbols_output(stdout: &[u8]) -> Result<Vec<DetectedConstruct>> {
    let stdout_str = String::from_utf8_lossy(stdout);
    let mut results = Vec::new();

    // Parse gopls symbols plain text output
    // Format: "Name Kind Line:Col-Line:Col"
    // Example: "mu Variable 3:5-3:7"
    for line in stdout_str.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }

        let name = parts[0].to_string();
        let kind_str = parts[1];
        let range_str = parts[2];

        // We are interested in Variables and Fields for Mutex/WaitGroup
        if kind_str != "Variable" && kind_str != "Field" {
            continue;
        }

        if let Some(start_range) = range_str.split('-').next() {
            let pos_parts: Vec<&str> = start_range.split(':').collect();
            if pos_parts.len() == 2 {
                let line_num = pos_parts[0].parse::<usize>().unwrap_or(0);
                let col_num = pos_parts[1].parse::<usize>().unwrap_or(0);

                if line_num > 0 {
                    results.push(DetectedConstruct {
                        kind: ConstructKind::Mutex, // Dummy kind, we match by line in analyze_file
                        line: line_num,
                        column: col_num,
                        symbol: Some(name),
                        scope_key: None,
                        confidence: Confidence::Confirmed,
                        channel_operation: None,
                    });
                }
            }
        }
    }

    Ok(results)
}

fn parse_gopls_completion_output(output_bytes: &[u8]) -> Vec<CompletionItem> {
    let output = String::from_utf8_lossy(output_bytes);
    let mut items = Vec::new();

    for raw_line in output.lines() {
        let line = raw_line.trim();
        if line.is_empty()
            || line.eq_ignore_ascii_case("completion candidates:")
            || line.eq_ignore_ascii_case("no completions found")
        {
            continue;
        }

        let without_index = strip_completion_index_prefix(line);
        let (head, detail) = split_completion_line(without_index);
        if head.is_empty() {
            continue;
        }

        let label = extract_completion_label(head);
        if label.is_empty() {
            continue;
        }

        let insert_text = normalize_insert_text(label);
        let kind = infer_completion_kind(detail.as_deref());

        items.push(CompletionItem {
            label: label.to_string(),
            detail,
            documentation: None,
            kind,
            insert_text,
            range: None,
            additional_text_edits: Vec::new(),
        });
    }

    items.dedup_by(|a, b| a.label == b.label && a.detail == b.detail);
    items
}

fn strip_completion_index_prefix(line: &str) -> &str {
    let bytes = line.as_bytes();
    let mut idx = 0usize;

    while idx < bytes.len() && bytes[idx].is_ascii_whitespace() {
        idx += 1;
    }
    while idx < bytes.len() && bytes[idx].is_ascii_digit() {
        idx += 1;
    }
    if idx > 0 && idx < bytes.len() && bytes[idx] == b'.' {
        idx += 1;
        while idx < bytes.len() && bytes[idx].is_ascii_whitespace() {
            idx += 1;
        }
        return &line[idx..];
    }
    line
}

fn split_completion_line(line: &str) -> (&str, Option<String>) {
    if let Some((left, right)) = line.split_once('\t') {
        let detail = right.trim();
        return (
            left.trim(),
            if detail.is_empty() {
                None
            } else {
                Some(detail.to_string())
            },
        );
    }

    if let Some((left, right)) = split_on_multi_space(line) {
        let detail = right.trim();
        return (
            left.trim(),
            if detail.is_empty() {
                None
            } else {
                Some(detail.to_string())
            },
        );
    }

    (line.trim(), None)
}

fn split_on_multi_space(line: &str) -> Option<(&str, &str)> {
    let bytes = line.as_bytes();
    let mut i = 0usize;
    while i + 1 < bytes.len() {
        if bytes[i] == b' ' && bytes[i + 1] == b' ' {
            let left = &line[..i];
            let mut j = i + 1;
            while j < bytes.len() && bytes[j] == b' ' {
                j += 1;
            }
            let right = &line[j..];
            return Some((left, right));
        }
        i += 1;
    }
    None
}

fn extract_completion_label(head: &str) -> &str {
    if let Some((label, _)) = head.split_once(':') {
        let trimmed = label.trim();
        if !trimmed.is_empty() {
            return trimmed;
        }
    }
    head.trim()
}

fn normalize_insert_text(label: &str) -> String {
    let token = label.split(['(', ' ', '\t']).next().unwrap_or(label).trim();
    if token.is_empty() {
        label.to_string()
    } else {
        token.to_string()
    }
}

fn infer_completion_kind(detail: Option<&str>) -> Option<String> {
    let detail = detail?.trim();
    if detail.is_empty() {
        return None;
    }

    let first = detail
        .split_whitespace()
        .next()
        .map(|v| v.to_ascii_lowercase())?;
    Some(first)
}

fn parse_gopls_diagnostics_output(
    workspace_root: &str,
    relative_path: &str,
    output_bytes: &[u8],
) -> Result<Vec<FileDiagnostic>> {
    let stdout_str = String::from_utf8_lossy(output_bytes);
    let mut results = Vec::new();

    for raw_line in stdout_str.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        let Some((path_part, rest_after_path)) = split_diagnostic_path_prefix(line) else {
            continue;
        };

        if !path_matches_target(workspace_root, relative_path, path_part) {
            continue;
        }

        let Some((line_part, rest_after_line)) = rest_after_path.split_once(':') else {
            continue;
        };
        let Ok(start_line) = line_part.parse::<usize>() else {
            continue;
        };

        let (start_column, end_column, message_part) =
            if let Some((col_p, msg_p)) = rest_after_line.split_once(':') {
                if let Some((sc, ec)) = parse_column_range(col_p.trim()) {
                    (sc, ec, msg_p)
                } else {
                    // No valid column part found, treat the whole remainder as message.
                    (1, 2, rest_after_line)
                }
            } else {
                // No column part found, gopls might have output path:line: message
                (1, 2, rest_after_line)
            };

        let raw_message = message_part.trim();
        let (severity, message) = normalize_diagnostic_message(raw_message);

        results.push(FileDiagnostic {
            severity,
            message,
            source: Some("gopls".to_string()),
            code: None,
            range: DiagnosticRange {
                start_line,
                start_column,
                end_line: start_line,
                end_column,
            },
        });
    }

    Ok(results)
}

fn split_diagnostic_path_prefix(line: &str) -> Option<(&str, &str)> {
    for (idx, _) in line.rmatch_indices(':') {
        let left_token_start = line[..idx].rfind(':').map_or(0, |prev| prev + 1);
        let left_token = line[left_token_start..idx].trim();
        if !left_token.is_empty() && left_token.bytes().all(|byte| byte.is_ascii_digit()) {
            continue;
        }

        let rest = &line[idx + 1..];
        let digit_count = rest
            .bytes()
            .take_while(|byte| byte.is_ascii_digit())
            .count();
        if digit_count == 0 {
            continue;
        }

        if rest.as_bytes().get(digit_count) != Some(&b':') {
            continue;
        }

        let path_part = line[..idx].trim();
        if path_part.is_empty() {
            continue;
        }

        return Some((path_part, rest));
    }

    None
}

fn parse_column_range(column_part: &str) -> Option<(usize, usize)> {
    let column_part = column_part.trim();
    if column_part.is_empty() {
        return None;
    }

    let Some((start_col_text, end_col_text)) = column_part.split_once('-') else {
        let start_column = column_part.parse::<usize>().ok()?.max(1);
        return Some((start_column, start_column.saturating_add(1)));
    };

    let start_column = start_col_text.trim().parse::<usize>().ok()?.max(1);
    let end_column = end_col_text.trim().parse::<usize>().ok()?;
    if end_column < start_column {
        return None;
    }

    Some((start_column, end_column))
}

fn normalize_diagnostic_message(raw_message: &str) -> (DiagnosticSeverity, String) {
    if let Some(message) = raw_message.strip_prefix("warning:") {
        return (DiagnosticSeverity::Warning, message.trim().to_string());
    }

    if let Some(message) = raw_message.strip_prefix("info:") {
        return (DiagnosticSeverity::Info, message.trim().to_string());
    }

    (DiagnosticSeverity::Error, raw_message.to_string())
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn path_matches_target(workspace_root: &str, relative_target: &str, candidate_path: &str) -> bool {
    let normalized_candidate = normalize_path(candidate_path);
    let normalized_target = normalize_path(relative_target);

    // 1. Exact relative match (e.g., "main.go")
    if normalized_candidate == normalized_target {
        return true;
    }

    // 2. Relative match with prefix (e.g., "./main.go")
    if normalized_candidate == format!("./{}", normalized_target) {
        return true;
    }

    // 3. Absolute path match anchored to workspace root
    let workspace_path = Path::new(workspace_root);
    let absolute_target = workspace_path.join(relative_target);
    if let Some(abs_str) = absolute_target.to_str() {
        if normalized_candidate == normalize_path(abs_str) {
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn detects_required_concurrency_constructs() {
        let temp_dir = std::env::temp_dir().join("goide_gopls_detect_constructs_v9");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let file_path = temp_dir.join("sample.go");

        let source = r#"package main

import "sync"

func worker(ch chan int, wg *sync.WaitGroup, m *sync.Mutex) {
    defer wg.Done()
    select {
    case ch <- 1:
    default:
    }

    m.Lock()
    m.Unlock()
}
"#;

        fs::write(&file_path, source).expect("write sample");

        let results = analyze_file(&temp_dir.to_string_lossy(), "sample.go")
            .expect("analysis should succeed");

        assert!(
            results
                .iter()
                .any(|item| item.kind == ConstructKind::Channel),
            "expected channel detection"
        );
        assert!(
            results
                .iter()
                .any(|item| item.kind == ConstructKind::Select),
            "expected select detection"
        );
        assert!(
            results.iter().any(|item| item.kind == ConstructKind::Mutex),
            "expected mutex detection"
        );
        assert!(
            results
                .iter()
                .any(|item| item.kind == ConstructKind::WaitGroup),
            "expected waitgroup detection"
        );

        // Verify that confidence is Confirmed for Mutex/WaitGroup when gopls is available
        for res in &results {
            if res.kind == ConstructKind::Mutex || res.kind == ConstructKind::WaitGroup {
                if let Some(ref sym) = res.symbol {
                    if sym == "m" || sym == "wg" {
                        assert_eq!(res.confidence, Confidence::Confirmed);
                    }
                }
            }
        }
    }

    #[test]
    fn detects_sync_aliases_from_tokens() {
        let source = r#"package main
import s "sync"

func main() {
    var m s.Mutex
    var wg s.WaitGroup
}
"#;

        let tokens = tokenize_identifiers(source);
        let constructs = detect_from_tokens(tokens);

        let mutex = constructs.iter().find(|c| c.kind == ConstructKind::Mutex);
        let waitgroup = constructs
            .iter()
            .find(|c| c.kind == ConstructKind::WaitGroup);

        assert!(mutex.is_some(), "expected mutex detection for alias");
        assert!(
            matches!(mutex.unwrap().confidence, Confidence::Likely),
            "qualified alias should be marked as likely"
        );

        assert!(
            waitgroup.is_some(),
            "expected waitgroup detection for alias"
        );
        assert!(
            matches!(waitgroup.unwrap().confidence, Confidence::Likely),
            "qualified alias should be marked as likely"
        );
    }

    #[test]
    fn parses_plaintext_gopls_symbols_output() {
        let output = r#"
wg Variable 5:2-5:14
m Variable 6:2-6:10
"#;

        let constructs = parse_gopls_symbols_output(output.as_bytes()).unwrap();

        let mutex = constructs
            .iter()
            .find(|c| c.symbol == Some("m".to_string()));
        let waitgroup = constructs
            .iter()
            .find(|c| c.symbol == Some("wg".to_string()));

        assert!(mutex.is_some(), "expected mutex from plaintext symbols");
        assert_eq!(mutex.unwrap().line, 6);
        assert_eq!(mutex.unwrap().column, 2);

        assert!(
            waitgroup.is_some(),
            "expected waitgroup from plaintext symbols"
        );
        assert_eq!(waitgroup.unwrap().line, 5);
        assert_eq!(waitgroup.unwrap().column, 2);
    }

    #[test]
    fn detects_channel_flow_markers_for_send_and_receive() {
        let source = r#"package main

func worker(ch chan int, in <-chan int) {
    // comment <- not an operation
    message := "string <- not an operation"
    ch <- 1
    value := <-in
    chan<- int(nil)
    _ = value
    _ = message
}
"#;

        let constructs = detect_channel_flow_markers(source);

        assert!(
            constructs
                .iter()
                .any(|item| item.kind == ConstructKind::Channel
                    && item.symbol.as_deref() == Some("ch")
                    && item.line == 6
                    && item.channel_operation == Some(ChannelOperation::Send)),
            "expected send marker for channel symbol ch"
        );
        assert!(
            constructs
                .iter()
                .any(|item| item.kind == ConstructKind::Channel
                    && item.symbol.as_deref() == Some("in")
                    && item.line == 7
                    && item.channel_operation == Some(ChannelOperation::Receive)),
            "expected receive marker for channel symbol in"
        );
        assert!(
            constructs
                .iter()
                .all(|item| item.symbol.as_deref() != Some("chan")),
            "must not treat channel type direction as a channel symbol"
        );
        assert!(
            constructs
                .iter()
                .all(|item| item.symbol.as_deref() != Some("comment")),
            "must ignore channel arrows inside comments"
        );
        assert!(
            constructs
                .iter()
                .all(|item| item.symbol.as_deref() != Some("string")),
            "must ignore channel arrows inside strings"
        );
    }

    #[test]
    fn channel_flow_markers_include_distinct_scope_keys_for_shadowed_symbols() {
        let source = r#"package main

func first() {
    ch := make(chan int)
    ch <- 1
}

func second() {
    ch := make(chan int)
    ch <- 2
}
"#;

        let constructs = detect_channel_flow_markers(source);
        let first = constructs
            .iter()
            .find(|item| item.symbol.as_deref() == Some("ch") && item.line == 5)
            .expect("first ch marker should exist");
        let second = constructs
            .iter()
            .find(|item| item.symbol.as_deref() == Some("ch") && item.line == 10)
            .expect("second ch marker should exist");

        assert_ne!(
            first.scope_key, second.scope_key,
            "shadowed symbols across functions must have different scope keys"
        );
    }

    #[test]
    fn detects_receive_marker_in_select_case_receive_clause() {
        let source = r#"package main

func worker(jobs <-chan int) {
    select {
    case <-jobs:
    default:
    }
}
"#;

        let constructs = detect_channel_flow_markers(source);

        assert!(
            constructs.iter().any(|item| {
                item.kind == ConstructKind::Channel
                    && item.symbol.as_deref() == Some("jobs")
                    && item.channel_operation == Some(ChannelOperation::Receive)
            }),
            "expected select case receive clause to emit receive marker for jobs"
        );
        assert!(
            constructs
                .iter()
                .all(|item| item.symbol.as_deref() != Some("case")),
            "must not emit case keyword as channel symbol"
        );
    }

    #[test]
    fn does_not_treat_if_call_clause_as_function_scope() {
        let source = r#"package main

func worker(ch chan int) {
    ch <- 1
    if ok() {
        <-ch
    }
}
"#;

        let constructs = detect_channel_flow_markers(source);

        let send = constructs
            .iter()
            .find(|item| item.symbol.as_deref() == Some("ch") && item.line == 4)
            .expect("send marker should exist");
        let receive = constructs
            .iter()
            .find(|item| item.symbol.as_deref() == Some("ch") && item.line == 6)
            .expect("receive marker should exist");

        fn innermost_function_scope(scope_key: &str) -> Option<&str> {
            scope_key
                .split('>')
                .rev()
                .find(|segment| segment.starts_with('F'))
        }

        let send_scope = send.scope_key.as_deref().expect("send must have scope key");
        let receive_scope = receive
            .scope_key
            .as_deref()
            .expect("receive must have scope key");

        assert_eq!(
            innermost_function_scope(send_scope),
            innermost_function_scope(receive_scope),
            "if condition calls like ok() must not introduce a new function scope"
        );
    }

    #[test]
    fn does_not_infer_receive_for_complex_lhs_send() {
        let source = r#"package main

func worker(channels []chan int, job int) {
    channels[0] <- job
    getCh() <- job
}
"#;

        let constructs = detect_channel_flow_markers(source);

        assert!(
            constructs
                .iter()
                .all(|item| item.symbol.as_deref() != Some("job")),
            "complex-lhs sends must not be inferred as receive markers on rhs symbol"
        );
    }

    #[test]
    fn detects_standalone_receive_at_line_start() {
        let source = r#"package main

func worker(done <-chan struct{}) {
    x := 1
    <-done
    _ = x
}
"#;

        let constructs = detect_channel_flow_markers(source);

        assert!(
            constructs.iter().any(|item| {
                item.kind == ConstructKind::Channel
                    && item.symbol.as_deref() == Some("done")
                    && item.line == 5
                    && item.channel_operation == Some(ChannelOperation::Receive)
            }),
            "standalone <-done at line start must be detected as receive"
        );
    }

    #[test]
    fn merges_gopls_symbol_into_channel_declaration_construct() {
        let mut results = vec![DetectedConstruct {
            kind: ConstructKind::Channel,
            line: 3,
            column: 12, // "chan" token column in e.g. `var jobs chan int`
            symbol: None,
            scope_key: None,
            confidence: Confidence::Predicted,
            channel_operation: None,
        }];
        let gopls_results = vec![DetectedConstruct {
            kind: ConstructKind::Mutex, // dummy kind for parsed gopls symbol entry
            line: 3,
            column: 5, // identifier `jobs` appears before `chan`
            symbol: Some("jobs".to_string()),
            scope_key: None,
            confidence: Confidence::Confirmed,
            channel_operation: None,
        }];

        merge_gopls_constructs(&mut results, gopls_results);

        assert_eq!(
            results.len(),
            1,
            "must upgrade in place rather than duplicate"
        );
        assert_eq!(results[0].symbol.as_deref(), Some("jobs"));
        assert_eq!(results[0].confidence, Confidence::Confirmed);
    }

    #[test]
    fn does_not_merge_gopls_symbol_into_channel_flow_marker() {
        let mut results = vec![DetectedConstruct {
            kind: ConstructKind::Channel,
            line: 6,
            column: 5,
            symbol: Some("ch".to_string()),
            scope_key: Some("F1>B2".to_string()),
            confidence: Confidence::Predicted,
            channel_operation: Some(ChannelOperation::Send),
        }];
        let gopls_results = vec![DetectedConstruct {
            kind: ConstructKind::Mutex, // dummy kind for parsed gopls symbol entry
            line: 6,
            column: 2,
            symbol: Some("other".to_string()),
            scope_key: None,
            confidence: Confidence::Confirmed,
            channel_operation: None,
        }];

        merge_gopls_constructs(&mut results, gopls_results);

        assert_eq!(results[0].symbol.as_deref(), Some("ch"));
        assert_eq!(results[0].confidence, Confidence::Predicted);
    }

    #[test]
    fn parses_gopls_check_diagnostics_output_with_severity_and_range() {
        let output = r#"
main.go:3:2-7: undeclared name: foo
main.go:8:1: warning: unreachable code
main.go:10: error message without column
"#;

        let diagnostics = parse_gopls_diagnostics_output(".", "main.go", output.as_bytes())
            .expect("parse diagnostics");

        assert_eq!(diagnostics.len(), 3);
        assert_eq!(diagnostics[0].range.start_line, 3);
        assert_eq!(diagnostics[0].range.start_column, 2);
        assert_eq!(diagnostics[0].range.end_line, 3);
        assert_eq!(diagnostics[0].range.end_column, 7);
        assert_eq!(diagnostics[0].message, "undeclared name: foo");
        assert_eq!(diagnostics[0].severity, DiagnosticSeverity::Error);

        assert_eq!(diagnostics[1].range.start_line, 8);
        assert_eq!(diagnostics[1].range.start_column, 1);
        assert_eq!(diagnostics[1].message, "unreachable code");
        assert_eq!(diagnostics[1].severity, DiagnosticSeverity::Warning);

        assert_eq!(diagnostics[2].range.start_line, 10);
        assert_eq!(diagnostics[2].range.start_column, 1);
        assert_eq!(diagnostics[2].message, "error message without column");
    }

    #[test]
    fn parses_gopls_check_diagnostics_output_with_windows_absolute_paths() {
        let output = r#"
C:/workspace/main.go:12:3: undeclared name: foo
"#;

        let diagnostics =
            parse_gopls_diagnostics_output("C:/workspace", "main.go", output.as_bytes())
                .expect("parse diagnostics");

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].range.start_line, 12);
        assert_eq!(diagnostics[0].range.start_column, 3);
        assert_eq!(diagnostics[0].message, "undeclared name: foo");
        assert_eq!(diagnostics[0].severity, DiagnosticSeverity::Error);
    }

    #[test]
    fn preserves_message_when_column_is_omitted_and_message_contains_colon() {
        let output = r#"
main.go:14: syntax error: unexpected semicolon, expected expression
"#;

        let diagnostics = parse_gopls_diagnostics_output(".", "main.go", output.as_bytes())
            .expect("parse diagnostics");

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].range.start_line, 14);
        assert_eq!(diagnostics[0].range.start_column, 1);
        assert_eq!(diagnostics[0].range.end_column, 2);
        assert_eq!(
            diagnostics[0].message,
            "syntax error: unexpected semicolon, expected expression"
        );
    }

    #[test]
    fn rejects_basename_collisions_in_subdirectories() {
        let output = r#"
main.go:3:1: error in root
subdir/main.go:3:1: error in subdir
"#;

        let diagnostics = parse_gopls_diagnostics_output("/root", "main.go", output.as_bytes())
            .expect("parse diagnostics");

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].message, "error in root");
    }

    #[test]
    fn handles_absolute_path_matches_correctly() {
        let output = r#"
/root/main.go:3:1: error in root
/other/main.go:3:1: error in other
"#;

        let diagnostics = parse_gopls_diagnostics_output("/root", "main.go", output.as_bytes())
            .expect("parse diagnostics");

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].message, "error in root");
    }

    #[test]
    fn collects_diagnostics_from_mixed_stdout_and_stderr_streams() {
        let stdout = b"main.go:4:2: undeclared name: foo\n";
        let stderr = b"main.go:9:1: warning: unreachable code\n";

        let diagnostics = collect_gopls_diagnostics_from_streams(".", "main.go", stdout, stderr)
            .expect("collect mixed diagnostics");

        assert_eq!(diagnostics.len(), 2);
        assert_eq!(diagnostics[0].message, "undeclared name: foo");
        assert_eq!(diagnostics[1].message, "unreachable code");
        assert_eq!(diagnostics[1].severity, DiagnosticSeverity::Warning);
    }

    #[test]
    fn diagnostics_result_explicitly_represents_missing_tooling() {
        let result = FileDiagnosticsResult {
            diagnostics: Vec::new(),
            tooling_availability: DiagnosticsToolingAvailability::Unavailable,
        };

        assert_eq!(
            result.tooling_availability,
            DiagnosticsToolingAvailability::Unavailable
        );
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn diagnostics_returns_error_for_missing_workspace_directory() {
        let missing_workspace = "./this-path-should-not-exist-for-diagnostics-test";
        let result = analyze_file_diagnostics(missing_workspace, "main.go");

        assert!(result.is_err());
        let error_text = result
            .expect_err("missing workspace should return an error")
            .to_string();
        assert!(error_text.contains("workspace root does not exist"));
    }

    #[test]
    fn parses_gopls_completion_output_with_tab_separated_detail() {
        let output = r#"
completion candidates:
1. Println	func(a ...any) (n int, err error)
2. Printf	func(format string, a ...any) (n int, err error)
"#;

        let items = parse_gopls_completion_output(output.as_bytes());
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].label, "Println");
        assert_eq!(items[0].insert_text, "Println");
        assert_eq!(
            items[0].detail.as_deref(),
            Some("func(a ...any) (n int, err error)")
        );
        assert_eq!(items[0].kind.as_deref(), Some("func(a"));
    }

    #[test]
    fn parses_gopls_completion_output_with_multi_space_detail() {
        let output = r#"
1. mutex   var mutex sync.Mutex
"#;

        let items = parse_gopls_completion_output(output.as_bytes());
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].label, "mutex");
        assert_eq!(items[0].insert_text, "mutex");
        assert_eq!(items[0].detail.as_deref(), Some("var mutex sync.Mutex"));
        assert_eq!(items[0].kind.as_deref(), Some("var"));
    }

    #[test]
    fn deduplicates_completion_candidates_by_label_and_detail() {
        let output = r#"
1. Println	func(a ...any) (n int, err error)
2. Println	func(a ...any) (n int, err error)
"#;

        let items = parse_gopls_completion_output(output.as_bytes());
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].label, "Println");
    }

    #[test]
    fn parses_lsp_completion_list_response() {
        let response = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "result": {
                "isIncomplete": false,
                "items": [
                    {
                        "label": "Println",
                        "kind": 3,
                        "detail": "func(a ...any) (n int, err error)",
                        "documentation": {
                            "kind": "markdown",
                            "value": "Println formats using the default formats and writes to standard output.\n\nMore details."
                        },
                        "textEdit": {
                            "range": {
                                "start": { "line": 3, "character": 4 },
                                "end": { "line": 3, "character": 8 }
                            },
                            "newText": "Println"
                        },
                        "additionalTextEdits": [
                            {
                                "range": {
                                    "start": { "line": 1, "character": 0 },
                                    "end": { "line": 1, "character": 0 }
                                },
                                "newText": "import \"fmt\"\n"
                            }
                        ]
                    }
                ]
            }
        });

        let items = parse_lsp_completion_response(&response);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].label, "Println");
        assert_eq!(items[0].kind.as_deref(), Some("function"));
        assert_eq!(items[0].insert_text, "Println");
        assert_eq!(
            items[0].documentation.as_deref(),
            Some("Println formats using the default formats and writes to standard output. More details.")
        );
        assert_eq!(
            items[0].range,
            Some(CompletionRange {
                start_line: 4,
                start_column: 5,
                end_line: 4,
                end_column: 9,
            })
        );
        assert_eq!(
            items[0].additional_text_edits,
            vec![CompletionTextEdit {
                range: CompletionRange {
                    start_line: 2,
                    start_column: 1,
                    end_line: 2,
                    end_column: 1,
                },
                new_text: "import \"fmt\"\n".to_string(),
            }]
        );
    }

    #[test]
    fn parses_lsp_completion_label_details_and_ignores_empty_docs() {
        let response = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "result": {
                "isIncomplete": false,
                "items": [
                    {
                        "label": "fmt",
                        "kind": 9,
                        "labelDetails": {
                            "description": "package"
                        },
                        "documentation": {
                            "kind": "markdown",
                            "value": "   "
                        }
                    }
                ]
            }
        });

        let items = parse_lsp_completion_response(&response);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].label, "fmt");
        assert_eq!(items[0].detail.as_deref(), Some("package"));
        assert_eq!(items[0].documentation, None);
    }

    #[test]
    fn summarizes_completion_documentation_without_code_blocks() {
        let summary = summarize_completion_documentation(
            "Println writes to standard output.\n\n```go\nfmt.Println(\"x\")\n```\nTrailing",
        );
        assert_eq!(summary, "Println writes to standard output.");
    }

    #[test]
    fn strips_lsp_snippet_placeholders() {
        assert_eq!(
            strip_lsp_snippet_placeholders("Printf(${1:format}, ${2:a})$0"),
            "Printf(format, a)"
        );
    }

    #[test]
    #[ignore = "requires unsandboxed gopls workspace access"]
    fn gets_completions_from_gopls_lsp_when_available() {
        if std_command("gopls").arg("version").output().is_err() {
            return;
        }

        let temp_dir = std::env::current_dir()
            .expect("current test directory")
            .join("target")
            .join("goide_gopls_lsp_completion");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).expect("create temp workspace");
        fs::write(
            temp_dir.join("go.mod"),
            "module example.com/goide-test\n\ngo 1.21\n",
        )
        .expect("write go.mod");
        let source = r#"package main

import "fmt"

func main() {
    fmt.
}
"#;
        fs::write(temp_dir.join("main.go"), source).expect("write go file");

        let items = get_file_completions(
            &temp_dir.to_string_lossy(),
            "main.go",
            6,
            9,
            None,
            Some(source),
        )
        .expect("completion request");

        assert!(
            items
                .iter()
                .any(|item| item.label == "Println" || item.label == "Printf"),
            "expected fmt.Print* completion from gopls, got: {items:?}"
        );
    }
}
