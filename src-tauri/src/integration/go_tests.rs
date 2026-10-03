//! Explicit test execution; package identities come from Go, never directory guesses.
use super::{
    command, go_project, gopls::normalize_platform_pathbuf, language_requests, owned_tool_output,
};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Target {
    Package,
    Workspace,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub workspace_root: String,
    pub relative_directory: String,
    pub request_id: String,
    pub target: Target,
    pub test_name: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Package {
    pub import_path: String,
    pub relative_directory: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub packages: Vec<Package>,
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}
fn json(directory: &Path, args: &[&str]) -> Result<Value> {
    let output = owned_tool_output::output(
        command::std_command("go")
            .current_dir(directory)
            .env("GOFLAGS", "")
            .args(args),
        None,
    )?;
    if !output.status.success() {
        return Err(anyhow!(
            "Go test context failed: {}",
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(4096)
                .collect::<String>()
        ));
    }
    serde_json::from_slice(&output.stdout).context("Invalid Go test context JSON")
}
fn scoped(root: &Path, path: &Path) -> Result<PathBuf> {
    let path = normalize_platform_pathbuf(path.canonicalize()?);
    if !path.starts_with(root) {
        return Err(anyhow!("Go test target is outside the opened workspace."));
    }
    Ok(path)
}
struct Plan {
    directory: PathBuf,
    patterns: Vec<String>,
    work: Option<PathBuf>,
}
fn patterns(root: &Path, directory: &Path, target: &Target) -> Result<Plan> {
    let context = json(directory, &["env", "-json", "GOMOD", "GOWORK"])?;
    let work = context["GOWORK"]
        .as_str()
        .ok_or_else(|| anyhow!("Go omitted GOWORK"))?;
    let mut directories = Vec::new();
    let mut selected_work = None;
    if !work.is_empty() && work != "off" {
        let work = scoped(root, Path::new(work))?;
        selected_work = Some(work.clone());
        let work_json = json(
            directory,
            &["work", "edit", "-json", &work.to_string_lossy()],
        )?;
        let uses = work_json["Use"]
            .as_array()
            .ok_or_else(|| anyhow!("Workspace has no modules"))?;
        if uses.is_empty() || uses.len() > 128 {
            return Err(anyhow!("Test workspace requires 1 to 128 scoped modules."));
        }
        for entry in uses {
            language_requests::check()?;
            let member = entry["DiskPath"]
                .as_str()
                .ok_or_else(|| anyhow!("Invalid workspace module"))?;
            directories.push(scoped(root, &work.parent().unwrap().join(member))?);
        }
    } else {
        let module = context["GOMOD"]
            .as_str()
            .filter(|value| {
                !value.is_empty() && *value != "/dev/null" && !value.eq_ignore_ascii_case("NUL")
            })
            .ok_or_else(|| anyhow!("Open a Go module or go.work before running tests."))?;
        let module = scoped(root, Path::new(module))?;
        directories.push(module.parent().unwrap().to_path_buf());
    }
    if *target == Target::Package {
        return Ok(Plan {
            directory: directory.to_path_buf(),
            patterns: vec![".".into()],
            work: selected_work,
        });
    }
    let cwd = if selected_work.is_some() {
        root.to_path_buf()
    } else {
        directories[0].clone()
    };
    let patterns = directories
        .into_iter()
        .map(|directory| {
            let relative = directory
                .strip_prefix(&cwd)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            let pattern = if relative.is_empty() {
                ".".into()
            } else {
                format!("./{relative}")
            };
            if *target == Target::Workspace {
                format!("{pattern}/...")
            } else {
                pattern
            }
        })
        .collect();
    Ok(Plan {
        directory: cwd,
        patterns,
        work: selected_work,
    })
}
pub(crate) fn test_filter(name: Option<&str>) -> Result<Option<String>> {
    let Some(name) = name else {
        return Ok(None);
    };
    if name.len() > 256
        || !regex::Regex::new(r"^Test(?:[\p{Lu}\p{Lt}\p{Lm}\p{Lo}\p{Nd}_][\p{L}\p{Nd}_]*)?$")?
            .is_match(name)
    {
        return Err(anyhow!(
            "Run Test requires an exact top-level Go test identifier."
        ));
    }
    Ok(Some(format!("^{name}$")))
}
/// Resolve the saved package using Go's module/workspace and build constraints.
/// Individual Debug Test discovery is explicit execution preparation, not a background scan.
#[cfg(test)]
pub(crate) fn debug_target(
    root: &Path,
    relative_path: &str,
    name: Option<&str>,
) -> Result<super::delve::LaunchMode> {
    let root = normalize_platform_pathbuf(root.canonicalize()?);
    let _scope = language_requests::begin_with_timeout(&root, None, Duration::from_secs(120))?;
    execution_target(&root, relative_path, name)
}
pub(crate) fn execution_target(
    root: &Path,
    relative_path: &str,
    name: Option<&str>,
) -> Result<super::delve::LaunchMode> {
    let root = normalize_platform_pathbuf(root.canonicalize()?);
    let is_test = relative_path.ends_with("_test.go");
    if name.is_some() && !is_test {
        return Err(anyhow!("A selected test requires a saved _test.go file."));
    }
    let file = scoped(&root, &root.join(relative_path))?;
    if !file.is_file() {
        return Err(anyhow!("Debug Test target is not a file."));
    }
    let directory = file
        .parent()
        .context("Test file has no package directory")?;
    let filter = test_filter(name)?;
    let plan = patterns(&root, directory, &Target::Package)?;
    let work = plan.work.as_ref().map_or_else(
        || std::ffi::OsString::from("off"),
        |path| path.as_os_str().to_owned(),
    );
    let listed = owned_tool_output::output(
        command::std_command("go")
            .current_dir(directory)
            .env("GOFLAGS", "")
            .env("GOWORK", &work)
            .args(["list", "-json", "."]),
        None,
    )?;
    if !listed.status.success() {
        return Err(anyhow!(
            "Debug Test package discovery failed: {}",
            String::from_utf8_lossy(&listed.stderr)
                .chars()
                .take(4096)
                .collect::<String>()
        ));
    }
    let package: Value = serde_json::from_slice(&listed.stdout)?;
    let saved_name = file
        .file_name()
        .context("No test filename")?
        .to_string_lossy();
    let file_fields = if is_test {
        ["TestGoFiles", "XTestGoFiles"]
    } else {
        ["GoFiles", "CgoFiles"]
    };
    if !file_fields.iter().any(|key| {
        package[*key].as_array().is_some_and(|files| {
            files
                .iter()
                .any(|item| item.as_str() == Some(saved_name.as_ref()))
        })
    }) {
        return Err(anyhow!(
            "Selected Go file is excluded from Go's current package/build constraints."
        ));
    }
    if !is_test {
        if package["Name"].as_str() != Some("main") {
            return Err(anyhow!(
                "Selected directory is not a runnable Go package (package main required)."
            ));
        }
        return Ok(super::delve::LaunchMode::Package {
            package: ".".into(),
            cwd: directory.to_string_lossy().into_owned(),
            work: plan.work.map(|path| path.to_string_lossy().into_owned()),
        });
    }
    if let (Some(name), Some(filter)) = (name, filter.as_deref()) {
        let output = owned_tool_output::output(
            command::std_command("go")
                .current_dir(directory)
                .env("GOFLAGS", "")
                .env("GOWORK", &work)
                .args(["test", "-list", filter, "."]),
            None,
        )?;
        if !output.status.success() {
            return Err(anyhow!(
                "Debug Test discovery failed: {}",
                String::from_utf8_lossy(&output.stderr)
                    .chars()
                    .take(4096)
                    .collect::<String>()
            ));
        }
        if !String::from_utf8_lossy(&output.stdout)
            .lines()
            .any(|line| line == name)
        {
            return Err(anyhow!("Go discovered no saved test named {name}; check its signature and build constraints."));
        }
    }
    Ok(super::delve::LaunchMode::TestPackage {
        cwd: directory.to_string_lossy().into_owned(),
        filter,
        work: plan.work.map(|path| path.to_string_lossy().into_owned()),
    })
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum Progress {
    Packages {
        packages: Vec<Package>,
    },
    Output {
        stream: &'static str,
        bytes: Vec<u8>,
    },
}
pub(crate) type Observer = std::sync::Arc<dyn Fn(Progress) + Send + Sync>;
#[cfg(test)]
pub fn run(request: Request) -> Result<Output> {
    run_observed(request, None)
}
pub(crate) fn run_observed(request: Request, observer: Option<Observer>) -> Result<Output> {
    let root = normalize_platform_pathbuf(Path::new(&request.workspace_root).canonicalize()?);
    let directory = go_project::directory(&root, &request.relative_directory)?;
    let filter = test_filter(request.test_name.as_deref())?;
    if filter.is_some() && request.target != Target::Package {
        return Err(anyhow!(
            "Select a package before running an individual test."
        ));
    }
    let _scope = language_requests::begin_with_timeout(
        &root,
        Some(&request.request_id),
        Duration::from_secs(180),
    )?;
    let plan = patterns(&root, &directory, &request.target)?;
    let work = plan.work.as_ref().map_or_else(
        || std::ffi::OsString::from("off"),
        |path| path.as_os_str().to_owned(),
    );
    let listed = owned_tool_output::output(
        command::std_command("go")
            .current_dir(&plan.directory)
            .env("GOFLAGS", "")
            .env("GOWORK", &work)
            .args(["list", "-e", "-json"])
            .args(&plan.patterns),
        None,
    )?;
    if !listed.status.success() {
        return Err(anyhow!(
            "Package discovery failed: {}",
            String::from_utf8_lossy(&listed.stderr)
                .chars()
                .take(4096)
                .collect::<String>()
        ));
    }
    let mut packages = Vec::new();
    for value in serde_json::Deserializer::from_slice(&listed.stdout).into_iter::<Value>() {
        language_requests::check()?;
        let value = value.context("Invalid Go package JSON")?;
        if ![
            "GoFiles",
            "CgoFiles",
            "TestGoFiles",
            "XTestGoFiles",
            "InvalidGoFiles",
        ]
        .iter()
        .any(|key| {
            value[*key]
                .as_array()
                .is_some_and(|files| !files.is_empty())
        }) {
            return Err(anyhow!(
                "Selected directory contains no Go package files: {}",
                value["Error"]["Err"].as_str().unwrap_or("no package files")
            ));
        }
        let package_dir = value["Dir"].as_str().ok_or_else(|| {
            anyhow!(
                "Selected directory is not a Go package: {}",
                value["Error"]["Err"]
                    .as_str()
                    .unwrap_or("package directory unavailable")
            )
        })?;
        let package_dir = scoped(&root, Path::new(package_dir))?;
        let import_path = value["ImportPath"]
            .as_str()
            .ok_or_else(|| anyhow!("Go omitted package identity"))?;
        if import_path.len() > 4096 || packages.len() >= 2048 {
            return Err(anyhow!("Go test package discovery budget exceeded."));
        }
        let relative = package_dir
            .strip_prefix(&root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        packages.push(Package {
            import_path: import_path.into(),
            relative_directory: if relative.is_empty() {
                ".".into()
            } else {
                relative
            },
        });
    }
    if packages.is_empty() {
        return Err(anyhow!("No Go packages match this test target."));
    }
    if let Some(observer) = &observer {
        observer(Progress::Packages {
            packages: packages.clone(),
        });
    }
    let mut child = command::std_command("go");
    child
        .current_dir(&plan.directory)
        .env("GOFLAGS", "")
        .env("GOWORK", &work)
        .args(["test", "-json", "-count=1", "-timeout=120s"])
        .args(&plan.patterns);
    if let Some(filter) = filter {
        child.args(["-run", &filter]);
    }
    let output = if let Some(observer) = observer {
        owned_tool_output::output_with_observer(
            &mut child,
            Duration::from_secs(180),
            std::sync::Arc::new(move |stream, bytes| {
                observer(Progress::Output {
                    stream,
                    bytes: bytes.to_vec(),
                })
            }),
        )?
    } else {
        owned_tool_output::output_with_timeout(&mut child, Duration::from_secs(180))?
    };
    if let Some(name) = request.test_name.as_deref() {
        if output.status.success()
            && !String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(|line| serde_json::from_str::<Value>(line).ok())
                .any(|event| event["Test"].as_str() == Some(name))
        {
            return Err(anyhow!("Go executed no test named {name}; check the saved source and build constraints. No passing test is claimed."));
        }
    }
    Ok(Output {
        packages,
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires installed Go; validates real incremental test output"]
    fn actual_test_output_streams_before_native_completion() {
        let root = std::env::temp_dir().join(format!("goide-test-stream-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            root.join("go.mod"),
            "module example.com/stream\n\ngo 1.22\n",
        )
        .unwrap();
        std::fs::write(root.join("slow_test.go"), "package stream\nimport (\"testing\"; \"time\"; \"os\")\nfunc TestSlow(t *testing.T) { t.Log(\"actual live output\"); time.Sleep(3*time.Second); if err := os.WriteFile(\"completed.marker\", []byte(\"done\"), 0600); err != nil { t.Fatal(err) } }\n").unwrap();
        let chunks = std::sync::Arc::new(std::sync::Mutex::new((Vec::<u8>::new(), false, false)));
        let observed = chunks.clone();
        let observed_root = root.clone();
        let observer: Observer = std::sync::Arc::new(move |event| {
            let mut output = observed.lock().unwrap();
            match event {
                Progress::Packages { packages } => {
                    assert_eq!(packages[0].import_path, "example.com/stream");
                    output.2 = true;
                }
                Progress::Output {
                    stream: "stdout",
                    bytes,
                } => {
                    assert!(output.2, "output arrived before package identity");
                    assert!(bytes.len() <= 8192);
                    output.0.extend(bytes);
                    if String::from_utf8_lossy(&output.0).contains("\"Action\":\"run\"")
                        && !observed_root.join("completed.marker").exists()
                    {
                        output.1 = true;
                    }
                }
                _ => {}
            }
        });
        let result = run_observed(
            Request {
                workspace_root: root.to_string_lossy().into_owned(),
                relative_directory: ".".into(),
                request_id: uuid::Uuid::new_v4().to_string(),
                target: Target::Package,
                test_name: Some("TestSlow".into()),
            },
            Some(observer),
        )
        .unwrap();
        assert!(result.success, "{result:?}");
        let output = chunks.lock().unwrap();
        assert!(output.1, "No actual test event before completion");
        assert_eq!(String::from_utf8_lossy(&output.0), result.stdout);
        assert!(root.join("completed.marker").exists());
        drop(output);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "requires installed Go; runs only local fixture tests without external dependencies"]
    fn actual_package_workspace_and_build_failure_results_are_scoped() {
        let root = std::env::temp_dir().join(format!("goide-tests-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("a")).unwrap();
        std::fs::create_dir(root.join("b")).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());
        for name in ["a", "b"] {
            std::fs::write(
                root.join(name).join("go.mod"),
                format!("module example.test/{name}\n\ngo 1.21\n"),
            )
            .unwrap();
        }
        std::fs::write(root.join("a/a_test.go"), "package a\nimport \"testing\"\nfunc TestPass(t *testing.T) {}\nfunc TestSkip(t *testing.T) { t.Skip(\"fixture skip\") }\nfunc TestFail(t *testing.T) { t.Error(\"fixture fail\") }\n").unwrap();
        std::fs::write(
            root.join("b/b_test.go"),
            "package b\nimport \"testing\"\nfunc TestOther(t *testing.T) {}\n",
        )
        .unwrap();
        let request = |target, directory: &str, test_name| Request {
            workspace_root: root.to_string_lossy().into_owned(),
            relative_directory: directory.into(),
            request_id: uuid::Uuid::new_v4().to_string(),
            target,
            test_name,
        };
        // The opened folder itself has no go.mod. Package execution must use a's cwd.
        let exact = run(request(Target::Package, "a", Some("TestPass".into()))).unwrap();
        assert!(exact.success, "{exact:?}");
        assert!(exact.stdout.contains("TestPass"));
        assert!(!exact.stdout.contains("TestFail"));
        assert_eq!(exact.packages[0].relative_directory, "a");
        assert!(
            run(request(Target::Package, "a", Some("TestMissing".into())))
                .unwrap_err()
                .to_string()
                .contains("executed no test")
        );
        std::fs::create_dir(root.join("a/empty")).unwrap();
        assert!(run(request(Target::Package, "a/empty", None))
            .unwrap_err()
            .to_string()
            .contains("no Go package files"));
        let failed = run(request(Target::Workspace, "a", None)).unwrap();
        assert!(!failed.success);
        assert!(failed.stdout.contains("TestSkip"));
        assert!(failed.stdout.contains("fixture fail"));
        std::fs::write(root.join("go.work"), "go 1.21\nuse (\n ./a\n ./b\n)\n").unwrap();
        let multi = run(request(Target::Workspace, ".", None)).unwrap();
        assert_eq!(multi.packages.len(), 2);
        assert!(multi.stdout.contains("TestOther"));
        assert!(!multi.success);
        std::fs::write(root.join("b/b_test.go"), "package b\nfunc Broken( {\n").unwrap();
        let build = run(request(Target::Package, "b", None)).unwrap();
        assert!(!build.success);
        assert_eq!(build.exit_code, Some(1));
        assert!(
            build.stdout.contains("build failed")
                || build.stdout.contains("build-fail")
                || build.stderr.contains("syntax error")
        );
        std::fs::create_dir(root.join("opened")).unwrap();
        std::fs::write(root.join("opened/go.work"), "go 1.21\nuse ../a\n").unwrap();
        let mut outside = request(Target::Workspace, ".", None);
        outside.workspace_root = root.join("opened").to_string_lossy().into_owned();
        assert!(run(outside)
            .unwrap_err()
            .to_string()
            .contains("outside the opened workspace"));
        // Cancellation must reach the running test binary, not only package discovery.
        let marker = root.join("started.marker");
        let marker_literal = serde_json::to_string(&marker.to_string_lossy()).unwrap();
        std::fs::write(root.join("a/a_test.go"), format!("package a\nimport (\"testing\"; \"os\"; \"time\")\nfunc TestWait(t *testing.T) {{ if err := os.WriteFile({marker_literal}, []byte(\"started\"), 0600); err != nil {{ t.Fatal(err) }}; time.Sleep(99*time.Second) }}\n")).unwrap();
        let cancellation = request(Target::Package, "a", Some("TestWait".into()));
        let cancelled_root = normalize_platform_pathbuf(root.canonicalize().unwrap());
        let cancellation_id = cancellation.request_id.clone();
        let observer = std::thread::spawn(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(45);
            while !marker.exists() && std::time::Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(25));
            }
            let started = marker.exists();
            language_requests::cancel(&cancelled_root, &cancellation_id).unwrap();
            (started, std::time::Instant::now())
        });
        let error = run(cancellation).unwrap_err();
        let (started, stopped) = observer.join().unwrap();
        assert!(
            started,
            "Go test never reached its running marker: {error:#}"
        );
        assert!(error.to_string().contains("cancelled"));
        assert!(stopped.elapsed() < Duration::from_secs(5));
    }
    #[test]
    fn exact_test_selection_rejects_patterns_and_arguments() {
        assert_eq!(
            test_filter(Some("TestActual_2")).unwrap().unwrap(),
            "^TestActual_2$"
        );
        for invalid in ["Test.*", "TestA/sub", "-args", "", "TestX\0", "Testlower"] {
            assert!(test_filter(Some(invalid)).is_err());
        }
    }
    #[test]
    fn cancelled_test_request_never_launches_go() {
        let root = normalize_platform_pathbuf(std::env::temp_dir().canonicalize().unwrap());
        let id = uuid::Uuid::new_v4().to_string();
        language_requests::cancel(&root, &id).unwrap();
        let error = run(Request {
            workspace_root: root.to_string_lossy().into_owned(),
            relative_directory: ".".into(),
            request_id: id,
            target: Target::Package,
            test_name: None,
        })
        .unwrap_err();
        assert!(error.to_string().contains("cancelled"));
    }
}
