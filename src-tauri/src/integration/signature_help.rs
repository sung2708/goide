//! Signature information is derived exclusively from gopls, not a Go parser in the UI.
use super::{language, lsp_manager};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameter {
    pub label: String,
    pub range: Option<[usize; 2]>,
    pub documentation: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Signature {
    pub label: String,
    pub documentation: Option<String>,
    pub parameters: Vec<Parameter>,
    pub active_parameter: Option<usize>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureHelp {
    pub signatures: Vec<Signature>,
    pub active_signature: usize,
}

pub fn query(request: language::Query) -> Result<Option<SignatureHelp>> {
    let (line, column) = (request.line, request.column);
    language::with_documents(request, |_, session, target, _| {
        parse(&language::request_method(
            session,
            "textDocument/signatureHelp",
            json!({
                "textDocument": { "uri": lsp_manager::path_to_file_uri(target)? },
                "position": { "line": line - 1, "character": column - 1 }
            }),
        )?)
    })
}

fn bounded(text: &str, budget: &mut usize) -> Result<String> {
    if text.len() > 16 * 1024 || *budget + text.len() > 1024 * 1024 {
        return Err(anyhow!("Signature information exceeds its text budget."));
    }
    *budget += text.len();
    Ok(text.to_string())
}
fn documentation(value: &Value, budget: &mut usize) -> Result<Option<String>> {
    if value.is_null() {
        return Ok(None);
    }
    let text = value
        .as_str()
        .or_else(|| value.get("value").and_then(Value::as_str))
        .ok_or_else(|| anyhow!("Language server returned invalid signature documentation."))?;
    bounded(text, budget).map(Some)
}
fn utf16_byte(text: &str, offset: usize) -> Result<usize> {
    let mut count = 0;
    for (byte, character) in text.char_indices() {
        if count == offset {
            return Ok(byte);
        }
        count += character.len_utf16();
    }
    if count == offset {
        return Ok(text.len());
    }
    Err(anyhow!(
        "Signature parameter range is outside its label or splits a UTF-16 character."
    ))
}
fn active(value: &Value, count: usize) -> Option<usize> {
    if count == 0 {
        return None;
    }
    Some(
        value
            .as_u64()
            .and_then(|number| usize::try_from(number).ok())
            .filter(|index| *index < count)
            .unwrap_or(0),
    )
}
fn parse(value: &Value) -> Result<Option<SignatureHelp>> {
    if value.is_null() {
        return Ok(None);
    }
    let entries = value["signatures"]
        .as_array()
        .ok_or_else(|| anyhow!("Language server returned invalid signatures."))?;
    if entries.is_empty() {
        return Ok(None);
    }
    if entries.len() > 32 {
        return Err(anyhow!("Signature information exceeds 32 signatures."));
    }
    let mut budget = 0;
    let mut signatures = Vec::new();
    for entry in entries {
        let label = bounded(
            entry["label"]
                .as_str()
                .ok_or_else(|| anyhow!("Signature has no label."))?,
            &mut budget,
        )?;
        let parameter_entries = if entry["parameters"].is_null() {
            &[][..]
        } else {
            entry["parameters"]
                .as_array()
                .ok_or_else(|| anyhow!("Signature parameters are invalid."))?
                .as_slice()
        };
        if parameter_entries.len() > 256 {
            return Err(anyhow!("Signature information exceeds 256 parameters."));
        }
        let mut parameters = Vec::new();
        for parameter in parameter_entries {
            let (text, range) = if let Some(text) = parameter["label"].as_str() {
                // A repeated substring does not identify a unique highlight range.
                let matches: Vec<_> = label.match_indices(text).take(2).collect();
                let range = if matches.len() == 1 && !text.is_empty() {
                    let start = label[..matches[0].0].encode_utf16().count();
                    Some([start, start + text.encode_utf16().count()])
                } else {
                    None
                };
                (bounded(text, &mut budget)?, range)
            } else {
                let range = parameter["label"]
                    .as_array()
                    .filter(|items| items.len() == 2)
                    .ok_or_else(|| anyhow!("Signature parameter label is invalid."))?;
                let offset = |index: usize| {
                    range[index]
                        .as_u64()
                        .and_then(|number| usize::try_from(number).ok())
                        .ok_or_else(|| anyhow!("Signature parameter offset is invalid."))
                };
                let (start, end) = (offset(0)?, offset(1)?);
                if start > end {
                    return Err(anyhow!("Signature parameter range is reversed."));
                }
                let (from, to) = (utf16_byte(&label, start)?, utf16_byte(&label, end)?);
                (bounded(&label[from..to], &mut budget)?, Some([start, end]))
            };
            parameters.push(Parameter {
                label: text,
                range,
                documentation: documentation(&parameter["documentation"], &mut budget)?,
            });
        }
        let parameter = entry
            .get("activeParameter")
            .unwrap_or(&value["activeParameter"]);
        signatures.push(Signature {
            label,
            documentation: documentation(&entry["documentation"], &mut budget)?,
            active_parameter: active(parameter, parameters.len()),
            parameters,
        });
    }
    Ok(Some(SignatureHelp {
        active_signature: active(&value["activeSignature"], signatures.len()).unwrap(),
        signatures,
    }))
}

#[cfg(test)]
mod tests;
