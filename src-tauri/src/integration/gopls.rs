use anyhow::{Context, Result};
use serde::Deserialize;
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

pub fn analyze_file(workspace_root: &str, relative_path: &str) -> Result<Vec<DetectedConstruct>> {
    let source = fs::read_file(workspace_root, relative_path)?;
    let tokens = tokenize_identifiers(&source);

    let mut results = detect_from_tokens(tokens);

    if let Ok(gopls_results) = analyze_with_gopls(workspace_root, relative_path) {
        for gopls_construct in gopls_results {
            if let Some(existing) = results.iter_mut().find(|item| {
                item.kind == gopls_construct.kind
                    && item.line == gopls_construct.line
                    && item.column == gopls_construct.column
            }) {
                existing.confidence = Confidence::Confirmed;
                if existing.symbol.is_none() {
                    existing.symbol = gopls_construct.symbol.clone();
                }
            } else {
                results.push(gopls_construct);
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
            "Mutex" | "sync.Mutex" => results.push(DetectedConstruct {
                kind: ConstructKind::Mutex,
                line: token.line,
                column: token.column,
                symbol: Some("sync.Mutex".to_string()),
                confidence: if token.text.starts_with("sync.") {
                    Confidence::Likely
                } else {
                    Confidence::Predicted
                },
            }),
            "WaitGroup" | "sync.WaitGroup" => results.push(DetectedConstruct {
                kind: ConstructKind::WaitGroup,
                line: token.line,
                column: token.column,
                symbol: Some("sync.WaitGroup".to_string()),
                confidence: if token.text.starts_with("sync.") {
                    Confidence::Likely
                } else {
                    Confidence::Predicted
                },
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

#[derive(Debug, Deserialize)]
struct GoplsSymbol {
    name: String,
    #[serde(default)]
    range: Option<GoplsRange>,
    #[serde(default, rename = "selectionRange")]
    selection_range: Option<GoplsRange>,
}

#[derive(Debug, Deserialize)]
struct GoplsRange {
    start: GoplsPosition,
}

#[derive(Debug, Deserialize)]
struct GoplsPosition {
    line: u32,
    character: u32,
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

    let parsed: Vec<GoplsSymbol> = serde_json::from_slice(&output.stdout).unwrap_or_default();

    let mut results = Vec::new();
    for symbol in parsed {
        let range = symbol
            .selection_range
            .as_ref()
            .or(symbol.range.as_ref())
            .map(|r| &r.start);

        let position = match range {
            Some(pos) => pos,
            None => continue,
        };

        let (line, column) = (
            position.line.saturating_add(1) as usize,
            position.character.saturating_add(1) as usize,
        );

        match symbol.name.as_str() {
            "Mutex" | "sync.Mutex" => results.push(DetectedConstruct {
                kind: ConstructKind::Mutex,
                line,
                column,
                symbol: Some("sync.Mutex".to_string()),
                confidence: Confidence::Confirmed,
            }),
            "WaitGroup" | "sync.WaitGroup" => results.push(DetectedConstruct {
                kind: ConstructKind::WaitGroup,
                line,
                column,
                symbol: Some("sync.WaitGroup".to_string()),
                confidence: Confidence::Confirmed,
            }),
            _ => {}
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
        let temp_dir = std::env::temp_dir().join("goide_gopls_detect_constructs");
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
    }
}
