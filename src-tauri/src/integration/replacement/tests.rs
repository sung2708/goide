use super::*;
use crate::ui_bridge::types::{WorkspaceSearchFileDto, WorkspaceSearchMatchDto};
#[test]
fn native_preview_preserves_crlf_eof_scope_and_literal_replacements() {
    let root = std::env::temp_dir().join(format!("goide-replace-test Ω-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let path = root.join("main.go");
    std::fs::write(&path, "Needle needlework needle\r\nneedle unlisted\r\nlast").unwrap();
    let request = |preview: &str, query: &str, options: SearchOptions| ReplacementRequest {
        workspace_root: root.to_str().unwrap().into(),
        query: query.into(),
        replacement: "$&literal".into(),
        options,
        files: vec![WorkspaceSearchFileDto {
            relative_path: "main.go".into(),
            matches: vec![WorkspaceSearchMatchDto {
                line: 1,
                preview: preview.into(),
            }],
        }],
        single: false,
    };
    let plans = preview(request(
        "Needle needlework needle",
        "needle",
        SearchOptions {
            whole_word: true,
            ..Default::default()
        },
    ))
    .unwrap();
    assert_eq!(plans[0].occurrences, 2);
    assert_eq!(
        plans[0].after,
        "$&literal needlework $&literal\r\nneedle unlisted\r\nlast"
    );
    assert_eq!(std::fs::read_to_string(&path).unwrap(), plans[0].before);
    let regex = preview(request(
        "Needle needlework needle",
        "n[a-z]+",
        SearchOptions {
            use_regex: true,
            match_case: true,
            ..Default::default()
        },
    ))
    .unwrap();
    assert_eq!(regex[0].occurrences, 2);
    assert!(preview(request("stale line", "needle", SearchOptions::default())).is_err());
    assert!(preview(request(
        "Needle needlework needle",
        "needle",
        SearchOptions {
            exclude: vec!["*.go".into()],
            ..Default::default()
        }
    ))
    .is_err());
    let mut escaped = request(
        "Needle needlework needle",
        "needle",
        SearchOptions::default(),
    );
    escaped.files[0].relative_path = "../outside.go".into();
    assert!(preview(escaped).is_err());
    assert!(root.starts_with(std::env::temp_dir()));
    std::fs::remove_dir_all(root).unwrap();
}
