use crate::integration::fs;
use crate::integration::gopls::{self, ConstructKind};
use crate::ui_bridge::types::{
    AnalyzeConcurrencyRequest, ApiResponse, ConcurrencyConstructDto, ConcurrencyConstructKindDto,
    FsEntryDto,
};
use std::path::{Component, Path};

#[tauri::command]
pub async fn list_workspace_entries(
    workspace_root: String,
    relative_path: Option<String>,
) -> ApiResponse<Vec<FsEntryDto>> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        fs::list_directory(&workspace_root, relative_path.as_deref())
    })
    .await;

    match result {
        Ok(Ok(entries)) => {
            let mapped = entries
                .into_iter()
                .map(|entry| FsEntryDto {
                    name: entry.name,
                    path: entry.path,
                    is_dir: entry.is_dir,
                })
                .collect();
            ApiResponse::ok(mapped)
        }
        Ok(Err(error)) => ApiResponse::err("fs_list_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_list_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn read_workspace_file(
    workspace_root: String,
    relative_path: String,
) -> ApiResponse<String> {
    let result = tauri::async_runtime::spawn_blocking(move || fs::read_file(&workspace_root, &relative_path))
        .await;

    match result {
        Ok(Ok(contents)) => ApiResponse::ok(contents),
        Ok(Err(error)) => ApiResponse::err("fs_read_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_read_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn analyze_active_file_concurrency(
    request: AnalyzeConcurrencyRequest,
) -> ApiResponse<Vec<ConcurrencyConstructDto>> {
    if let Err(message) = validate_go_analysis_path(&request.relative_path) {
        return ApiResponse::err("analysis_invalid_input", &message);
    }

    let result = tauri::async_runtime::spawn_blocking(move || {
        gopls::analyze_file(&request.workspace_root, &request.relative_path)
    })
    .await;

    match result {
        Ok(Ok(constructs)) => {
            let mapped = constructs
                .into_iter()
                .map(|item| ConcurrencyConstructDto {
                    kind: match item.kind {
                        gopls::ConstructKind::Channel => ConcurrencyConstructKindDto::Channel,
                        gopls::ConstructKind::Select => ConcurrencyConstructKindDto::Select,
                        gopls::ConstructKind::Mutex => ConcurrencyConstructKindDto::Mutex,
                        gopls::ConstructKind::WaitGroup => ConcurrencyConstructKindDto::WaitGroup,
                    },
                    line: item.line,
                    column: item.column,
                    symbol: item.symbol,
                    confidence: match item.confidence {
                        gopls::Confidence::Predicted => ConcurrencyConfidenceDto::Predicted,
                        gopls::Confidence::Likely => ConcurrencyConfidenceDto::Likely,
                        gopls::Confidence::Confirmed => ConcurrencyConfidenceDto::Confirmed,
                    },
                })
                .collect();
            ApiResponse::ok(mapped)
        }
        Ok(Err(error)) => ApiResponse::err("analysis_failed", &error.to_string()),
        Err(error) => ApiResponse::err("analysis_failed", &error.to_string()),
    }
}

fn validate_go_analysis_path(relative_path: &str) -> Result<(), String> {
    let normalized = relative_path.trim();
    if normalized.is_empty() {
        return Err("relative path is required".to_string());
    }

    let path = Path::new(normalized);
    if path.is_absolute() {
        return Err("absolute paths are not allowed".to_string());
    }

    for component in path.components() {
        if matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
            return Err("relative path must stay within workspace".to_string());
        }
    }

    let is_go = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("go"))
        .unwrap_or(false);

    if !is_go {
        return Err("only .go files are supported for static concurrency analysis".to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_go_analysis_path;

    #[test]
    fn rejects_non_go_paths_for_analysis() {
        let err = validate_go_analysis_path("README.md").expect_err("must reject non-go file");
        assert!(err.contains(".go"));
    }

    #[test]
    fn rejects_parent_traversal_paths_for_analysis() {
        let err = validate_go_analysis_path("../secrets.go")
            .expect_err("must reject path traversal outside workspace");
        assert!(err.contains("within workspace"));
    }

    #[test]
    fn accepts_relative_go_file_path() {
        validate_go_analysis_path("pkg/service/main.go")
            .expect("must accept normal relative go file");
    }
}
