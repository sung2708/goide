use super::{repository_status, runner};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryCommit {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub date: String,
    pub subject: String,
    pub refs: Vec<String>,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub commits: Vec<HistoryCommit>,
    pub tips: Vec<String>,
    pub has_more: bool,
}

pub fn history_page(
    root: &Path,
    offset: usize,
    requested_tips: Vec<String>,
) -> Result<HistoryPage, String> {
    if offset > 10000 || requested_tips.len() > 256 {
        return Err("History scope exceeds the safety limit. Use the terminal.".into());
    }
    let status = repository_status(root)?;
    let refs_raw = runner::text(
        root,
        &[
            "for-each-ref",
            "--format=%(objectname)%00%(objecttype)%00%(refname)%00%(*objectname)%00%(*objecttype)",
        ],
    )?;
    let mut refs = HashMap::<String, Vec<String>>::new();
    let mut tips = Vec::new();
    for line in refs_raw.lines() {
        let fields: Vec<_> = line.split('\0').collect();
        if fields.len() != 5 {
            return Err("Malformed Git ref record".into());
        }
        let hash = if fields[1] == "commit" {
            fields[0]
        } else if fields[4] == "commit" {
            fields[3]
        } else {
            continue;
        };
        tips.push(hash.to_string());
        let label = if let Some(name) = fields[2].strip_prefix("refs/heads/") {
            format!("branch: {name}")
        } else if let Some(name) = fields[2].strip_prefix("refs/remotes/") {
            format!("remote: {name}")
        } else if let Some(name) = fields[2].strip_prefix("refs/tags/") {
            format!("tag: {name}")
        } else {
            continue;
        };
        refs.entry(hash.into()).or_default().push(label);
    }
    if let Some(head) = status.head {
        tips.push(head.clone());
        refs.entry(head).or_default().push("HEAD".into());
    }
    if !requested_tips.is_empty() {
        tips = requested_tips;
    }
    tips.sort();
    tips.dedup();
    if tips.len() > 256 {
        return Err("More than 256 unique ref tips. Narrowing history is not supported yet; use the terminal.".into());
    }
    for hash in &tips {
        if !matches!(hash.len(), 40 | 64) || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("History tips must be full Git object IDs.".into());
        }
    }
    if tips.is_empty() {
        return Ok(HistoryPage {
            commits: vec![],
            tips,
            has_more: false,
        });
    }
    let skip = format!("--skip={offset}");
    let mut args = vec![
        "log",
        "--topo-order",
        "-z",
        "--max-count=101",
        &skip,
        "--format=%H%x00%P%x00%an%x00%aI%x00%s",
    ];
    args.extend(tips.iter().map(String::as_str));
    args.push("--");
    let raw = runner::text(root, &args)?;
    if raw.is_empty() {
        return Ok(HistoryPage {
            commits: vec![],
            tips,
            has_more: false,
        });
    }
    let fields: Vec<_> = raw.strip_suffix('\0').unwrap_or(&raw).split('\0').collect();
    if fields.len() % 5 != 0 {
        return Err("Malformed Git history record".into());
    }
    let mut commits: Vec<_> = fields
        .as_chunks::<5>()
        .0
        .iter()
        .map(|f| HistoryCommit {
            hash: f[0].into(),
            parents: f[1].split_whitespace().map(str::to_string).collect(),
            author: f[2].into(),
            date: f[3].into(),
            subject: f[4].into(),
            refs: refs.remove(f[0]).unwrap_or_default(),
        })
        .collect();
    let has_more = commits.len() > 100;
    commits.truncate(100);
    Ok(HistoryPage {
        commits,
        tips,
        has_more,
    })
}
