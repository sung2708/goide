use super::{
    history::{history_page, parse_records, HistoryPage},
    runner,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchField {
    Message,
    Author,
    Hash,
    File,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub field: SearchField,
    pub text: String,
    pub offset: usize,
    pub tips: Vec<String>,
}

pub fn search(root: &Path, request: SearchRequest) -> Result<HistoryPage, String> {
    let is_file = matches!(request.field, SearchField::File);
    let text = if is_file {
        request.text.as_str()
    } else {
        request.text.trim()
    };
    if text.is_empty()
        || text.len() > if is_file { 4096 } else { 512 }
        || text.contains('\0')
        || (!is_file && text.contains(['\n', '\r']))
        || request.offset > 10000
    {
        return Err(
            "Search requires non-empty text, at most 512 bytes (4096 for file paths), no NUL, and a bounded result offset. Message/author/hash searches require one line."
                .into(),
        );
    }
    if is_file {
        super::validate_path(text)?;
        if text
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        {
            return Err("File history requires one exact repository-relative file path.".into());
        }
    }
    if matches!(request.field, SearchField::Hash)
        && (!(7..=64).contains(&text.len()) || !text.bytes().all(|byte| byte.is_ascii_hexdigit()))
    {
        return Err("Commit hash search requires 7–64 hexadecimal characters.".into());
    }
    let mut tips = request.tips;
    if tips.len() > 256
        || tips.iter().any(|hash| {
            !matches!(hash.len(), 40 | 64) || !hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
    {
        return Err("History search scope requires at most 256 full commit object IDs.".into());
    }
    if tips.is_empty() {
        tips = history_page(root, 0, vec![])?.tips;
    }
    tips.sort();
    tips.dedup();
    if tips.is_empty() {
        return Ok(HistoryPage {
            commits: vec![],
            tips,
            has_more: false,
        });
    }
    let skip = format!("--skip={}", request.offset);
    let filter = match request.field {
        SearchField::Message => format!("--grep={text}"),
        SearchField::Author => format!("--author={text}"),
        SearchField::Hash => String::new(),
        SearchField::File => String::new(),
    };
    let mut args = vec![
        "--literal-pathspecs",
        "log",
        "--topo-order",
        "--no-color",
        "--no-decorate",
        "--no-show-signature",
        "--no-notes",
        "-z",
        "--max-count=101",
        &skip,
        "--format=%H%x00%P%x00%an%x00%aI%x00%s",
    ];
    let hash;
    if matches!(request.field, SearchField::Hash) {
        let revision = format!("{}^{{commit}}", text.to_ascii_lowercase());
        hash = runner::text(
            root,
            &["rev-parse", "--verify", "--end-of-options", &revision],
        )?
        .trim()
        .to_string();
        super::commit::verify_commit(root, &hash)?;
        if request.offset > 0 {
            return Ok(HistoryPage {
                commits: vec![],
                tips,
                has_more: false,
            });
        }
        args.extend(["--max-count=1", hash.as_str()]);
    } else if is_file {
        args.push("--follow");
        args.extend(tips.iter().map(String::as_str));
    } else {
        args.extend(["--fixed-strings", "--regexp-ignore-case", filter.as_str()]);
        args.extend(tips.iter().map(String::as_str));
    }
    args.push("--");
    if is_file {
        args.push(text);
    }
    let raw = runner::text(root, &args)?;
    let mut commits = parse_records(&raw, &mut HashMap::new())?;
    let has_more = commits.len() > 100;
    commits.truncate(100);
    Ok(HistoryPage {
        commits,
        tips,
        has_more,
    })
}
