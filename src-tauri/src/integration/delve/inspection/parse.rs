use super::{Frame, Scope, Thread, Variable};
use anyhow::{anyhow, ensure, Result};
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Component, Path};

fn array<'a>(body: &'a Value, key: &str) -> Result<&'a Vec<Value>> {
    body[key]
        .as_array()
        .ok_or_else(|| anyhow!("DAP inspection response missing {key} array"))
}
fn text(value: &Value, key: &str, max: usize) -> Result<String> {
    value[key]
        .as_str()
        .map(|value| bounded(value, max).0)
        .ok_or_else(|| anyhow!("DAP inspection item missing {key}"))
}
fn bounded(value: &str, max: usize) -> (String, bool) {
    let mut end = value.len().min(max);
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    (value[..end].into(), end < value.len())
}
fn id(value: &Value, key: &str, allow_zero: bool) -> Result<i64> {
    let id = value[key]
        .as_i64()
        .ok_or_else(|| anyhow!("DAP inspection item missing {key}"))?;
    ensure!(
        ((if allow_zero { 0 } else { 1 })..=i32::MAX as i64).contains(&id),
        "Invalid DAP inspection {key}"
    );
    Ok(id)
}
fn count(value: &Value, key: &str) -> Option<usize> {
    value[key]
        .as_u64()
        .filter(|count| *count <= i32::MAX as u64)
        .map(|count| count as usize)
}
pub(super) fn threads(body: &Value, selected: Option<i64>) -> Result<(Vec<Thread>, bool)> {
    let raw = array(body, "threads")?;
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    let mut selected_rows: Vec<&Value> = raw.iter().take(512).collect();
    if let Some(selected) = selected {
        if !selected_rows
            .iter()
            .any(|value| value["id"].as_i64() == Some(selected))
        {
            if let Some(value) = raw
                .iter()
                .find(|value| value["id"].as_i64() == Some(selected))
            {
                if selected_rows.len() == 512 {
                    selected_rows.pop();
                }
                selected_rows.push(value);
            }
        }
    }
    for value in selected_rows {
        let name = text(value, "name", 1024)?;
        ensure!(
            name != "Dummy" && name != "Current",
            "Delve returned placeholder threads; goroutine information is unavailable."
        );
        let raw_id = value["id"]
            .as_i64()
            .ok_or_else(|| anyhow!("Goroutine response missing id"))?;
        let id = if raw_id == 0 {
            None
        } else {
            Some(id(value, "id", false)?)
        };
        if let Some(id) = id {
            ensure!(seen.insert(id), "Duplicate DAP goroutine id");
        }
        items.push(Thread { id, name });
    }
    Ok((items, raw.len() > 512))
}
pub fn scoped_source(source: &str, root: &Path) -> Option<String> {
    let source = Path::new(source);
    if source
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return None;
    }
    if !source.is_absolute()
        && source
            .components()
            .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
    {
        return None;
    }
    let candidate = root.join(source);
    // Reject external absolute sources before filesystem access. In particular,
    // a foreign UNC source must not cause a network probe during stack parsing.
    #[cfg(windows)]
    let within = {
        let candidate = crate::integration::delve::normalize_platform_path_for_dap(
            &candidate.to_string_lossy(),
        )
        .to_lowercase();
        let root =
            crate::integration::delve::normalize_platform_path_for_dap(&root.to_string_lossy())
                .to_lowercase();
        Path::new(&candidate).starts_with(Path::new(&root))
    };
    #[cfg(not(windows))]
    let within = candidate.starts_with(root);
    if !within {
        return None;
    }
    let path = candidate.canonicalize().ok()?;
    path.strip_prefix(root)
        .ok()
        .filter(|relative| !relative.as_os_str().is_empty())
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
}
pub(super) fn frames(body: &Value, root: &Path) -> Result<(Vec<Frame>, Option<usize>, bool)> {
    let raw = array(body, "stackFrames")?;
    let mut seen = HashSet::new();
    let items = raw
        .iter()
        .take(100)
        .map(|value| {
            let frame_id = id(value, "id", true)?;
            ensure!(seen.insert(frame_id), "Duplicate DAP frame id");
            let source = value["source"]["path"]
                .as_str()
                .map(|value| bounded(value, 8192).0);
            let relative_path = source
                .as_deref()
                .and_then(|source| scoped_source(source, root));
            Ok(Frame {
                id: frame_id,
                name: text(value, "name", 1024)?,
                source,
                relative_path,
                line: count(value, "line").filter(|line| *line > 0),
                column: count(value, "column").filter(|column| *column > 0),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let total = count(body, "totalFrames");
    let limited = raw.len() > 100 || total.is_some_and(|total| total > items.len());
    Ok((items, total, limited))
}
pub(super) fn scopes(body: &Value) -> Result<(Vec<Scope>, bool)> {
    let raw = array(body, "scopes")?;
    let items = raw
        .iter()
        .take(32)
        .map(|value| {
            Ok(Scope {
                name: text(value, "name", 1024)?,
                reference: id(value, "variablesReference", true)?,
                expensive: value["expensive"].as_bool().unwrap_or(false),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok((items, raw.len() > 32))
}
pub(super) fn variables(body: &Value) -> Result<(Vec<Variable>, bool)> {
    let raw = array(body, "variables")?;
    let items = raw
        .iter()
        .take(200)
        .map(|value| {
            let raw_value = value["value"]
                .as_str()
                .ok_or_else(|| anyhow!("DAP variable missing value"))?;
            let (display_value, truncated) = bounded(raw_value, 8192);
            Ok(Variable {
                name: text(value, "name", 1024)?,
                value: display_value,
                variable_type: value["type"].as_str().map(|value| bounded(value, 1024).0),
                reference: id(value, "variablesReference", true)?,
                indexed_variables: count(value, "indexedVariables"),
                named_variables: count(value, "namedVariables"),
                truncated,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok((items, raw.len() > 200))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn bounded_goroutine_lists_keep_the_actual_selected_goroutine() {
        let body = json!({ "threads": (1..=513).map(|id| json!({ "id": id, "name": format!("[Go {id}] main.worker") })).collect::<Vec<_>>() });
        let (items, limited) = threads(&body, Some(513)).unwrap();
        assert!(limited);
        assert_eq!(items.len(), 512);
        assert!(items.iter().any(|thread| thread.id == Some(513)));
    }
    #[test]
    fn variable_values_are_utf8_bounded_without_inventing_types_or_children() {
        let body = json!({ "variables": [{ "name": "message", "value": "\u{1f642}".repeat(3000), "variablesReference": 0 }] });
        let (items, limited) = variables(&body).unwrap();
        assert!(!limited);
        assert!(items[0].truncated);
        assert_eq!(items[0].value.len(), 8192);
        assert_eq!(items[0].variable_type, None);
        assert_eq!(items[0].reference, 0);
    }
    #[test]
    fn adapter_placeholders_and_invalid_references_are_not_goroutines_or_values() {
        assert!(threads(&json!({ "threads": [{ "id": 1, "name": "Dummy" }] }), None).is_err());
        assert!(variables(
            &json!({ "variables": [{ "name": "x", "value": "1", "variablesReference": -1 }] })
        )
        .is_err());
        assert!(frames(&json!({ "stackFrames": [{ "id": 1, "name": "f", "line": 1 }, { "id": 1, "name": "g", "line": 2 }] }), Path::new(".")).is_err());
    }
}
