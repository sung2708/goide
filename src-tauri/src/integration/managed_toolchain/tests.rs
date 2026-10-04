use super::*;
use std::io::{Cursor, Write};

fn fixture(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (path, bytes) in entries {
        archive
            .start_file(*path, zip::write::SimpleFileOptions::default())
            .unwrap();
        archive.write_all(bytes).unwrap();
    }
    archive.finish().unwrap().into_inner()
}
#[test]
fn checksum_and_size_must_both_match_before_extraction() {
    let bytes = b"abc";
    let hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    assert!(verify(bytes, hash, 3).is_ok());
    assert!(verify(bytes, hash, 4).is_err());
    assert!(verify(b"abd", hash, 3).is_err());
}
#[test]
fn extraction_rejects_traversal_absolute_and_duplicate_files() {
    for path in [
        "../escape",
        "/escape",
        "go/../../escape",
        "go\\..\\escape",
        "C:/escape",
    ] {
        assert!(archive_path(path).is_err(), "{path}");
    }
    assert!(archive_path("go/bin/go.exe").is_ok());
    let root = std::env::temp_dir().join(format!("goro-extract-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let cancel = std::sync::atomic::AtomicBool::new(false);
    assert!(extract_zip(
        &fixture(&[("go/bin/go.exe", b"first"), ("go/bin/GO.exe", b"second")]),
        &root,
        &cancel
    )
    .is_err());
    assert_eq!(std::fs::read(root.join("go/bin/go.exe")).unwrap(), b"first");
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn extraction_checks_cancellation_before_writing_files() {
    let root = std::env::temp_dir().join(format!("goro-cancel-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let cancel = std::sync::atomic::AtomicBool::new(true);
    assert!(extract_zip(&fixture(&[("go/bin/go.exe", b"data")]), &root, &cancel).is_err());
    assert!(!root.join("go/bin/go.exe").exists());
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn catalog_is_pinned_and_rejects_unsupported_targets() {
    assert!(catalog_for("windows", "x86_64").is_ok());
    assert!(catalog_for("linux", "aarch64").is_err());
    for (os, arch) in [
        ("windows", "x86_64"),
        ("linux", "x86_64"),
        ("macos", "x86_64"),
        ("macos", "aarch64"),
    ] {
        let item = catalog_for(os, arch).unwrap();
        assert_eq!(item.go_version, "1.26.8");
        assert_eq!(item.sha256.len(), 64);
        assert!(item.url.starts_with("https://go.dev/dl/go1.26.8."));
    }
}
#[test]
fn cancellation_is_operation_bound_and_does_not_unlock_before_worker_finishes() {
    let store = Store::new(std::env::temp_dir().join("unused-goro-store"));
    let (id, token) = store.begin().unwrap();
    assert!(store.begin().is_err());
    assert!(store.cancel(&uuid::Uuid::new_v4().to_string()).is_err());
    assert!(!token.load(Ordering::Acquire));
    store.cancel(&id).unwrap();
    assert!(token.load(Ordering::Acquire));
    assert!(store.begin().is_err());
    assert_eq!(store.lock().unwrap().progress.phase, "cancelling");
}
#[test]
fn incomplete_staging_is_not_listed_and_arbitrary_removal_is_rejected() {
    let root = std::env::temp_dir().join(format!("goro-store-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    fs::create_dir(root.join(".staging-interrupted")).unwrap();
    let store = Store::new(root.clone());
    assert!(store.snapshot().unwrap().installed.is_empty());
    for id in ["../outside", ".staging-interrupted", "C:/Go"] {
        assert!(store.remove(id).is_err());
    }
    remove_private_tree(&root).unwrap();
}
#[tokio::test]
#[ignore = "downloads Go and builds pinned gopls/Delve; requires network and several minutes"]
async fn real_managed_setup_creates_a_project_runs_and_tests_without_using_system_go() {
    let root = std::env::var_os("GORO_MANAGED_TEST_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::temp_dir().join(format!("goro-managed-real-{}", uuid::Uuid::new_v4()))
        });
    let store = Arc::new(Store::new(root.join("toolchains")));
    let existing = store
        .snapshot()
        .unwrap()
        .installed
        .into_iter()
        .find(|bundle| bundle.catalog.go_version == "1.26.8");
    let id = if let Some(bundle) = existing {
        bundle.id
    } else {
        let (id, token) = store.begin().unwrap();
        store.clone().run(id.clone(), token).await;
        let snapshot = store.snapshot().unwrap();
        assert_eq!(
            snapshot.progress.phase, "complete",
            "{:?}",
            snapshot.progress.error
        );
        id
    };
    assert!(!store.snapshot().unwrap().installed.is_empty());
    let bundle = store.bundle(&id).unwrap();
    struct Restore(ToolPaths);
    impl Drop for Restore {
        fn drop(&mut self) {
            super::super::toolchain::paths::install(self.0.clone()).unwrap();
        }
    }
    let restore = Restore(super::super::toolchain::paths::current());
    super::super::toolchain::paths::install(bundle.paths.clone()).unwrap();
    assert!(
        store.remove(&id).is_err(),
        "Selected bundle must remain installed"
    );
    let project =
        super::super::go_project::create::create(super::super::go_project::create::Request {
            parent_directory: root.to_string_lossy().into_owned(),
            name: format!("hello-{}", uuid::Uuid::new_v4()),
            module_path: "example.com/hello".into(),
        })
        .unwrap();
    let cancel = AtomicBool::new(false);
    let mut command = super::super::command::std_command("go");
    assert_eq!(
        command.get_program(),
        std::ffi::OsStr::new(&bundle.paths.go)
    );
    let output =
        controlled_output(command.current_dir(&project).args(["run", "."]), &cancel).unwrap();
    assert!(output.contains("Hello"), "{output}");
    let mut command = super::super::command::std_command("go");
    controlled_output(
        command.current_dir(&project).args(["test", "./..."]),
        &cancel,
    )
    .unwrap();
    fs::write(
        Path::new(&project).join("main.go"),
        "package main\nfunc main() { var unused int }\n",
    )
    .unwrap();
    let diagnostics = super::super::gopls::analyze_file_diagnostics(&project, "main.go").unwrap();
    assert!(diagnostics
        .diagnostics
        .iter()
        .any(|item| item.message.contains("unused")));
    let main = Path::new(&project).join("main.go");
    fs::write(
        &main,
        "package main\nimport \"fmt\"\nfunc main() {\n value := 42\n fmt.Println(value)\n}\n",
    )
    .unwrap();
    let process = super::super::delve::spawn_dlv_dap(Path::new(&project))
        .await
        .unwrap();
    let debug: anyhow::Result<()> = async {
        use super::super::delve::{DapClient, LaunchMode};
        let mut client = DapClient::connect(process.listen_addr).await?;
        client.initialize().await?;
        client
            .launch(
                LaunchMode::Package {
                    package: ".".into(),
                    cwd: project.clone(),
                    work: None,
                },
                Path::new(&project),
                &main,
            )
            .await?;
        client.set_breakpoints(&main, &[5]).await?;
        client.configuration_done().await?;
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(15);
        while client.observed_pause() != Some(true) {
            client.threads().await?;
            anyhow::ensure!(
                tokio::time::Instant::now() < deadline,
                "managed Delve did not hit breakpoint"
            );
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
        let thread = client
            .observed_thread()
            .ok_or_else(|| anyhow::anyhow!("No stopped thread"))?;
        let frame = client
            .stack_trace(thread)
            .await?
            .ok_or_else(|| anyhow::anyhow!("No stopped frame"))?;
        anyhow::ensure!(frame.line == 5, "Unexpected breakpoint frame");
        client.disconnect().await?;
        Ok(())
    }
    .await;
    process.owner.stop().await.unwrap();
    debug.unwrap();
    drop(restore);
    store.remove(&id).unwrap();
    remove_private_tree(&root).unwrap();
}
#[test]
fn private_cleanup_removes_read_only_cache_and_bundle_paths_are_rederived() {
    let root = std::env::temp_dir().join(format!("goro-private-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let cache = root.join("cache");
    fs::create_dir(&cache).unwrap();
    fs::write(cache.join("LICENSE"), "retained").unwrap();
    let mut permissions = fs::metadata(&cache).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&cache, permissions).unwrap();
    remove_private_tree(&root).unwrap();
    assert!(!root.exists());
}
#[test]
fn shared_launch_environment_prefers_all_three_tools_and_normalizes_go_root() {
    let root = std::env::temp_dir().join(format!("goro-env-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(root.join("go/bin")).unwrap();
    fs::create_dir(root.join("bin")).unwrap();
    fs::write(root.join("go/VERSION"), "go1.26.8").unwrap();
    // macOS temp_dir can use /var while canonical paths use /private/var.
    // Compare the selected environment with the same canonical tool root.
    let canonical_root = root.canonicalize().unwrap();
    let paths = paths_at(&canonical_root);
    let mut variables = std::collections::HashMap::new();
    super::super::command::selected_tool_environment(&paths, |key, value| {
        variables.insert(key.to_string(), value);
    });
    let selected: Vec<_> = std::env::split_paths(&variables["PATH"]).collect();
    assert_eq!(
        selected[0],
        super::super::gopls::normalize_platform_pathbuf(canonical_root.join("go/bin"))
    );
    assert_eq!(
        selected[1],
        super::super::gopls::normalize_platform_pathbuf(canonical_root.join("bin"))
    );
    assert_eq!(
        PathBuf::from(&variables["GOROOT"]),
        super::super::gopls::normalize_platform_pathbuf(canonical_root.join("go"))
    );
    remove_private_tree(&root).unwrap();
}
#[test]
fn tar_extraction_rejects_links_and_preserves_executable_files() {
    let root = std::env::temp_dir().join(format!("goro-tar-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let cancel = AtomicBool::new(false);
    let mut tar = tar::Builder::new(Vec::new());
    let mut header = tar::Header::new_gnu();
    header.set_size(3);
    header.set_mode(0o755);
    header.set_cksum();
    tar.append_data(&mut header, "go/bin/go", &b"abc"[..])
        .unwrap();
    let encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    let mut gzip = encoder;
    gzip.write_all(&tar.into_inner().unwrap()).unwrap();
    extract_tar(&gzip.finish().unwrap(), &root, &cancel).unwrap();
    assert_eq!(fs::read(root.join("go/bin/go")).unwrap(), b"abc");
    let mut tar = tar::Builder::new(Vec::new());
    let mut link = tar::Header::new_gnu();
    link.set_size(0);
    link.set_mode(0o755);
    link.set_entry_type(tar::EntryType::Symlink);
    link.set_cksum();
    tar.append_link(&mut link, "go/link", "/outside").unwrap();
    let mut gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    gzip.write_all(&tar.into_inner().unwrap()).unwrap();
    assert!(extract_tar(&gzip.finish().unwrap(), &root, &cancel).is_err());
    assert!(!root.join("go/link").exists());
    remove_private_tree(&root).unwrap();
}
