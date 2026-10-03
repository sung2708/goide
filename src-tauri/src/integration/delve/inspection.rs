//! Inspect only references issued by this adapter during the same observed stop.
use super::{ensure_success, DapClient};
use anyhow::{anyhow, ensure, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::Path;
mod parse;
pub use parse::scoped_source;
#[cfg(test)]
mod tests;

const MAX_REFERENCES: usize = 2048;
const PAGE_SIZE: usize = 100;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub workspace_root: String,
    pub stop_token: String,
    pub query: Query,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Query {
    Threads,
    Stack {
        thread_id: i64,
    },
    Scopes {
        frame_id: i64,
    },
    Variables {
        reference: i64,
        #[serde(default)]
        start: usize,
        #[serde(default)]
        indexed: bool,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Output {
    Threads {
        stop_token: String,
        items: Vec<Thread>,
        selected_thread_id: Option<i64>,
        limited: bool,
    },
    Stack {
        stop_token: String,
        items: Vec<Frame>,
        total_frames: Option<usize>,
        limited: bool,
    },
    Scopes {
        stop_token: String,
        items: Vec<Scope>,
        limited: bool,
    },
    Variables {
        stop_token: String,
        items: Vec<Variable>,
        next_start: Option<usize>,
        limited: bool,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub id: Option<i64>,
    pub name: String,
}
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Frame {
    pub id: i64,
    pub name: String,
    pub source: Option<String>,
    pub relative_path: Option<String>,
    pub line: Option<usize>,
    pub column: Option<usize>,
}
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Scope {
    pub name: String,
    pub reference: i64,
    pub expensive: bool,
}
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Variable {
    pub name: String,
    pub value: String,
    pub variable_type: Option<String>,
    pub reference: i64,
    pub indexed_variables: Option<usize>,
    pub named_variables: Option<usize>,
    pub truncated: bool,
}

#[derive(Default)]
pub(super) struct Access {
    epoch: u64,
    threads: HashSet<i64>,
    frames: HashMap<i64, Frame>,
    references: HashMap<i64, Option<usize>>,
    selected_thread: Option<i64>,
    selected_frame: Option<i64>,
}

impl DapClient {
    pub fn stop_token(&self) -> Option<String> {
        (self.observed_pause() == Some(true) && !self.is_poisoned())
            .then(|| format!("{}:{}", self.identity, self.execution.revision()))
    }

    pub fn selected_frame(&self) -> Option<&Frame> {
        if self.access.epoch != self.execution.revision() || self.observed_pause() != Some(true) {
            return None;
        }
        self.access
            .selected_frame
            .and_then(|id| self.access.frames.get(&id))
    }

    pub fn selected_thread(&self) -> Option<i64> {
        (self.access.epoch == self.execution.revision() && self.observed_pause() == Some(true))
            .then_some(self.access.selected_thread)
            .flatten()
    }

    fn verify_stop(&mut self, token: &str) -> Result<()> {
        ensure!(
            self.stop_token().as_deref() == Some(token),
            "Debugger stop changed; refresh inspection after the next stop."
        );
        if self.access.epoch != self.execution.revision() {
            self.access = Access {
                epoch: self.execution.revision(),
                ..Default::default()
            };
        }
        Ok(())
    }

    fn issue_reference(&mut self, reference: i64, indexed: Option<usize>) -> Result<()> {
        if reference == 0 {
            return Ok(());
        }
        ensure!(
            (1..=i32::MAX as i64).contains(&reference),
            "Invalid DAP variable reference."
        );
        ensure!(
            self.access.references.contains_key(&reference)
                || self.access.references.len() < MAX_REFERENCES,
            "Debugger reference budget reached; continue and pause again to refresh inspection."
        );
        self.access.references.insert(reference, indexed);
        Ok(())
    }

    pub async fn inspect(&mut self, token: &str, query: Query, root: &Path) -> Result<Output> {
        self.verify_stop(token)?;
        let (command, arguments) = match &query {
            Query::Threads => ("threads", json!({})),
            Query::Stack { thread_id } => {
                ensure!(
                    self.access.threads.contains(thread_id),
                    "Select a goroutine returned by the current debugger stop."
                );
                (
                    "stackTrace",
                    json!({ "threadId": thread_id, "startFrame": 0, "levels": 100 }),
                )
            }
            Query::Scopes { frame_id } => {
                ensure!(
                    self.access.frames.contains_key(frame_id),
                    "Select a frame returned by the current debugger stop."
                );
                self.access.selected_frame = Some(*frame_id);
                ("scopes", json!({ "frameId": frame_id }))
            }
            Query::Variables {
                reference,
                start,
                indexed,
            } => {
                let total = self.access.references.get(reference).ok_or_else(|| {
                    anyhow!("Variable reference was not issued during this stop.")
                })?;
                ensure!(
                    *start <= 100_000,
                    "Variable page exceeds the inspection budget."
                );
                if *indexed {
                    ensure!(
                        total.is_some_and(|count| *start < count),
                        "This reference has no indexed children at that page."
                    );
                    (
                        "variables",
                        json!({ "variablesReference": reference, "filter": "indexed", "start": start, "count": PAGE_SIZE }),
                    )
                } else {
                    ensure!(
                        *start == 0,
                        "Named variables do not support indexed paging."
                    );
                    (
                        "variables",
                        json!({ "variablesReference": reference, "count": 200 }),
                    )
                }
            }
        };
        let response = self.request(command, arguments).await?;
        // An event can invalidate handles while awaiting the response. Never issue
        // stale frame/variable references into a newly stopped session.
        self.verify_stop(token)?;
        ensure_success(command, &response)?;
        let body = response
            .get("body")
            .ok_or_else(|| anyhow!("DAP inspection response missing body"))?;
        match query {
            Query::Threads => {
                let (items, limited) =
                    parse::threads(body, self.selected_thread().or(self.observed_thread()))?;
                self.access.threads = items.iter().filter_map(|thread| thread.id).collect();
                Ok(Output::Threads {
                    stop_token: token.into(),
                    selected_thread_id: self.selected_thread().or(self.observed_thread()),
                    items,
                    limited,
                })
            }
            Query::Stack { thread_id } => {
                let (items, total_frames, limited) = parse::frames(body, root)?;
                ensure!(self.access.frames.len() + items.iter().filter(|frame| !self.access.frames.contains_key(&frame.id)).count() <= MAX_REFERENCES,
                    "Debugger frame budget reached; continue and pause again to refresh inspection.");
                for frame in &items {
                    self.access.frames.insert(frame.id, frame.clone());
                }
                self.access.selected_thread = Some(thread_id);
                self.access.selected_frame = None;
                Ok(Output::Stack {
                    stop_token: token.into(),
                    items,
                    total_frames,
                    limited,
                })
            }
            Query::Scopes { frame_id } => {
                let (items, limited) = parse::scopes(body)?;
                for scope in &items {
                    self.issue_reference(scope.reference, None)?;
                }
                self.access.selected_frame = Some(frame_id);
                Ok(Output::Scopes {
                    stop_token: token.into(),
                    items,
                    limited,
                })
            }
            Query::Variables {
                reference,
                start,
                indexed,
            } => {
                let (items, limited) = parse::variables(body)?;
                let next_start = if indexed {
                    self.access.references[&reference]
                        .filter(|total| start + PAGE_SIZE < *total)
                        .map(|_| start + PAGE_SIZE)
                } else {
                    None
                };
                for variable in &items {
                    self.issue_reference(variable.reference, variable.indexed_variables)?;
                }
                Ok(Output::Variables {
                    stop_token: token.into(),
                    items,
                    next_start,
                    limited,
                })
            }
        }
    }
}
