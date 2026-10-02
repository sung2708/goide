use super::*;
use std::fs;
use std::path::PathBuf;

#[test]
fn stash_list_preview_restore_and_drop_follow_real_git_semantics() {
    let repo = Repo::new();
    repo.write("space Ω.go", b"base\n");
    repo.stage(&["space Ω.go"]);
    repo.commit("base");
    assert!(stash_list(&repo.0).unwrap().entries.is_empty());
    repo.write("space Ω.go", b"staged\n");
    repo.stage(&["space Ω.go"]);
    repo.write("space Ω.go", b"working\n");
    repo.write("new Ω.go", b"untracked\n");
    mutate(
        &repo.0,
        Mutation::StashPush {
            message: "review Ω".into(),
            include_untracked: true,
        },
    )
    .unwrap();
    assert!(repository_status(&repo.0).unwrap().files.is_empty());
    let list = stash_list(&repo.0).unwrap();
    let entry = &list.entries[0];
    assert_eq!(entry.reference, "stash@{0}");
    assert!(entry.message.contains("review Ω"));
    assert!(!entry.date.is_empty());
    let preview = stash_preview(&repo.0, &entry.reference, &entry.hash).unwrap();
    assert!(preview.patch.contains("+working"));
    assert!(preview.patch.contains("+untracked"));
    mutate(
        &repo.0,
        Mutation::StashApply {
            reference: entry.reference.clone(),
            hash: entry.hash.clone(),
            restore_index: true,
        },
    )
    .unwrap();
    assert_eq!(repo.git(&["show", ":space Ω.go"]), "staged\n");
    assert_eq!(fs::read(repo.0.join("space Ω.go")).unwrap(), b"working\n");
    assert_eq!(stash_list(&repo.0).unwrap().entries.len(), 1);
    mutate(
        &repo.0,
        Mutation::StashDrop {
            reference: entry.reference.clone(),
            hash: entry.hash.clone(),
        },
    )
    .unwrap();
    assert!(stash_list(&repo.0).unwrap().entries.is_empty());
}

#[test]
fn stash_pop_conflict_retains_stash_and_reports_unmerged_files() {
    let repo = Repo::new();
    repo.write("main.go", b"base\n");
    repo.stage(&["main.go"]);
    repo.commit("base");
    repo.write("main.go", b"stashed\n");
    mutate(
        &repo.0,
        Mutation::StashPush {
            message: "change".into(),
            include_untracked: false,
        },
    )
    .unwrap();
    let entry = stash_list(&repo.0).unwrap().entries.remove(0);
    repo.write("main.go", b"branch\n");
    repo.stage(&["main.go"]);
    repo.commit("branch edit");
    let error = mutate(
        &repo.0,
        Mutation::StashPop {
            reference: entry.reference,
            hash: entry.hash.clone(),
            restore_index: false,
        },
    )
    .unwrap_err();
    assert!(error.contains("stash is retained"));
    assert_eq!(stash_list(&repo.0).unwrap().entries[0].hash, entry.hash);
    assert!(repository_status(&repo.0)
        .unwrap()
        .files
        .iter()
        .any(|file| file.conflicted));
}

#[test]
fn stash_tracked_only_leaves_untracked_and_ignored_files_and_checks_unborn_head() {
    let repo = Repo::new();
    repo.write("main.go", b"base\n");
    assert!(mutate(
        &repo.0,
        Mutation::StashPush {
            message: "before first commit".into(),
            include_untracked: true
        }
    )
    .is_err());
    assert_eq!(fs::read(repo.0.join("main.go")).unwrap(), b"base\n");
    repo.write(".gitignore", b"ignored.txt\n");
    repo.stage(&["main.go", ".gitignore"]);
    repo.commit("base");
    repo.write("main.go", b"changed\n");
    repo.write("new.go", b"untracked\n");
    repo.write("ignored.txt", b"keep\n");
    mutate(
        &repo.0,
        Mutation::StashPush {
            message: "tracked only".into(),
            include_untracked: false,
        },
    )
    .unwrap();
    assert_eq!(fs::read(repo.0.join("main.go")).unwrap(), b"base\n");
    assert!(repo.0.join("new.go").exists());
    assert!(repo.0.join("ignored.txt").exists());
    mutate(
        &repo.0,
        Mutation::StashPush {
            message: "include untracked".into(),
            include_untracked: true,
        },
    )
    .unwrap();
    assert!(!repo.0.join("new.go").exists());
    assert!(repo.0.join("ignored.txt").exists());
    assert_eq!(stash_list(&repo.0).unwrap().entries.len(), 2);
}

