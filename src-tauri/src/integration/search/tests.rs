use super::*;
use std::{fs, path::PathBuf};
struct Workspace(PathBuf);
impl Workspace {
    fn new() -> Self {
        let root =
            std::env::temp_dir().join(format!("goide-search-test Ω-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        Self(root)
    }
    fn write(&self, path: &str, content: &[u8]) {
        let target = self.0.join(path);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(target, content).unwrap();
    }
    fn search(&self, pattern: &str, options: SearchOptions) -> Result<SearchReport, String> {
        search(
            self.0.to_str().unwrap(),
            &uuid::Uuid::new_v4().to_string(),
            pattern,
            options,
        )
    }
}
impl Drop for Workspace {
    fn drop(&mut self) {
        assert!(self.0.starts_with(std::env::temp_dir()));
        assert!(self
            .0
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("goide-search-test"));
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn matching_is_native_case_regex_unicode_and_glob_scoped() {
    let workspace = Workspace::new();
    workspace.write(
        "src/name Ω.go",
        "Needle\r\nneedlework\r\nneedle\r\nÄpfel\r\n".as_bytes(),
    );
    workspace.write("src/generated.go", b"Needle\n");
    workspace.write("notes.txt", b"Needle\n");
    let report = workspace
        .search(
            "needle",
            SearchOptions {
                whole_word: true,
                include: vec!["**/*.go".into()],
                exclude: vec!["**/generated.go".into()],
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(report.files.len(), 1);
    assert_eq!(report.files[0].matches.len(), 2);
    assert_eq!(report.files[0].matches[1].line, 3);
    let report = workspace
        .search(
            "Needle",
            SearchOptions {
                match_case: true,
                include: vec!["src/name*.go".into()],
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(report.files[0].matches.len(), 1);
    let report = workspace
        .search(
            "^needle(work)?$",
            SearchOptions {
                use_regex: true,
                match_case: true,
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(report.files[0].matches.len(), 2);
    assert_eq!(
        workspace
            .search("äPFEL", SearchOptions::default())
            .unwrap()
            .files[0]
            .matches[0]
            .line,
        4
    );
    assert!(workspace
        .search(
            "[",
            SearchOptions {
                use_regex: true,
                ..Default::default()
            }
        )
        .is_err());
    assert!(workspace
        .search(
            "needle",
            SearchOptions {
                include: vec!["[".into()],
                ..Default::default()
            }
        )
        .is_err());
}
#[test]
fn ignore_binary_generated_and_large_files_and_report_result_limits() {
    let workspace = Workspace::new();
    workspace.write(".gitignore", b"ignored.go\n");
    workspace.write("ignored.go", b"needle\n");
    workspace.write("target/a.go", b"needle\n");
    workspace.write("binary.go", b"needle\0binary");
    workspace.write("large.go", &vec![b'x'; 1024 * 1024 + 1]);
    workspace.write("main.go", b"needle\n");
    let report = workspace
        .search("needle", SearchOptions::default())
        .unwrap();
    assert_eq!(report.files.len(), 1);
    assert_eq!(report.files[0].relative_path, "main.go");
    workspace.write("many.go", "needle\n".repeat(2100).as_bytes());
    let report = workspace
        .search("needle", SearchOptions::default())
        .unwrap();
    assert!(report.limited);
    assert!(
        report
            .files
            .iter()
            .map(|file| file.matches.len())
            .sum::<usize>()
            <= 2000
    );
}
#[test]
fn real_search_can_be_cancelled_and_registry_is_released() {
    let workspace = Workspace::new();
    let text = "no match here\n".repeat(70000);
    for index in 0..70 {
        workspace.write(&format!("file-{index}.go"), text.as_bytes());
    }
    let root = workspace.0.to_str().unwrap().to_string();
    let id = uuid::Uuid::new_v4().to_string();
    let thread_id = id.clone();
    let worker = std::thread::spawn(move || {
        search(
            &root,
            &thread_id,
            "absent pattern",
            SearchOptions::default(),
        )
    });
    let start = Instant::now();
    while !ACTIVE
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .active
        .contains_key(&id)
    {
        assert!(
            !worker.is_finished(),
            "Search finished before cancellation could be requested"
        );
        assert!(start.elapsed() < Duration::from_secs(5));
        std::thread::sleep(Duration::from_millis(1));
    }
    assert!(cancel(&id).unwrap());
    assert!(worker.join().unwrap().unwrap_err().contains("cancelled"));
    assert!(!cancel(&id).unwrap());
}

#[test]
fn cancellation_before_worker_registration_does_not_start_a_late_search() {
    let workspace = Workspace::new();
    let id = uuid::Uuid::new_v4().to_string();
    assert!(!cancel(&id).unwrap());
    let result = search(
        workspace.0.to_str().unwrap(),
        &id,
        "needle",
        SearchOptions::default(),
    );
    assert!(result.unwrap_err().contains("cancelled before execution"));
}

#[test]
fn ranges_use_utf16_and_basename_filters_include_nested_unicode_paths() {
    let workspace = Workspace::new();
    workspace.write("src/Việt Nam.go", "😀 tên tên\r\n".as_bytes());
    let report = workspace
        .search(
            "tên",
            SearchOptions {
                include: vec!["*.go".into()],
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(report.files.len(), 1);
    assert_eq!(
        report.files[0].matches[0].ranges,
        vec![
            WorkspaceSearchRangeDto { from: 3, to: 6 },
            WorkspaceSearchRangeDto { from: 7, to: 10 }
        ]
    );
    assert_eq!(
        workspace
            .search(" tên ", SearchOptions::default())
            .unwrap()
            .files
            .len(),
        1
    );
}

#[test]
fn file_index_respects_nested_ignore_rules_negation_and_generated_trees() {
    let workspace = Workspace::new();
    workspace.write(".gitignore", b"*.log\n!keep.log\n");
    workspace.write("hidden.log", b"");
    workspace.write("keep.log", b"");
    workspace.write("pkg/.gitignore", b"private.go\n");
    workspace.write("pkg/private.go", b"");
    workspace.write("pkg/name Ω.go", b"\0"); // Names are indexed even for binary contents.
    workspace.write("node_modules/package/index.js", b"");
    workspace.write("target/debug/cache", b"");
    workspace.write(".config/settings.json", b"");
    let report = index_files(
        workspace.0.to_str().unwrap(),
        &uuid::Uuid::new_v4().to_string(),
    )
    .unwrap();
    assert!(report.notice.is_none());
    assert_eq!(
        report.files,
        vec![
            ".config/settings.json",
            ".gitignore",
            "keep.log",
            "pkg/.gitignore",
            "pkg/name Ω.go"
        ]
    );
}

#[test]
fn file_index_honors_pre_execution_cancellation_and_releases_identity() {
    let workspace = Workspace::new();
    workspace.write("main.go", b"package main");
    let id = uuid::Uuid::new_v4().to_string();
    cancel(&id).unwrap();
    assert!(index_files(workspace.0.to_str().unwrap(), &id)
        .unwrap_err()
        .contains("cancelled"));
    assert_eq!(
        index_files(workspace.0.to_str().unwrap(), &id)
            .unwrap()
            .files,
        vec!["main.go"]
    );
    assert_eq!(
        index_files(workspace.0.to_str().unwrap(), &id)
            .unwrap()
            .files,
        vec!["main.go"]
    );
}

#[cfg(unix)]
#[test]
fn file_index_never_follows_external_file_or_directory_links() {
    use std::os::unix::fs::symlink;
    let workspace = Workspace::new();
    let external = Workspace::new();
    external.write("secret.go", b"private");
    symlink(external.0.join("secret.go"), workspace.0.join("file.go")).unwrap();
    symlink(&external.0, workspace.0.join("folder")).unwrap();
    assert!(index_files(
        workspace.0.to_str().unwrap(),
        &uuid::Uuid::new_v4().to_string()
    )
    .unwrap()
    .files
    .is_empty());
}
