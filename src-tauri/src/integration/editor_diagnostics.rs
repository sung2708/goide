//! Diagnostics for exact unsaved buffers over the existing owned gopls session.
use super::{gopls::{DiagnosticRange, DiagnosticSeverity, FileDiagnostic, FileDiagnosticsResult, DiagnosticsToolingAvailability}, language, lsp_manager};
use anyhow::{anyhow, Result};
use serde_json::{json, Value};

pub fn diagnostics(request: language::Query) -> Result<FileDiagnosticsResult> {
    language::with_documents(request, |_root, session, target, _content| {
        if !session.supports_pull_diagnostics {
            return Ok(FileDiagnosticsResult { diagnostics: Vec::new(), tooling_availability: DiagnosticsToolingAvailability::Unavailable });
        }
        let result = language::request_method(session, "textDocument/diagnostic", json!({"textDocument": {"uri": lsp_manager::path_to_file_uri(target)?}}))?;
        Ok(FileDiagnosticsResult { diagnostics: parse_report(&result)?, tooling_availability: DiagnosticsToolingAvailability::Available })
    })
}

fn parse_report(report: &Value) -> Result<Vec<FileDiagnostic>> {
    let items = report.get("items").and_then(Value::as_array).ok_or_else(|| anyhow!("gopls did not return a full diagnostic report"))?;
    items.iter().take(2000).map(|item| {
        let position = |side: &str, key: &str| -> Result<usize> { item.get("range").and_then(|range| range.get(side)).and_then(|position| position.get(key)).and_then(Value::as_u64).and_then(|value| usize::try_from(value).ok()).and_then(|value| value.checked_add(1)).ok_or_else(|| anyhow!("Invalid gopls diagnostic range")) };
        Ok(FileDiagnostic {
            severity: match item.get("severity").and_then(Value::as_u64).unwrap_or(1) { 2 => DiagnosticSeverity::Warning, 3 => DiagnosticSeverity::Info, 4 => DiagnosticSeverity::Hint, _ => DiagnosticSeverity::Error },
            message: item.get("message").and_then(Value::as_str).ok_or_else(|| anyhow!("Invalid gopls diagnostic message"))?.to_string(),
            source: item.get("source").and_then(Value::as_str).map(str::to_string),
            code: item.get("code").filter(|value| !value.is_null()).map(|value| value.as_str().map(str::to_string).unwrap_or_else(|| value.to_string())),
            range: DiagnosticRange { start_line: position("start", "line")?, start_column: position("start", "character")?, end_line: position("end", "line")?, end_column: position("end", "character")? },
        })
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_utf16_ranges_severity_source_and_code() {
        let report = json!({"kind":"full", "items":[{"range":{"start":{"line":2,"character":12},"end":{"line":2,"character":16}},"severity":4,"source":"compiler","code":42,"message":"after tiếng Việt 👋"}]});
        let items = parse_report(&report).unwrap();
        assert_eq!(items[0].range.start_column, 13);
        assert_eq!(items[0].range.end_column, 17);
        assert_eq!(items[0].severity, DiagnosticSeverity::Hint);
        assert_eq!(items[0].code.as_deref(), Some("42"));
        assert_eq!(items[0].source.as_deref(), Some("compiler"));
        assert!(parse_report(&json!({"kind":"unchanged"})).is_err());
    }
    #[test]
    #[ignore = "requires installed Go and gopls; run explicitly with --include-ignored"]
    fn real_gopls_reports_unsaved_unicode_errors_and_clears_after_fix() {
        let root = std::env::current_dir().unwrap().join("target").join(format!("goro diagnostics tiếng Việt {}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("go.mod"), "module example.com/diagnostics\n\ngo 1.21\n").unwrap();
        let clean = "package main\nfunc main() {\n    _ = \"tiếng Việt 👋\"\n}\n";
        std::fs::write(root.join("main.go"), clean).unwrap();
        let request = |content: &str| language::Query { request_id: None, workspace_root: root.to_string_lossy().into_owned(), relative_path: "main.go".into(), line: 1, column: 1, kind: language::QueryKind::Hover, buffers: vec![language::Buffer { path: "main.go".into(), content: content.into() }] };
        let broken = "package main\nfunc main() {\n    _ = \"tiếng Việt 👋\"; unknownName()\n}\n";
        let result = diagnostics(request(broken)).expect("real gopls unsaved diagnostics");
        let diagnostic = result.diagnostics.iter().find(|item| item.message.contains("unknownName")).expect("undefined identifier diagnostic");
        assert_eq!(diagnostic.range.start_line, 3);
        assert_eq!(diagnostic.range.start_column, "    _ = \"tiếng Việt 👋\"; ".encode_utf16().count() + 1);
        assert!(diagnostics(request(clean)).unwrap().diagnostics.is_empty());
        assert_eq!(std::fs::read_to_string(root.join("main.go")).unwrap(), clean, "diagnostic requests must never save buffers");
        let handle = lsp_manager::get_lsp_session(); handle.lock().unwrap().take();
        std::fs::remove_dir_all(root).unwrap();
    }
}