#[test]
fn stash_rejects_shifted_reference_and_pop_removes_only_selected_entry() {
    let repo = Repo::new();
    repo.write("main.go", b"base\n");
    repo.stage(&["main.go"]);
    repo.commit("base");
    for message in ["first", "second"] {
        repo.write("main.go", message.as_bytes());
        mutate(
            &repo.0,
            Mutation::StashPush {
                message: message.into(),
                include_untracked: false,
            },
        )
        .unwrap();
    }
    let entries = stash_list(&repo.0).unwrap().entries;
    assert!(mutate(
        &repo.0,
        Mutation::StashDrop {
            reference: entries[0].reference.clone(),
            hash: entries[1].hash.clone()
        }
    )
    .unwrap_err()
    .contains("list changed"));
    assert!(stash_preview(&repo.0, "--help", &entries[0].hash).is_err());
    mutate(
        &repo.0,
        Mutation::StashPop {
            reference: entries[1].reference.clone(),
            hash: entries[1].hash.clone(),
            restore_index: false,
        },
    )
    .unwrap();
    assert_eq!(
        stash_list(&repo.0).unwrap().entries[0].hash,
        entries[0].hash
    );
    assert_eq!(fs::read(repo.0.join("main.go")).unwrap(), b"first");
}

struct Repo(PathBuf);
impl Repo {
    fn bare() -> Self {
        let path =
            std::env::temp_dir().join(format!("goide-git-test space Ω-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        runner::run(&path, &["init", "--bare", "-b", "main"]).unwrap();
        Self(path.canonicalize().unwrap())
    }
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("goide-git-test space Ω-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        runner::run(&path, &["init", "-b", "main"]).unwrap();
        for (key, value) in [
            ("user.name", "GoIDE Test"),
            ("user.email", "test@example.invalid"),
            ("commit.gpgsign", "false"),
            ("core.hooksPath", ".git/hooks"),
            ("core.autocrlf", "false"),
        ] {
            runner::run(&path, &["config", "--local", key, value]).unwrap();
        }
        Self(path.canonicalize().unwrap())
    }
    fn write(&self, path: &str, content: &[u8]) {
        fs::write(self.0.join(path), content).unwrap();
    }
    fn stage(&self, paths: &[&str]) {
        mutate(
            &self.0,
            Mutation::Stage {
                paths: paths.iter().map(|p| (*p).into()).collect(),
            },
        )
        .unwrap();
    }
    fn commit(&self, message: &str) {
        mutate(
            &self.0,
            Mutation::Commit {
                message: message.into(),
            },
        )
        .unwrap();
    }
    fn git(&self, args: &[&str]) -> String {
        runner::text(&self.0, args).unwrap()
    }
}
impl Drop for Repo {
    fn drop(&mut self) {
        let temp = std::env::temp_dir().canonicalize().unwrap();
        assert!(self.0.starts_with(temp));
        assert!(self
            .0
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("goide-git-test space Ω-"));
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn parses_nul_status_without_corrupting_special_names_and_rename_sources() {
    let raw = b"# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +3 -2\0? space\t\nfile.go\0";
    let status = status::parse(raw).unwrap();
    assert_eq!(status.files[0].path, "space\t\nfile.go");
    assert_eq!((status.ahead, status.behind), (3, 2));
    let renamed =
        status::parse(b"2 RM N... 100644 100644 100644 aaa bbb R100 new name\0old\tname\0")
            .unwrap();
    assert_eq!(renamed.files[0].original_path.as_deref(), Some("old\tname"));
    assert_eq!(renamed.files[0].index_status, "R");
    assert_eq!(renamed.files[0].worktree_status, "M");
    assert!(status::parse(b"2 RM N... 100644 100644 100644 aaa bbb R100 new\0").is_err());
    assert!(status::parse(b"? invalid\xff\0").is_err());
}

#[test]
fn history_search_uses_literal_messages_authors_verified_hashes_and_pinned_scope() {
    let repo = Repo::new();
    repo.git(&["config", "user.name", "Author [Ω]"]);
    repo.write("main.go", b"first\n");
    repo.stage(&["main.go"]);
    repo.commit("First subject\n\nNeedle [x].* in the body");
    let first = repo.git(&["rev-parse", "HEAD"]).trim().to_string();
    repo.git(&["config", "user.name", "Author Ω"]);
    repo.write("main.go", b"second\n");
    repo.stage(&["main.go"]);
    repo.commit("Needle x aaaa");
    let search = |field, text: &str, tips: Vec<String>, offset| {
        search_history(
            &repo.0,
            HistorySearchRequest {
                field,
                text: text.into(),
                tips,
                offset,
            },
        )
    };
    let found = search(HistorySearchField::Message, "needle [x].*", vec![], 0).unwrap();
    assert_eq!(found.commits.len(), 1);
    assert_eq!(found.commits[0].hash, first);
    let authors = search(HistorySearchField::Author, "author [Ω]", vec![], 0).unwrap();
    assert_eq!(authors.commits.len(), 1);
    assert_eq!(authors.commits[0].hash, first);
    let hash = search(HistorySearchField::Hash, &first[..10], vec![], 0).unwrap();
    assert_eq!(hash.commits[0].hash, first);
    assert!(!hash.has_more);
    assert!(search(HistorySearchField::Hash, "--all", vec![], 0).is_err());
    assert!(search(HistorySearchField::Message, "bad\nquery", vec![], 0).is_err());
    assert!(search(
        HistorySearchField::Message,
        "needle",
        vec!["--all".into()],
        0
    )
    .is_err());
    let pinned = found.tips;
    repo.write("main.go", b"third\n");
    repo.stage(&["main.go"]);
    repo.commit("Future matching needle [x].*");
    let older = search(HistorySearchField::Message, "needle [x].*", pinned, 0).unwrap();
    assert_eq!(older.commits.len(), 1);
    assert_eq!(older.commits[0].hash, first);
    assert!(
        search(HistorySearchField::Message, "needle [x].*", older.tips, 1)
            .unwrap()
            .commits
            .is_empty()
    );
}

#[test]
fn file_history_follows_renames_and_deleted_literal_paths_without_glob_collisions() {
    let repo = Repo::new();
    repo.write("old [ab].go", b"package main\n");
    repo.write("old a.go", b"unrelated\n");
    repo.stage(&["old [ab].go", "old a.go"]);
    repo.commit("Original files");
    let first = repo.git(&["rev-parse", "HEAD"]).trim().to_string();
    repo.git(&["mv", "--", "old [ab].go", "space Ω [ab].go"]);
    repo.commit("Rename exact file");
    let renamed = repo.git(&["rev-parse", "HEAD"]).trim().to_string();
    repo.write("old a.go", b"collision changed\n");
    repo.stage(&["old a.go"]);
    repo.commit("Unrelated glob collision");
    let search = |text: &str| {
        search_history(
            &repo.0,
            HistorySearchRequest {
                field: HistorySearchField::File,
                text: text.into(),
                offset: 0,
                tips: vec![],
            },
        )
    };
    let results = search("space Ω [ab].go").unwrap();
    assert_eq!(
        results
            .commits
            .iter()
            .map(|commit| &commit.hash)
            .collect::<Vec<_>>(),
        vec![&renamed, &first]
    );
    repo.git(&["rm", "--", "space Ω [ab].go"]);
    repo.commit("Delete exact file");
    let deleted = search("space Ω [ab].go").unwrap();
    assert_eq!(deleted.commits.len(), 3);
    assert_eq!(deleted.commits[0].subject, "Delete exact file");
    let older = search_history(
        &repo.0,
        HistorySearchRequest {
            field: HistorySearchField::File,
            text: "space Ω [ab].go".into(),
            offset: 1,
            tips: deleted.tips,
        },
    )
    .unwrap();
    assert_eq!(
        older
            .commits
            .iter()
            .map(|commit| &commit.hash)
            .collect::<Vec<_>>(),
        vec![&renamed, &first]
    );
    assert!(search("../outside.go").is_err());
    assert!(search(".").is_err());
}

#[test]
fn real_repo_initial_stage_unstage_and_commit_only_index() {
    let repo = Repo::new();
    let initial = repository_status(&repo.0).unwrap();
    assert_eq!(initial.branch.as_deref(), Some("main"));
    assert!(initial.head.is_none());
    repo.write("space Ω [ab].go", b"first\n");
    repo.write("space Ω a.go", b"glob collision must remain untracked\n");
    repo.write("untouched.go", b"do not stage\n");
    repo.stage(&["space Ω [ab].go"]);
    repo.write("space Ω [ab].go", b"second\n");
    let status = repository_status(&repo.0).unwrap();
    let file = status
        .files
        .iter()
        .find(|f| f.path == "space Ω [ab].go")
        .unwrap();
    assert_eq!((&*file.index_status, &*file.worktree_status), ("A", "M"));
    mutate(
        &repo.0,
        Mutation::Unstage {
            paths: vec![file.path.clone()],
        },
    )
    .unwrap();
    assert_eq!(fs::read(repo.0.join(&file.path)).unwrap(), b"second\n");
    assert!(repo.git(&["ls-files"]).is_empty());
    repo.stage(&[&file.path]);
    repo.write(&file.path, b"third not committed\n");
    repo.commit("subject $(echo unsafe) `text`\n\nbody");
    assert_eq!(repo.git(&["show", "HEAD:space Ω [ab].go"]), "second\n");
    assert_eq!(
        fs::read(repo.0.join(&file.path)).unwrap(),
        b"third not committed\n"
    );
    assert!(repo.git(&["ls-files"]).contains("space"));
    assert!(!repo.git(&["ls-files"]).contains("untouched"));
    assert!(!repo.git(&["ls-files"]).contains("space Ω a.go"));
    assert!(repo
        .git(&["log", "-1", "--format=%B"])
        .contains("$(echo unsafe)"));
}

#[test]
fn unstaging_modified_deleted_and_renamed_files_preserves_disk() {
    let repo = Repo::new();
    repo.write("a.go", b"old\n");
    repo.stage(&["a.go"]);
    repo.commit("initial");
    repo.write("a.go", b"new\n");
    repo.stage(&["a.go"]);
    mutate(
        &repo.0,
        Mutation::Unstage {
            paths: vec!["a.go".into()],
        },
    )
    .unwrap();
    assert_eq!(repo.git(&["show", ":a.go"]), "old\n");
    assert_eq!(fs::read(repo.0.join("a.go")).unwrap(), b"new\n");
    repo.stage(&["a.go"]);
    repo.commit("modified");
    fs::remove_file(repo.0.join("a.go")).unwrap();
    repo.stage(&["a.go"]);
    mutate(
        &repo.0,
        Mutation::Unstage {
            paths: vec!["a.go".into()],
        },
    )
    .unwrap();
    assert!(!repo.0.join("a.go").exists());
    repo.write("a.go", b"new\n");
    repo.git(&["mv", "a.go", "renamed Ω.go"]);
    let status = repository_status(&repo.0).unwrap();
    assert_eq!(status.files[0].original_path.as_deref(), Some("a.go"));
    mutate(
        &repo.0,
        Mutation::Unstage {
            paths: vec!["renamed Ω.go".into()],
        },
    )
    .unwrap();
    assert!(repo.0.join("renamed Ω.go").exists());
    assert!(!repo.0.join("a.go").exists());
}

#[test]
fn real_diff_distinguishes_index_worktree_binary_large_crlf_and_eof() {
    let repo = Repo::new();
    repo.write("a.go", b"first\r\n");
    repo.stage(&["a.go"]);
    repo.commit("initial");
    repo.write("a.go", b"staged\r\n");
    repo.stage(&["a.go"]);
    repo.write("a.go", b"working without newline");
    let staged = file_diff(&repo.0, "a.go", true).unwrap();
    assert!(staged.patch.contains("+staged"));
    assert!(!staged.patch.contains("+working"));
    let worktree = file_diff(&repo.0, "a.go", false).unwrap();
    assert!(worktree.patch.contains("+working without newline"));
    assert!(worktree.patch.contains("No newline at end of file"));
    repo.write("binary.dat", b"\0binary");
    repo.stage(&["binary.dat"]);
    assert!(file_diff(&repo.0, "binary.dat", true).unwrap().binary);
    repo.write("large.txt", "line\n".repeat(5000).as_bytes());
    repo.stage(&["large.txt"]);
    let large = file_diff(&repo.0, "large.txt", true).unwrap();
    assert!(large.limited);
    assert!(large.patch.is_empty());
}

#[test]
fn real_conflict_detected_from_index_and_mutations_refused() {
    let repo = Repo::new();
    repo.write("a.go", b"base\n");
    repo.stage(&["a.go"]);
    repo.commit("base");
    repo.git(&["switch", "-c", "feature"]);
    repo.write("a.go", b"feature\n");
    repo.stage(&["a.go"]);
    repo.commit("feature");
    repo.git(&["switch", "main"]);
    repo.write("a.go", b"main\n");
    repo.stage(&["a.go"]);
    repo.commit("main");
    assert!(runner::run(&repo.0, &["merge", "feature"]).is_err());
    let status = repository_status(&repo.0).unwrap();
    assert_eq!(status.operation.as_deref(), Some("merge"));
    assert!(status.files[0].conflicted);
    let before = fs::read(repo.0.join("a.go")).unwrap();
    assert!(mutate(
        &repo.0,
        Mutation::Stage {
            paths: vec!["a.go".into()]
        }
    )
    .is_err());
    assert_eq!(fs::read(repo.0.join("a.go")).unwrap(), before);
    let content = conflict_content(&repo.0, "a.go").unwrap();
    assert_eq!(content.base.as_deref(), Some("base\n"));
    assert_eq!(content.current.as_deref(), Some("main\n"));
    assert_eq!(content.incoming.as_deref(), Some("feature\n"));
    mutate(
        &repo.0,
        Mutation::SaveConflict {
            path: "a.go".into(),
            expected_index: content.index_signature.clone(),
            expected_disk: content.result.clone(),
            result: "reviewed merge\n".into(),
        },
    )
    .unwrap();
    assert!(repository_status(&repo.0).unwrap().files[0].conflicted);
    assert!(mutate(
        &repo.0,
        Mutation::StageResolved {
            path: "a.go".into(),
            expected_index: content.index_signature.clone(),
            expected_disk: content.result,
        }
    )
    .is_err());
    repo.write("a.go", b"external edit\n");
    assert!(mutate(
        &repo.0,
        Mutation::SaveConflict {
            path: "a.go".into(),
            expected_index: content.index_signature.clone(),
            expected_disk: "reviewed merge\n".into(),
            result: "overwrite forbidden\n".into(),
        }
    )
    .is_err());
    assert_eq!(fs::read(repo.0.join("a.go")).unwrap(), b"external edit\n");
    mutate(
        &repo.0,
        Mutation::StageResolved {
            path: "a.go".into(),
            expected_index: content.index_signature.clone(),
            expected_disk: "external edit\n".into(),
        },
    )
    .unwrap();
    assert!(!repository_status(&repo.0).unwrap().files[0].conflicted);
    assert!(mutate(
        &repo.0,
        Mutation::SaveConflict {
            path: "a.go".into(),
            expected_index: content.index_signature,
            expected_disk: "external edit\n".into(),
            result: "stale editor\n".into(),
        }
    )
    .is_err());
    repo.commit("resolve merge explicitly");
    assert!(repository_status(&repo.0).unwrap().operation.is_none());
    assert_eq!(repo.git(&["show", "HEAD:a.go"]), "external edit\n");
}

#[test]
fn hostile_paths_ignored_files_empty_commits_and_parent_repositories_rejected() {
    let repo = Repo::new();
    repo.write(".gitignore", b"ignored.go\n");
    repo.write("ignored.go", b"ignored");
    repo.write("--flag.go", b"literal");
    repo.stage(&["--flag.go"]);
    repo.commit("safe");
    assert!(mutate(
        &repo.0,
        Mutation::Stage {
            paths: vec!["ignored.go".into()]
        }
    )
    .is_err());
    assert!(mutate(
        &repo.0,
        Mutation::Stage {
            paths: vec!["../outside".into()]
        }
    )
    .is_err());
    assert!(mutate(
        &repo.0,
        Mutation::Commit {
            message: "empty".into()
        }
    )
    .is_err());
    let child = repo.0.join("child");
    fs::create_dir(&child).unwrap();
    assert!(repository_root(child.to_str().unwrap()).is_err());
    let discovered = repository_root(repo.0.to_str().unwrap()).unwrap();
    assert_eq!(discovered, repo.0);
    repo.git(&["switch", "--detach"]);
    assert!(repository_status(&repo.0).unwrap().branch.is_none());
}

#[test]
fn creating_branches_validates_refs_and_preserves_worktree_and_current_branch() {
    let repo = Repo::new();
    repo.write("main.go", b"base\n");
    repo.stage(&["main.go"]);
    repo.commit("base");
    let head = repo.git(&["rev-parse", "HEAD"]).trim().to_string();
    repo.write("main.go", b"valuable working edit\n");
    mutate(
        &repo.0,
        Mutation::CreateBranch {
            name: "feature/Ω,$literal".into(),
            start: Some(head.clone()),
        },
    )
    .unwrap();
    assert_eq!(
        repo.git(&["rev-parse", "refs/heads/feature/Ω,$literal"])
            .trim(),
        head
    );
    assert_eq!(
        repository_status(&repo.0).unwrap().branch.as_deref(),
        Some("main")
    );
    assert_eq!(
        fs::read(repo.0.join("main.go")).unwrap(),
        b"valuable working edit\n"
    );
    for name in ["--force", "bad..ref", "with space", "refs/../escape"] {
        assert!(mutate(
            &repo.0,
            Mutation::CreateBranch {
                name: name.into(),
                start: None
            }
        )
        .is_err());
    }
    assert!(mutate(
        &repo.0,
        Mutation::CreateBranch {
            name: "option-target".into(),
            start: Some("--all".into())
        }
    )
    .is_err());
    assert!(mutate(
        &repo.0,
        Mutation::CreateBranch {
            name: "feature/Ω,$literal".into(),
            start: None
        }
    )
    .is_err());
    assert_eq!(repo.git(&["rev-parse", "HEAD"]).trim(), head);
}

#[test]
fn commit_hooks_are_respected_without_bypass_or_automatic_retry() {
    let repo = Repo::new();
    repo.write("a.go", b"change");
    repo.stage(&["a.go"]);
    let hook = repo.0.join(".git/hooks/pre-commit");
    fs::write(&hook, b"#!/bin/sh\necho 'hook rejected https://user:secret@example.invalid/private' >&2\nexit 1\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let error = mutate(
        &repo.0,
        Mutation::Commit {
            message: "blocked".into(),
        },
    )
    .unwrap_err();
    assert!(error.contains("hook rejected"));
    assert!(!error.contains("secret"));
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
fn discard_preserves_index_and_untracked_deletion_is_explicit_and_file_only() {
    let repo = Repo::new();
    repo.write("main.go", b"base");
    repo.stage(&["main.go"]);
    repo.commit("base");
    repo.write("main.go", b"staged");
    repo.stage(&["main.go"]);
    repo.write("main.go", b"working");
    mutate(
        &repo.0,
        Mutation::Discard {
            path: "main.go".into(),
        },
    )
    .unwrap();
    assert_eq!(fs::read(repo.0.join("main.go")).unwrap(), b"staged");
    assert_eq!(repo.git(&["show", ":main.go"]), "staged");
    repo.write("untracked Ω", b"keep until explicit deletion");
    assert!(mutate(
        &repo.0,
        Mutation::Discard {
            path: "untracked Ω".into()
        }
    )
    .is_err());
    assert!(repo.0.join("untracked Ω").exists());
    mutate(
        &repo.0,
        Mutation::DeleteUntracked {
            path: "untracked Ω".into(),
        },
    )
    .unwrap();
    assert!(!repo.0.join("untracked Ω").exists());
    assert!(mutate(
        &repo.0,
        Mutation::DeleteUntracked {
            path: "main.go".into()
        }
    )
    .is_err());
    fs::create_dir(repo.0.join("folder")).unwrap();
    repo.write("folder/keep", b"keep");
    assert!(crate::integration::fs::delete_file_only(repo.0.to_str().unwrap(), "folder").is_err());
    assert!(repo.0.join("folder/keep").exists());
}

#[test]
fn cancellation_reaps_owned_git_hook_without_touching_another_repository() {
    let repo = Repo::new();
    let other = Repo::new();
    repo.write("main.go", b"valuable");
    repo.stage(&["main.go"]);
    let hook = repo.0.join(".git/hooks/pre-commit");
    fs::write(
        &hook,
        b"#!/bin/sh\nprintf started > hook.started\nsleep 30\n",
    )
    .unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let root = repo.0.clone();
    let worker = std::thread::spawn(move || {
        let _lease = mutation_lock(&root).unwrap();
        mutate(
            &root,
            Mutation::Commit {
                message: "cancelled".into(),
            },
        )
    });
    let start = std::time::Instant::now();
    while !repo.0.join("hook.started").exists() {
        assert!(start.elapsed() < std::time::Duration::from_secs(15));
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    assert!(!cancel(&other.0).unwrap());
    assert!(cancel(&repo.0).unwrap());
    assert!(worker.join().unwrap().unwrap_err().contains("cancelled"));
    assert!(repository_status(&repo.0).unwrap().head.is_none());
    assert_eq!(fs::read(repo.0.join("main.go")).unwrap(), b"valuable");
    assert!(repository_status(&other.0).unwrap().files.is_empty());
    assert!(mutation_lock(&repo.0).is_ok());
}

#[test]
fn remotes_publish_fetch_and_fast_forward_without_force_or_automatic_staging() {
    let remote = Repo::bare();
    let repo = Repo::new();
    let other = Repo::new();
    // Git URL parsing does not accept Windows' verbatim canonical path prefix.
    let remote_path = remote
        .0
        .to_string_lossy()
        .trim_start_matches(r"\\?\")
        .replace('\\', "/");
    repo.git(&["remote", "add", "origin", &remote_path]);
    other.git(&["remote", "add", "origin", &remote_path]);
    repo.write("main.go", b"base\n");
    repo.stage(&["main.go"]);
    repo.commit("base");
    mutate(
        &repo.0,
        Mutation::Push {
            remote: "origin".into(),
            branch: "main".into(),
            set_upstream: true,
        },
    )
    .unwrap();
    assert_eq!(
        repository_status(&repo.0).unwrap().upstream.as_deref(),
        Some("origin/main")
    );
    mutate(
        &other.0,
        Mutation::Fetch {
            remote: "origin".into(),
        },
    )
    .unwrap();
    other.git(&["switch", "-C", "main", "origin/main"]);
    other.write("main.go", b"incoming\n");
    other.stage(&["main.go"]);
    other.commit("incoming");
    mutate(
        &other.0,
        Mutation::Push {
            remote: "origin".into(),
            branch: "main".into(),
            set_upstream: false,
        },
    )
    .unwrap();
    mutate(
        &repo.0,
        Mutation::Fetch {
            remote: "origin".into(),
        },
    )
    .unwrap();
    assert_eq!(repository_status(&repo.0).unwrap().behind, 1);
    repo.write("main.go", b"valuable uncommitted\n");
    assert!(mutate(
        &repo.0,
        Mutation::Pull {
            remote: "origin".into(),
            branch: "main".into()
        }
    )
    .is_err());
    assert_eq!(
        fs::read(repo.0.join("main.go")).unwrap(),
        b"valuable uncommitted\n"
    );
    repo.write("main.go", b"base\n");
    mutate(
        &repo.0,
        Mutation::Pull {
            remote: "origin".into(),
            branch: "main".into(),
        },
    )
    .unwrap();
    assert_eq!(fs::read(repo.0.join("main.go")).unwrap(), b"incoming\n");
    assert!(mutate(
        &repo.0,
        Mutation::Fetch {
            remote: "https://unapproved.invalid".into()
        }
    )
    .is_err());
    repo.write("main.go", b"mine\n");
    repo.stage(&["main.go"]);
    repo.commit("mine");
    other.write("main.go", b"theirs\n");
    other.stage(&["main.go"]);
    other.commit("theirs");
    mutate(
        &other.0,
        Mutation::Push {
            remote: "origin".into(),
            branch: "main".into(),
            set_upstream: false,
        },
    )
    .unwrap();
    assert!(mutate(
        &repo.0,
        Mutation::Push {
            remote: "origin".into(),
            branch: "main".into(),
            set_upstream: false
        }
    )
    .is_err());
    assert!(mutate(
        &repo.0,
        Mutation::Pull {
            remote: "origin".into(),
            branch: "main".into()
        }
    )
    .is_err());
}

#[test]
fn commit_details_and_historical_diff_preserve_paths_and_parent_selection() {
    let repo = Repo::new();
    repo.write("name Ω [ab].go", b"base\n");
    repo.stage(&["name Ω [ab].go"]);
    repo.commit("subject\n\nfull body");
    let root_hash = repo.git(&["rev-parse", "HEAD"]).trim().to_string();
    let details = commit_details(&repo.0, &root_hash, None).unwrap();
    assert!(details.parents.is_empty());
    assert!(details.message.contains("full body"));
    assert_eq!(details.files[0].path, "name Ω [ab].go");
    assert!(
        historical_diff(&repo.0, &root_hash, None, &details.files[0].path)
            .unwrap()
            .patch
            .contains("+base")
    );
    repo.git(&["mv", "name Ω [ab].go", "renamed Ω.go"]);
    repo.commit("rename");
    let hash = repo.git(&["rev-parse", "HEAD"]).trim().to_string();
    let renamed = commit_details(&repo.0, &hash, None).unwrap();
    assert_eq!(
        renamed.files[0].original_path.as_deref(),
        Some("name Ω [ab].go")
    );
    assert_eq!(renamed.files[0].path, "renamed Ω.go");
    assert_eq!(renamed.selected_parent.as_deref(), Some(root_hash.as_str()));
    assert!(historical_diff(&repo.0, &hash, None, "unrelated.go").is_err());
    assert!(commit_details(&repo.0, "--all", None).is_err());
    assert!(commit_details(&repo.0, &hash, Some(hash.clone())).is_err());
}

#[test]
fn history_includes_merge_parents_refs_and_pins_pagination() {
    let repo = Repo::new();
    assert!(history_page(&repo.0, 0, vec![]).unwrap().commits.is_empty());
    repo.write("base", b"base");
    repo.stage(&["base"]);
    repo.commit("base");
    repo.git(&["switch", "-c", "feature"]);
    repo.write("feature", b"feature");
    repo.stage(&["feature"]);
    repo.commit("feature");
    repo.git(&["switch", "main"]);
    repo.write("main", b"main");
    repo.stage(&["main"]);
    repo.commit("main");
    repo.git(&["merge", "--no-ff", "feature", "-m", "merge"]);
    repo.git(&["tag", "-a", "release-test", "-m", "annotated"]);
    let page = history_page(&repo.0, 0, vec![]).unwrap();
    assert_eq!(page.commits[0].parents.len(), 2);
    assert!(page.commits[0]
        .refs
        .iter()
        .any(|r| r == "tag: release-test"));
    for _ in 0..102 {
        repo.git(&["commit", "--allow-empty", "-m", "page"]);
    }
    let first = history_page(&repo.0, 0, vec![]).unwrap();
    assert_eq!(first.commits.len(), 100);
    assert!(first.has_more);
    repo.git(&["commit", "--allow-empty", "-m", "arrived later"]);
    let second = history_page(&repo.0, 100, first.tips.clone()).unwrap();
    assert_eq!(second.commits.len(), 6);
    assert!(!second.has_more);
    assert!(second
        .commits
        .iter()
        .all(|c| !first.commits.iter().any(|p| p.hash == c.hash)));
    assert_eq!(
        history_page(&repo.0, 0, first.tips).unwrap().commits[0].hash,
        first.commits[0].hash
    );
    assert!(history_page(&repo.0, 0, vec!["--all".into()]).is_err());
}

#[cfg(unix)]
#[test]
fn filenames_with_tabs_newlines_and_symlink_entries_are_literal() {
    let repo = Repo::new();
    repo.write("tab\tline\n.go", b"text");
    repo.stage(&["tab\tline\n.go"]);
    assert_eq!(
        repository_status(&repo.0).unwrap().files[0].path,
        "tab\tline\n.go"
    );
    std::os::unix::fs::symlink(
        std::path::Path::new("/outside-not-read"),
        repo.0.join("link"),
    )
    .unwrap();
    repo.stage(&["link"]);
    assert_eq!(repo.git(&["show", ":link"]), "/outside-not-read");
}
