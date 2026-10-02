use super::*;
use std::fs;
use std::path::PathBuf;

struct Repo(PathBuf);
impl Repo {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("goide-git-test space Ω-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        runner::run(&path, &["init", "-b", "main"]).unwrap();
        for (key, value) in [("user.name", "GoIDE Test"), ("user.email", "test@example.invalid"), ("commit.gpgsign", "false"), ("core.hooksPath", ".git/hooks"), ("core.autocrlf", "false")] {
            runner::run(&path, &["config", "--local", key, value]).unwrap();
        }
        Self(path.canonicalize().unwrap())
    }
    fn write(&self, path: &str, content: &[u8]) { fs::write(self.0.join(path), content).unwrap(); }
    fn stage(&self, paths: &[&str]) { mutate(&self.0, Mutation::Stage { paths: paths.iter().map(|p| (*p).into()).collect() }).unwrap(); }
    fn commit(&self, message: &str) { mutate(&self.0, Mutation::Commit { message: message.into() }).unwrap(); }
    fn git(&self, args: &[&str]) -> String { runner::text(&self.0, args).unwrap() }
}
impl Drop for Repo {
    fn drop(&mut self) {
        let temp = std::env::temp_dir().canonicalize().unwrap();
        assert!(self.0.starts_with(temp));
        assert!(self.0.file_name().unwrap().to_string_lossy().starts_with("goide-git-test space Ω-"));
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn parses_nul_status_without_corrupting_special_names_and_rename_sources() {
    let raw = b"# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +3 -2\0? space\t\nfile.go\0";
    let status = status::parse(raw).unwrap();
    assert_eq!(status.files[0].path, "space\t\nfile.go");
    assert_eq!((status.ahead, status.behind), (3, 2));
    let renamed = status::parse(b"2 RM N... 100644 100644 100644 aaa bbb R100 new name\0old\tname\0").unwrap();
    assert_eq!(renamed.files[0].original_path.as_deref(), Some("old\tname"));
    assert_eq!(renamed.files[0].index_status, "R");
    assert_eq!(renamed.files[0].worktree_status, "M");
    assert!(status::parse(b"2 RM N... 100644 100644 100644 aaa bbb R100 new\0").is_err());
    assert!(status::parse(b"? invalid\xff\0").is_err());
}

#[test]
fn real_repo_initial_stage_unstage_and_commit_only_index() {
    let repo = Repo::new();
    let initial = repository_status(&repo.0).unwrap();
    assert_eq!(initial.branch.as_deref(), Some("main")); assert!(initial.head.is_none());
    repo.write("space Ω [ab].go", b"first\n");
    repo.write("untouched.go", b"do not stage\n");
    repo.stage(&["space Ω [ab].go"]);
    repo.write("space Ω [ab].go", b"second\n");
    let status = repository_status(&repo.0).unwrap();
    let file = status.files.iter().find(|f| f.path == "space Ω [ab].go").unwrap();
    assert_eq!((&*file.index_status, &*file.worktree_status), ("A", "M"));
    mutate(&repo.0, Mutation::Unstage { paths: vec![file.path.clone()] }).unwrap();
    assert_eq!(fs::read(repo.0.join(&file.path)).unwrap(), b"second\n");
    assert!(repo.git(&["ls-files"]).is_empty());
    repo.stage(&[&file.path]);
    repo.write(&file.path, b"third not committed\n");
    repo.commit("subject $(echo unsafe) `text`\n\nbody");
    assert_eq!(repo.git(&["show", "HEAD:space Ω [ab].go"]), "second\n");
    assert_eq!(fs::read(repo.0.join(&file.path)).unwrap(), b"third not committed\n");
    assert!(repo.git(&["ls-files"]).contains("space"));
    assert!(!repo.git(&["ls-files"]).contains("untouched"));
    assert!(repo.git(&["log", "-1", "--format=%B"]).contains("$(echo unsafe)"));
}

#[test]
fn unstaging_modified_deleted_and_renamed_files_preserves_disk() {
    let repo = Repo::new();
    repo.write("a.go", b"old\n"); repo.stage(&["a.go"]); repo.commit("initial");
    repo.write("a.go", b"new\n"); repo.stage(&["a.go"]);
    mutate(&repo.0, Mutation::Unstage { paths: vec!["a.go".into()] }).unwrap();
    assert_eq!(repo.git(&["show", ":a.go"]), "old\n");
    assert_eq!(fs::read(repo.0.join("a.go")).unwrap(), b"new\n");
    repo.stage(&["a.go"]); repo.commit("modified");
    fs::remove_file(repo.0.join("a.go")).unwrap(); repo.stage(&["a.go"]);
    mutate(&repo.0, Mutation::Unstage { paths: vec!["a.go".into()] }).unwrap();
    assert!(!repo.0.join("a.go").exists());
    repo.write("a.go", b"new\n"); repo.git(&["mv", "a.go", "renamed Ω.go"]);
    let status = repository_status(&repo.0).unwrap();
    assert_eq!(status.files[0].original_path.as_deref(), Some("a.go"));
    mutate(&repo.0, Mutation::Unstage { paths: vec!["renamed Ω.go".into()] }).unwrap();
    assert!(repo.0.join("renamed Ω.go").exists()); assert!(!repo.0.join("a.go").exists());
}

#[test]
fn real_diff_distinguishes_index_worktree_binary_large_crlf_and_eof() {
    let repo = Repo::new();
    repo.write("a.go", b"first\r\n"); repo.stage(&["a.go"]); repo.commit("initial");
    repo.write("a.go", b"staged\r\n"); repo.stage(&["a.go"]);
    repo.write("a.go", b"working without newline");
    let staged = file_diff(&repo.0, "a.go", true).unwrap();
    assert!(staged.patch.contains("+staged")); assert!(!staged.patch.contains("+working"));
    let worktree = file_diff(&repo.0, "a.go", false).unwrap();
    assert!(worktree.patch.contains("+working without newline")); assert!(worktree.patch.contains("No newline at end of file"));
    repo.write("binary.dat", b"\0binary"); repo.stage(&["binary.dat"]);
    assert!(file_diff(&repo.0, "binary.dat", true).unwrap().binary);
    repo.write("large.txt", "line\n".repeat(5000).as_bytes()); repo.stage(&["large.txt"]);
    let large = file_diff(&repo.0, "large.txt", true).unwrap();
    assert!(large.limited); assert!(large.patch.is_empty());
}

#[test]
fn real_conflict_detected_from_index_and_mutations_refused() {
    let repo = Repo::new();
    repo.write("a.go", b"base\n"); repo.stage(&["a.go"]); repo.commit("base");
    repo.git(&["switch", "-c", "feature"]);
    repo.write("a.go", b"feature\n"); repo.stage(&["a.go"]); repo.commit("feature");
    repo.git(&["switch", "main"]);
    repo.write("a.go", b"main\n"); repo.stage(&["a.go"]); repo.commit("main");
    assert!(runner::run(&repo.0, &["merge", "feature"]).is_err());
    let status = repository_status(&repo.0).unwrap();
    assert_eq!(status.operation.as_deref(), Some("merge")); assert!(status.files[0].conflicted);
    let before = fs::read(repo.0.join("a.go")).unwrap();
    assert!(mutate(&repo.0, Mutation::Stage { paths: vec!["a.go".into()] }).is_err());
    assert_eq!(fs::read(repo.0.join("a.go")).unwrap(), before);
}

#[test]
fn hostile_paths_ignored_files_empty_commits_and_parent_repositories_rejected() {
    let repo = Repo::new();
    repo.write(".gitignore", b"ignored.go\n"); repo.write("ignored.go", b"ignored");
    repo.write("--flag.go", b"literal"); repo.stage(&["--flag.go"]); repo.commit("safe");
    assert!(mutate(&repo.0, Mutation::Stage { paths: vec!["ignored.go".into()] }).is_err());
    assert!(mutate(&repo.0, Mutation::Stage { paths: vec!["../outside".into()] }).is_err());
    assert!(mutate(&repo.0, Mutation::Commit { message: "empty".into() }).is_err());
    let child = repo.0.join("child"); fs::create_dir(&child).unwrap();
    assert!(repository_root(child.to_str().unwrap()).is_err());
    let discovered = repository_root(repo.0.to_str().unwrap()).unwrap(); assert_eq!(discovered, repo.0);
    repo.git(&["switch", "--detach"]);
    assert!(repository_status(&repo.0).unwrap().branch.is_none());
}

#[test]
fn commit_hooks_are_respected_without_bypass_or_automatic_retry() {
    let repo = Repo::new();
    repo.write("a.go", b"change"); repo.stage(&["a.go"]);
    let hook = repo.0.join(".git/hooks/pre-commit");
    fs::write(&hook, b"#!/bin/sh\necho 'hook rejected https://user:secret@example.invalid/private' >&2\nexit 1\n").unwrap();
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let error = mutate(&repo.0, Mutation::Commit { message: "blocked".into() }).unwrap_err();
    assert!(error.contains("hook rejected")); assert!(!error.contains("secret"));
    assert!(repository_status(&repo.0).unwrap().head.is_none());
    assert_eq!(fs::read(repo.0.join("a.go")).unwrap(), b"change");
}

#[test]
fn mutations_are_serialized() {
    let repo = Repo::new();
    let other = Repo::new();
    let guard = mutation_lock(&repo.0).unwrap();
    assert!(mutation_lock(&repo.0).is_err());
    assert!(mutation_lock(&other.0).is_ok());
    drop(guard);
    assert!(mutation_lock(&repo.0).is_ok());
}

#[test]
fn history_includes_merge_parents_refs_and_pins_pagination() {
    let repo = Repo::new();
    assert!(history_page(&repo.0, 0, vec![]).unwrap().commits.is_empty());
    repo.write("base", b"base"); repo.stage(&["base"]); repo.commit("base");
    repo.git(&["switch", "-c", "feature"]);
    repo.write("feature", b"feature"); repo.stage(&["feature"]); repo.commit("feature");
    repo.git(&["switch", "main"]);
    repo.write("main", b"main"); repo.stage(&["main"]); repo.commit("main");
    repo.git(&["merge", "--no-ff", "feature", "-m", "merge"]);
    repo.git(&["tag", "-a", "release-test", "-m", "annotated"]);
    let page = history_page(&repo.0, 0, vec![]).unwrap();
    assert_eq!(page.commits[0].parents.len(), 2);
    assert!(page.commits[0].refs.iter().any(|r| r == "tag: release-test"));
    for _ in 0..102 { repo.git(&["commit", "--allow-empty", "-m", "page"]); }
    let first = history_page(&repo.0, 0, vec![]).unwrap();
    assert_eq!(first.commits.len(), 100); assert!(first.has_more);
    repo.git(&["commit", "--allow-empty", "-m", "arrived later"]);
    let second = history_page(&repo.0, 100, first.tips.clone()).unwrap();
    assert_eq!(second.commits.len(), 6); assert!(!second.has_more);
    assert!(second.commits.iter().all(|c| !first.commits.iter().any(|p| p.hash == c.hash)));
    assert_eq!(history_page(&repo.0, 0, first.tips).unwrap().commits[0].hash, first.commits[0].hash);
    assert!(history_page(&repo.0, 0, vec!["--all".into()]).is_err());
}

#[cfg(unix)]
#[test]
fn filenames_with_tabs_newlines_and_symlink_entries_are_literal() {
    let repo = Repo::new();
    repo.write("tab\tline\n.go", b"text"); repo.stage(&["tab\tline\n.go"]);
    assert_eq!(repository_status(&repo.0).unwrap().files[0].path, "tab\tline\n.go");
    std::os::unix::fs::symlink(std::path::Path::new("/outside-not-read"), repo.0.join("link")).unwrap();
    repo.stage(&["link"]);
    assert_eq!(repo.git(&["show", ":link"]), "/outside-not-read");
}
