use anyhow::{Context, Result};
use std::io;
use std::process::Command;

use crate::integration::fs;

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
        for gopls_construct in gopls_results {
            // Find existing lexer detection on the same line.
            // Typical Go syntax: 'mu sync.Mutex' or 'var mu sync.Mutex'
            // The identifier (gopls symbol) comes BEFORE the type (lexer token).
            if let Some(existing) = results.iter_mut().find(|item| {
                item.kind != ConstructKind::Channel
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

    results.sort_by(|a, b| {
        a.line
            .cmp(&b.line)
            .then_with(|| a.column.cmp(&b.column))
            .then_with(|| a.kind_name().cmp(b.kind_name()))
            .then_with(|| a.symbol.as_deref().unwrap_or("").cmp(b.symbol.as_deref().unwrap_or("")))
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

fn scan_left_identifier(chars: &[char], line_start: usize, op_start: usize) -> Option<(usize, String)> {
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
    matches!(text, "case" | "return" | "go" | "defer" | "if" | "for" | "switch" | "select")
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
                                Some('=') | Some(':') | Some('(') | Some(',') | Some('{') | Some('[')
                            )
                        || left.is_none()
                            && is_first_non_whitespace_on_line(&chars, line_start, i);

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

fn analyze_with_gopls(workspace_root: &str, relative_path: &str) -> Result<Vec<DetectedConstruct>> {
    let output = Command::new("gopls")
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

        let mutex = constructs.iter().find(|c| c.symbol == Some("m".to_string()));
        let waitgroup = constructs.iter().find(|c| c.symbol == Some("wg".to_string()));

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
            constructs.iter().all(|item| item.symbol.as_deref() != Some("chan")),
            "must not treat channel type direction as a channel symbol"
        );
        assert!(
            constructs.iter().all(|item| item.symbol.as_deref() != Some("comment")),
            "must ignore channel arrows inside comments"
        );
        assert!(
            constructs.iter().all(|item| item.symbol.as_deref() != Some("string")),
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
            constructs.iter().all(|item| item.symbol.as_deref() != Some("case")),
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
            scope_key.split('>').rev().find(|segment| segment.starts_with('F'))
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
            constructs.iter().all(|item| item.symbol.as_deref() != Some("job")),
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
}
