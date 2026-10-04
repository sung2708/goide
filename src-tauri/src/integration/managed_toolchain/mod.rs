mod archive;
mod catalog;
use super::toolchain::paths::ToolPaths;
use archive::*;
pub use catalog::{catalog_for, Catalog};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bundle {
    pub id: String,
    pub catalog: Catalog,
    pub paths: ToolPaths,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub request_id: Option<String>,
    pub phase: String,
    pub downloaded_bytes: u64,
    pub error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub catalog: Option<Catalog>,
    pub catalog_error: Option<String>,
    pub installed: Vec<Bundle>,
    pub progress: Progress,
}
struct Operation {
    progress: Progress,
    cancel: Arc<AtomicBool>,
    running: bool,
}
pub struct Store {
    pub mutation: tokio::sync::Mutex<()>,
    root: PathBuf,
    operation: Mutex<Operation>,
}
impl Store {
    pub fn new(root: PathBuf) -> Self {
        Self {
            mutation: tokio::sync::Mutex::new(()),
            root,
            operation: Mutex::new(Operation {
                progress: Progress {
                    phase: "idle".into(),
                    ..Default::default()
                },
                cancel: Arc::new(AtomicBool::new(false)),
                running: false,
            }),
        }
    }
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Operation>, String> {
        self.operation
            .lock()
            .map_err(|_| "Tool setup state is unavailable.".into())
    }
    pub fn snapshot(&self) -> Result<Snapshot, String> {
        let catalog = catalog_for(std::env::consts::OS, std::env::consts::ARCH);
        Ok(Snapshot {
            catalog: catalog.clone().ok(),
            catalog_error: catalog.err(),
            installed: self.list()?,
            progress: self.lock()?.progress.clone(),
        })
    }
    pub fn begin(&self) -> Result<(String, Arc<AtomicBool>), String> {
        check(&AtomicBool::new(false))?;
        let mut operation = self.lock()?;
        if operation.running {
            return Err("A tool setup operation is already running.".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        operation.cancel = Arc::new(AtomicBool::new(false));
        operation.running = true;
        operation.progress = Progress {
            request_id: Some(id.clone()),
            phase: "downloading".into(),
            ..Default::default()
        };
        Ok((id, operation.cancel.clone()))
    }
    pub fn cancel(&self, id: &str) -> Result<(), String> {
        let mut operation = self.lock()?;
        if operation.progress.request_id.as_deref() != Some(id) || !operation.running {
            return Err("This setup operation is no longer running.".into());
        }
        operation.cancel.store(true, Ordering::Release);
        operation.progress.phase = "cancelling".into();
        Ok(())
    }
    fn progress(&self, phase: &str, bytes: Option<u64>) {
        if let Ok(mut operation) = self.lock() {
            if operation.progress.phase != "cancelling" {
                operation.progress.phase = phase.into();
            }
            if let Some(bytes) = bytes {
                operation.progress.downloaded_bytes = bytes;
            }
        }
    }
    pub async fn run(self: Arc<Self>, id: String, cancel: Arc<AtomicBool>) {
        let result = self.install(&id, cancel.clone()).await;
        if let Ok(mut operation) = self.lock() {
            operation.running = false;
            operation.progress.phase = match &result {
                Ok(_) => "complete",
                Err(_) if cancel.load(Ordering::Acquire) => "cancelled",
                Err(_) => "failed",
            }
            .into();
            operation.progress.error = result.err();
        }
    }
    async fn install(self: &Arc<Self>, id: &str, cancel: Arc<AtomicBool>) -> Result<(), String> {
        let catalog = catalog_for(std::env::consts::OS, std::env::consts::ARCH)?;
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let root = super::gopls::normalize_platform_pathbuf(
            self.root.canonicalize().map_err(|e| e.to_string())?,
        );
        let stage = root.join(format!(".staging-{id}"));
        fs::create_dir(&stage).map_err(|e| e.to_string())?;
        let result = async {
            let client = reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(15))
                .timeout(Duration::from_secs(600))
                .redirect(reqwest::redirect::Policy::custom(|attempt| {
                    if attempt.previous().len() > 3
                        || attempt.url().scheme() != "https"
                        || !matches!(attempt.url().host_str(), Some("go.dev" | "dl.google.com"))
                    {
                        attempt.error("Go archive redirect is not allowed")
                    } else {
                        attempt.follow()
                    }
                }))
                .build()
                .map_err(|e| e.to_string())?;
            let mut response =
                tokio::time::timeout(Duration::from_secs(30), client.get(&catalog.url).send())
                    .await
                    .map_err(|_| "Go download connection timed out.")?
                    .map_err(|e| e.to_string())?
                    .error_for_status()
                    .map_err(|e| e.to_string())?;
            if response
                .content_length()
                .is_some_and(|length| length != catalog.archive_bytes)
            {
                return Err("Go download size does not match catalog.".into());
            }
            let mut bytes = Vec::with_capacity(catalog.archive_bytes as usize);
            loop {
                check(&cancel)?;
                let chunk = tokio::time::timeout(Duration::from_secs(15), response.chunk())
                    .await
                    .map_err(|_| "Go download stalled.")?
                    .map_err(|e| e.to_string())?;
                let Some(chunk) = chunk else {
                    break;
                };
                if bytes.len() as u64 + chunk.len() as u64 > catalog.archive_bytes {
                    return Err("Go download exceeds catalog size.".into());
                }
                bytes.extend_from_slice(&chunk);
                self.progress("downloading", Some(bytes.len() as u64));
            }
            verify(&bytes, &catalog.sha256, catalog.archive_bytes)?;
            self.progress("extracting", None);
            let stage_copy = stage.clone();
            let catalog_copy = catalog.clone();
            let owner = self.clone();
            let id_copy = id.to_owned();
            tauri::async_runtime::spawn_blocking(move || {
                if catalog_copy.url.ends_with(".zip") {
                    extract_zip(&bytes, &stage_copy, &cancel)?;
                } else {
                    extract_tar(&bytes, &stage_copy, &cancel)?;
                }
                owner.progress("installing-gopls", None);
                prepare_tools(&stage_copy, &catalog_copy, &cancel, |phase| {
                    owner.progress(phase, None)
                })?;
                check(&cancel)?;
                let final_root = root.join(&id_copy);
                let bundle = Bundle {
                    id: id_copy.clone(),
                    paths: paths_at(&final_root),
                    catalog: catalog_copy,
                };
                fs::write(
                    stage_copy.join("bundle.json"),
                    serde_json::to_vec(&bundle).map_err(|e| e.to_string())?,
                )
                .map_err(|e| e.to_string())?;
                // Serialize cancellation with the final rename: a committed bundle is complete.
                let operation = owner.lock()?;
                check(&cancel)?;
                fs::rename(&stage_copy, &final_root).map_err(|e| e.to_string())?;
                drop(operation);
                Ok::<(), String>(())
            })
            .await
            .map_err(|e| e.to_string())?
        }
        .await;
        if let Err(failure) = &result {
            if stage.exists() {
                // Only the UUID directory we created under the canonical private root.
                if let Err(error) = remove_private_tree(&stage) {
                    return Err(format!(
                        "{} Cleanup pending for {}: {error}",
                        failure,
                        stage.display()
                    ));
                }
            }
        }
        result
    }
    fn bundle_path(&self, id: &str) -> Result<PathBuf, String> {
        let parsed = uuid::Uuid::parse_str(id).map_err(|_| "Invalid managed toolchain ID.")?;
        if parsed.to_string() != id {
            return Err("Noncanonical managed toolchain ID.".into());
        }
        let root = super::gopls::normalize_platform_pathbuf(
            self.root.canonicalize().map_err(|e| e.to_string())?,
        );
        let path = root.join(id);
        if fs::symlink_metadata(&path)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("Managed toolchain links are forbidden.".into());
        }
        let resolved = super::gopls::normalize_platform_pathbuf(
            path.canonicalize().map_err(|e| e.to_string())?,
        );
        if resolved.parent() != Some(root.as_path()) {
            return Err("Managed toolchain escaped its store.".into());
        }
        Ok(resolved)
    }
    pub fn bundle(&self, id: &str) -> Result<Bundle, String> {
        let root = self.bundle_path(id)?;
        let manifest = root.join("bundle.json");
        if fs::metadata(&manifest).map_err(|e| e.to_string())?.len() > 16384 {
            return Err("Bundle manifest too large.".into());
        }
        let mut bundle: Bundle =
            serde_json::from_slice(&fs::read(manifest).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        if bundle.id != id {
            return Err("Managed bundle identity mismatch.".into());
        }
        let catalog = catalog_for(std::env::consts::OS, std::env::consts::ARCH)?;
        if bundle.catalog.platform != catalog.platform {
            return Err("Managed bundle belongs to a different platform.".into());
        }
        // Never trust executable paths from a mutable manifest.
        bundle.paths = super::toolchain::paths::validate(paths_at(&root))?;
        if [&bundle.paths.go, &bundle.paths.gopls, &bundle.paths.dlv]
            .iter()
            .any(|value| {
                !super::gopls::normalize_platform_pathbuf(PathBuf::from(value)).starts_with(&root)
            })
        {
            return Err("Bundle executable escaped its directory.".into());
        }
        Ok(bundle)
    }
    fn list(&self) -> Result<Vec<Bundle>, String> {
        if !self.root.exists() {
            return Ok(Vec::new());
        }
        let mut installed = Vec::new();
        for entry in fs::read_dir(&self.root)
            .map_err(|e| e.to_string())?
            .take(200)
        {
            let entry = entry.map_err(|e| e.to_string())?;
            if let Some(id) = entry.file_name().to_str() {
                if let Ok(bundle) = self.bundle(id) {
                    installed.push(bundle);
                }
            }
        }
        installed.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(installed)
    }
    pub fn remove(&self, id: &str) -> Result<(), String> {
        let operation = self.lock()?;
        if operation.running {
            return Err("Finish tool setup before removing bundles.".into());
        }
        let path = self.bundle_path(id)?;
        let tools = super::toolchain::paths::current();
        if [&tools.go, &tools.gopls, &tools.dlv].iter().any(|value| {
            super::gopls::normalize_platform_pathbuf(PathBuf::from(value)).starts_with(&path)
        }) {
            return Err("Select other tools before removing this bundle.".into());
        }
        remove_private_tree(&path).map_err(|e| e.to_string())
    }
}
fn paths_at(root: &Path) -> ToolPaths {
    let ext = if cfg!(windows) { ".exe" } else { "" };
    ToolPaths {
        go: root
            .join(format!("go/bin/go{ext}"))
            .to_string_lossy()
            .into_owned(),
        gopls: root
            .join(format!("bin/gopls{ext}"))
            .to_string_lossy()
            .into_owned(),
        dlv: root
            .join(format!("bin/dlv{ext}"))
            .to_string_lossy()
            .into_owned(),
    }
}
fn prepare_tools(
    stage: &Path,
    catalog: &Catalog,
    cancel: &AtomicBool,
    progress: impl Fn(&str),
) -> Result<(), String> {
    fs::create_dir(stage.join("bin")).map_err(|e| e.to_string())?;
    let paths = paths_at(stage);
    let make = || {
        let mut command = super::command::std_command(&paths.go);
        command
            .current_dir(stage)
            .env("GOROOT", stage.join("go"))
            .env("GOBIN", stage.join("bin"))
            .env("GOPATH", stage.join("build-cache"))
            .env("GOMODCACHE", stage.join("build-cache/pkg/mod"))
            .env("GOCACHE", stage.join("build-cache/compiled"));
        for (key, value) in [
            ("GOMAXPROCS", "2"),
            ("GOEXPERIMENT", ""),
            ("GOENV", "off"),
            ("GOWORK", "off"),
            ("GOTOOLCHAIN", "local"),
            ("GOFLAGS", ""),
            ("GOOS", ""),
            ("GOARCH", ""),
            ("CGO_ENABLED", "0"),
            ("GOPROXY", "https://proxy.golang.org"),
            ("GOSUMDB", "sum.golang.org"),
            ("GOPRIVATE", ""),
            ("GONOPROXY", ""),
            ("GONOSUMDB", ""),
        ] {
            command.env(key, value);
        }
        command
    };
    let version = controlled_output(make().arg("version"), cancel)?;
    if !version.contains(&format!("go{} ", catalog.go_version)) {
        return Err("Installed Go version differs from catalog.".into());
    }
    for (phase, module, version) in [
        (
            "installing-gopls",
            "golang.org/x/tools/gopls",
            &catalog.gopls_version,
        ),
        (
            "installing-delve",
            "github.com/go-delve/delve/cmd/dlv",
            &catalog.delve_version,
        ),
    ] {
        progress(phase);
        controlled_output(
            make().args(["install", &format!("{module}@v{version}")]),
            cancel,
        )?;
    }
    progress("verifying");
    for (path, version) in [
        (&paths.gopls, &catalog.gopls_version),
        (&paths.dlv, &catalog.delve_version),
    ] {
        let mut command = super::command::std_command(path);
        command
            .env("GOTOOLCHAIN", "local")
            .env("GOROOT", stage.join("go"));
        if !controlled_output(command.arg("version"), cancel)?.contains(version) {
            return Err("Installed tool version differs from catalog.".into());
        }
    }
    // Retain downloaded module sources/licenses, discard only reproducible build objects.
    let cache = stage.join("build-cache/compiled");
    if cache.exists() {
        remove_private_tree(&cache).map_err(|e| e.to_string())?;
    }
    fs::write(stage.join("THIRD_PARTY_NOTICE.txt"), "Go: BSD-3-Clause, see go/LICENSE.\ngopls: BSD-3-Clause, see build-cache/pkg/mod/golang.org/x/tools*/LICENSE.\nDelve: MIT, see build-cache/pkg/mod/github.com/go-delve/delve*/LICENSE.\nModule dependency source and licenses are retained under build-cache/pkg/mod.\nSources: https://go.dev/ https://github.com/golang/tools https://github.com/go-delve/delve\n").map_err(|e| e.to_string())?;
    Ok(())
}
#[cfg(test)]
mod tests;

// Callers pass only canonical bundle roots or UUID staging directories they created.
fn remove_private_tree(path: &Path) -> std::io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    #[cfg(windows)]
    if !metadata.file_type().is_symlink() && metadata.permissions().readonly() {
        let mut permissions = metadata.permissions();
        // Windows-only: clear the DOS read-only attribute on cache files/directories.
        #[allow(clippy::permissions_set_readonly_false)]
        permissions.set_readonly(false);
        fs::set_permissions(path, permissions)?;
    }
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                path,
                fs::Permissions::from_mode(metadata.permissions().mode() | 0o200),
            )?;
        }
        for child in fs::read_dir(path)? {
            remove_private_tree(&child?.path())?;
        }
        fs::remove_dir(path)
    } else {
        fs::remove_file(path)
    }
}
