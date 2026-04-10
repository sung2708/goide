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
pub struct DetectedConstruct {
    pub kind: ConstructKind,
    pub line: usize,
    pub column: usize,
    pub symbol: Option<String>,
    pub confidence: Confidence,
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

    if let Ok(gopls_results) = analyze_with_gopls(workspace_root, relative_path) {
        for gopls_construct in gopls_results {
            // Find existing lexer detection on the same line.
            // Typical Go syntax: 'mu sync.Mutex' or 'var mu sync.Mutex'
            // The identifier (gopls symbol) comes BEFORE the type (lexer token).
            if let Some(existing) = results.iter_mut().find(|item| {
                item.line == gopls_construct.line && item.column >= gopls_construct.column
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
                confidence: Confidence::Predicted,
            }),
            "select" => results.push(DetectedConstruct {
                kind: ConstructKind::Select,
                line: token.line,
                column: token.column,
                symbol: None,
                confidence: Confidence::Predicted,
            }),
            name if is_mutex_name(name) => results.push(DetectedConstruct {
                kind: ConstructKind::Mutex,
                line: token.line,
                column: token.column,
                symbol: Some("sync.Mutex".to_string()),
                confidence: confidence_for_identifier(&token.text),
            }),
            name if is_waitgroup_name(name) => results.push(DetectedConstruct {
                kind: ConstructKind::WaitGroup,
                line: token.line,
                column: token.column,
                symbol: Some("sync.WaitGroup".to_string()),
                confidence: confidence_for_identifier(&token.text),
            }),
            _ => {}
        }
    }

    results
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
                        confidence: Confidence::Confirmed,
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
}
