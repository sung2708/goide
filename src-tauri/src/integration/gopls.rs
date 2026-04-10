use anyhow::{Context, Result};
use std::collections::HashSet;
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

fn is_mutex_name(text: &str, sync_aliases: &HashSet<String>) -> bool {
    text == "Mutex" || has_allowed_qualified_suffix(text, "Mutex", sync_aliases)
}

fn is_waitgroup_name(text: &str, sync_aliases: &HashSet<String>) -> bool {
    text == "WaitGroup" || has_allowed_qualified_suffix(text, "WaitGroup", sync_aliases)
}

fn has_allowed_qualified_suffix(text: &str, suffix: &str, sync_aliases: &HashSet<String>) -> bool {
    let (qualifier, found_suffix) = match text.rsplit_once('.') {
        Some(parts) => parts,
        None => return false,
    };

    found_suffix == suffix && sync_aliases.contains(qualifier)
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
    let sync_aliases = parse_sync_aliases(&source);

    let mut results = detect_from_tokens(tokens, &sync_aliases);

    if let Ok(gopls_results) = analyze_with_gopls(workspace_root, relative_path) {
        merge_gopls_results(&mut results, gopls_results);
    }

    Ok(results)
}

fn detect_from_tokens(
    tokens: Vec<WordToken>,
    sync_aliases: &HashSet<String>,
) -> Vec<DetectedConstruct> {
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
            name if is_mutex_name(name, sync_aliases) => results.push(DetectedConstruct {
                kind: ConstructKind::Mutex,
                line: token.line,
                column: token.column,
                symbol: Some("sync.Mutex".to_string()),
                confidence: confidence_for_identifier(&token.text),
            }),
            name if is_waitgroup_name(name, sync_aliases) => results.push(DetectedConstruct {
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

fn parse_sync_aliases(source: &str) -> HashSet<String> {
    let mut aliases = HashSet::from([String::from("sync")]);

    for line in source.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        if let Some(import_path_start) = trimmed.find("\"sync\"") {
            let before = trimmed[..import_path_start].trim();
            if before == "import" {
                aliases.insert(String::from("sync"));
                continue;
            }

            if let Some(alias) = before.strip_prefix("import ") {
                let alias = alias.trim();
                if !alias.is_empty() && alias != "_" && alias != "." {
                    aliases.insert(alias.to_string());
                }
            }
        }
    }

    aliases
}

fn merge_gopls_results(results: &mut [DetectedConstruct], gopls_results: Vec<DetectedConstruct>) {
    for gopls_construct in gopls_results {
        if let Some(existing) = results
            .iter_mut()
            .filter(|item| {
                item.line == gopls_construct.line
                    && item.column >= gopls_construct.column
                    && item.kind != ConstructKind::Channel
                    && item.kind != ConstructKind::Select
            })
            .min_by_key(|item| item.column.saturating_sub(gopls_construct.column))
        {
            existing.confidence = Confidence::Confirmed;
            existing.symbol = gopls_construct.symbol.clone();
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
    let mut results = Vec::new();

    // Parse gopls symbols plain text output
    // Format: "Name Kind Line:Col-Line:Col"
    // Example: "mu Variable 3:5-3:7"
    for line in stdout.lines() {
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
        let temp_dir = std::env::temp_dir().join("goide_gopls_detect_constructs_v3");
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
        let aliases = parse_sync_aliases(source);
        let constructs = detect_from_tokens(tokens, &aliases);

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
    fn does_not_detect_non_sync_qualified_mutex_or_waitgroup() {
        let source = r#"package main
import "custom"

func main() {
    var m custom.Mutex
    var wg custom.WaitGroup
}
"#;

        let tokens = tokenize_identifiers(source);
        let aliases = parse_sync_aliases(source);
        let constructs = detect_from_tokens(tokens, &aliases);

        assert!(
            !constructs.iter().any(|c| c.kind == ConstructKind::Mutex),
            "custom.Mutex must not be treated as sync.Mutex"
        );
        assert!(
            !constructs
                .iter()
                .any(|c| c.kind == ConstructKind::WaitGroup),
            "custom.WaitGroup must not be treated as sync.WaitGroup"
        );
    }

    #[test]
    fn merge_gopls_results_only_confirms_mutex_and_waitgroup() {
        let mut results = vec![
            DetectedConstruct {
                kind: ConstructKind::Channel,
                line: 5,
                column: 16,
                symbol: None,
                confidence: Confidence::Predicted,
            },
            DetectedConstruct {
                kind: ConstructKind::WaitGroup,
                line: 5,
                column: 30,
                symbol: Some("sync.WaitGroup".to_string()),
                confidence: Confidence::Likely,
            },
        ];

        let gopls_results = vec![DetectedConstruct {
            kind: ConstructKind::Mutex,
            line: 5,
            column: 10,
            symbol: Some("wg".to_string()),
            confidence: Confidence::Confirmed,
        }];

        merge_gopls_results(&mut results, gopls_results);

        assert_eq!(results[0].confidence, Confidence::Predicted);
        assert_eq!(results[0].symbol, None);
        assert_eq!(results[1].confidence, Confidence::Confirmed);
        assert_eq!(results[1].symbol.as_deref(), Some("wg"));
    }
}
