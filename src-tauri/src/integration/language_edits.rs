//! Reviewed language edits never write disk or clear dirty editor baselines.
use super::{fs, language, lsp_manager};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatRequest {
    pub workspace_root: String,
    pub relative_path: String,
    pub buffers: Vec<language::Buffer>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEdit {
    pub path: String,
    pub before: String,
    pub after: String,
    pub read_only: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditPlan {
    pub files: Vec<FileEdit>,
}

pub fn format(request: FormatRequest) -> Result<EditPlan> {
    let path = request.relative_path.clone();
    let query = language::Query {
        workspace_root: request.workspace_root,
        relative_path: request.relative_path,
        line: 1,
        column: 1,
        kind: language::QueryKind::Hover,
        buffers: request.buffers,
    };
    language::with_documents(query, |root, session, target, before| {
        let info = fs::file_info(&root.to_string_lossy(), &path)?;
        if info.read_only {
            return Err(anyhow!("Cannot format a read-only file."));
        }
        let result = language::request_method(
            session,
            "textDocument/formatting",
            json!({ "textDocument": { "uri": lsp_manager::path_to_file_uri(target)? }, "options": { "tabSize": 4, "insertSpaces": false } }),
        )?;
        let after = apply_text_edits(before, &result)?;
        Ok(EditPlan {
            files: if after == before {
                Vec::new()
            } else {
                vec![FileEdit {
                    path: path.replace('\\', "/"),
                    before: before.to_string(),
                    after,
                    read_only: info.read_only,
                }]
            },
        })
    })
}

fn offset(text: &str, position: &Value) -> Result<usize> {
    let line = position["line"]
        .as_u64()
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| anyhow!("Invalid LSP edit line."))?;
    let column = position["character"]
        .as_u64()
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| anyhow!("Invalid LSP edit column."))?;
    let content = text
        .split('\n')
        .nth(line)
        .ok_or_else(|| anyhow!("LSP edit line is outside the document."))?
        .trim_end_matches('\r');
    let start: usize = text.split_inclusive('\n').take(line).map(str::len).sum();
    let mut character = 0;
    for (byte, scalar) in content.char_indices() {
        if character == column {
            return Ok(start + byte);
        }
        character += scalar.len_utf16();
    }
    if character == column {
        return Ok(start + content.len());
    }
    Err(anyhow!(
        "LSP edit column is outside the document or splits a Unicode character."
    ))
}

pub fn apply_text_edits(before: &str, result: &Value) -> Result<String> {
    let values = result
        .as_array()
        .ok_or_else(|| anyhow!("Language server returned an invalid edit list."))?;
    if values.len() > 10_000 {
        return Err(anyhow!("Language edit exceeds 10000 edits."));
    }
    let mut edits = Vec::new();
    for value in values {
        let from = offset(before, &value["range"]["start"])?;
        let to = offset(before, &value["range"]["end"])?;
        let insert = value["newText"]
            .as_str()
            .ok_or_else(|| anyhow!("Language edit text is invalid."))?;
        if from > to {
            return Err(anyhow!("Language edit range is reversed."));
        }
        edits.push((from, to, insert));
    }
    edits.sort_by_key(|edit| (edit.0, edit.1));
    for pair in edits.windows(2) {
        if pair[1].0 < pair[0].1 || pair[0].0 == pair[1].0 {
            return Err(anyhow!(
                "Language edit ranges overlap or have ambiguous insert order."
            ));
        }
    }
    let mut after = before.to_string();
    for (from, to, insert) in edits.into_iter().rev() {
        if after.len() - (to - from) + insert.len() > 4 * 1024 * 1024 {
            return Err(anyhow!("Language edit result exceeds 4 MiB."));
        }
        after.replace_range(from..to, insert);
    }
    Ok(after)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn edit(
        start_line: usize,
        start_column: usize,
        end_line: usize,
        end_column: usize,
        text: &str,
    ) -> Value {
        json!({ "range": { "start": { "line": start_line, "character": start_column }, "end": { "line": end_line, "character": end_column } }, "newText": text })
    }
    #[test]
    fn edits_use_utf16_and_preserve_untouched_crlf_with_unordered_ranges() {
        let before = "😀x\r\nabc\n";
        let after = apply_text_edits(
            before,
            &json!([edit(1, 1, 1, 2, "B"), edit(0, 2, 0, 3, "A")]),
        )
        .unwrap();
        assert_eq!(after, "😀A\r\naBc\n");
        assert_eq!(apply_text_edits(before, &json!([])).unwrap(), before);
    }
    #[test]
    fn invalid_or_overlapping_edits_never_produce_a_partial_result() {
        for values in [
            json!([edit(0, 1, 0, 2, "x")]),
            json!([edit(20, 0, 20, 1, "x")]),
            json!([edit(0, 3, 0, 2, "x")]),
            json!([edit(1, 0, 1, 2, "x"), edit(1, 1, 1, 3, "y")]),
            json!([edit(1, 0, 1, 0, "x"), edit(1, 0, 1, 0, "y")]),
        ] {
            assert!(apply_text_edits("😀x\r\nabc", &values).is_err());
        }
        assert!(apply_text_edits("text", &Value::Null).is_err());
    }
    #[test]
    #[ignore = "requires installed Go and gopls; run explicitly with --include-ignored"]
    fn real_gopls_formats_unsaved_text_without_writing_disk() {
        let root = std::env::temp_dir().join(format!(
            "goide-format # tiếng Việt {}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&root).unwrap();
        std::fs::write(
            root.join("go.mod"),
            "module example.com/format\n\ngo 1.22\n",
        )
        .unwrap();
        let disk = "package main\nfunc main() {}\n";
        std::fs::write(root.join("main.go"), disk).unwrap();
        let before = "package main\nfunc main( ){println(\"😀\")}\n";
        let result = format(FormatRequest {
            workspace_root: root.to_string_lossy().to_string(),
            relative_path: "main.go".into(),
            buffers: vec![language::Buffer {
                path: "main.go".into(),
                content: before.into(),
            }],
        });
        assert_eq!(std::fs::read_to_string(root.join("main.go")).unwrap(), disk);
        {
            let handle = lsp_manager::get_lsp_session();
            handle.lock().unwrap().take();
        }
        std::fs::remove_file(root.join("main.go")).unwrap();
        std::fs::remove_file(root.join("go.mod")).unwrap();
        std::fs::remove_dir(root).unwrap();
        let plan = result.unwrap();
        assert_eq!(plan.files.len(), 1);
        assert_eq!(plan.files[0].before, before);
        assert!(plan.files[0]
            .after
            .contains("func main() { println(\"😀\") }"));
    }
}
