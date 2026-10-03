//! Official Tauri updater; private verified bytes never cross IPC.
pub mod policy;
#[cfg(test)]
mod tests;
use policy::Channel;
use semver::Version;
use serde::Serialize;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::{oneshot, Mutex as AsyncMutex};

const MAX_DOWNLOAD: u64 = 256 * 1024 * 1024;
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Error {
    pub code: String,
    pub message: String,
}
impl Error {
    fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
type Result<T> = std::result::Result<T, Error>;
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Idle,
    Checking,
    UpToDate,
    UpdateAvailable,
    Downloading,
    Downloaded,
    Installing,
    RestartRequired,
    Error,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub notes: String,
    pub published_at: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: u64,
    pub current_version: String,
    pub channel: Channel,
    pub configured: bool,
    pub phase: Phase,
    pub release: Option<Release>,
    pub received: u64,
    pub total: Option<u64>,
    pub last_checked: Option<u64>,
    pub error: Option<Error>,
}
struct Inner {
    snapshot: Snapshot,
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
    cancel: Option<oneshot::Sender<()>>,
}
pub struct Store {
    operation: AsyncMutex<()>,
    inner: Mutex<Inner>,
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
impl Store {
    pub fn new(version: Version) -> Self {
        let channel = Channel::default_for(&version);
        Self {
            operation: AsyncMutex::new(()),
            inner: Mutex::new(Inner {
                snapshot: Snapshot {
                    revision: 0,
                    current_version: version.to_string(),
                    channel,
                    configured: configuration(channel).is_ok(),
                    phase: Phase::Idle,
                    release: None,
                    received: 0,
                    total: None,
                    last_checked: None,
                    error: None,
                },
                update: None,
                bytes: None,
                cancel: None,
            }),
        }
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        Ok(self.inner.lock().map_err(|_| internal())?.snapshot.clone())
    }
    fn change<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        f: impl FnOnce(&mut Inner),
    ) -> Result<Snapshot> {
        let snapshot = {
            let mut state = self.inner.lock().map_err(|_| internal())?;
            f(&mut state);
            state.snapshot.revision += 1;
            state.snapshot.clone()
        };
        let _ = app.emit("goro-update-state", &snapshot);
        Ok(snapshot)
    }
    fn fail<R: Runtime>(&self, app: &tauri::AppHandle<R>, error: Error) -> Result<Snapshot> {
        eprintln!("Goro update error: {}", error.code);
        self.change(app, |s| {
            s.cancel = None;
            s.snapshot.phase = Phase::Error;
            s.snapshot.error = Some(error);
        })
    }
}
fn internal() -> Error {
    Error::new(
        "update_internal",
        "The update service is unavailable. Close and reopen Goro.",
    )
}
fn configuration(channel: Channel) -> Result<(url::Url, &'static str)> {
    let base = option_env!("GORO_RELEASE_BASE_URL").map(str::trim).filter(|value| !value.is_empty()).ok_or_else(|| Error::new("update_unconfigured", "Updates are not configured in this build. Use the maintainer's verified download channel."))?;
    let key = option_env!("GORO_UPDATER_PUBLIC_KEY")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            Error::new(
                "update_unconfigured",
                "This build has no update verification key. Automatic installation is unavailable.",
            )
        })?;
    let endpoint = policy::endpoint(base, channel).map_err(|_| {
        Error::new(
            "update_configuration",
            "The release endpoint configuration is invalid.",
        )
    })?;
    Ok((endpoint, key))
}
fn plugin_error(error: tauri_plugin_updater::Error, installing: bool) -> Error {
    use tauri_plugin_updater::Error as E;
    match error {
        E::Minisign(_) | E::Base64(_) | E::SignatureUtf8(_) | E::SignedVersionMismatch { .. } | E::MissingSignedVersion => Error::new("update_signature", "Security error: update verification failed. Nothing was installed. Retry later or contact the maintainer."),
        E::Semver(_) | E::Serialization(_) => Error::new("update_metadata", "The release metadata is invalid. Nothing was installed. Retry later."),
        E::TargetNotFound(_) | E::TargetsNotFound(_) | E::UnsupportedArch | E::UnsupportedOs => Error::new("update_platform", "No compatible update is published for this installation."),
        _ if installing => Error::new("update_install", "Installation failed after workspace cleanup. Retry installation, or close and reopen Goro. Your preserved files remain on disk."),
        _ => Error::new("update_network", "Cannot reach or download the update. Check your connection and retry."),
    }
}
pub async fn check<R: Runtime>(
    app: tauri::AppHandle<R>,
    channel: Option<Channel>,
) -> Result<Snapshot> {
    let store = app.state::<Arc<Store>>().inner().clone();
    let _operation = store
        .operation
        .try_lock()
        .map_err(|_| Error::new("update_busy", "An update operation is already running."))?;
    let current = Version::parse(&store.snapshot()?.current_version).map_err(|_| internal())?;
    let channel = channel.unwrap_or_else(|| Channel::default_for(&current));
    let (cancel, cancellation) = oneshot::channel();
    store.change(&app, |s| {
        s.cancel = Some(cancel);
        s.update = None;
        s.bytes = None;
        s.snapshot.phase = Phase::Checking;
        s.snapshot.channel = channel;
        s.snapshot.release = None;
        s.snapshot.error = None;
        s.snapshot.received = 0;
        s.snapshot.total = None;
    })?;
    let result = async {
        #[cfg(target_os = "linux")]
        if app.env().appimage.is_none() {
            return Err(Error::new("update_platform", "Automatic updates require an AppImage installation on Linux. Use a verified manual package for this installation."));
        }
        let (endpoint, key) = configuration(channel)?;
        let host = endpoint.host_str().ok_or_else(internal)?.to_owned();
        let redirect_host = host.clone();
        let updater = app
            .updater_builder()
            .pubkey(key)
            .endpoints(vec![endpoint])
            .map_err(|e| plugin_error(e, false))?
            .timeout(Duration::from_secs(20))
            .version_comparator(|_, _| true)
            .configure_client(move |client| {
                let host = redirect_host.clone();
                client.redirect(reqwest::redirect::Policy::custom(move |attempt| {
                    let url = attempt.url();
                    if attempt.previous().len() >= 5
                        || url.scheme() != "https"
                        || !url.username().is_empty()
                        || url.password().is_some()
                        || !url
                            .host_str()
                            .is_some_and(|h| policy::allowed_host(h, &host))
                    {
                        attempt.error("Release redirect is not permitted")
                    } else {
                        attempt.follow()
                    }
                }))
            })
            .build()
            .map_err(|e| plugin_error(e, false))?;
        // The comparator's channel filter must not turn a wrong-channel response into "up to date".
        let mut update = updater.check().await.map_err(|e| plugin_error(e, false))?;
        if let Some(candidate) = update.as_mut() {
            let version = Version::parse(&candidate.version)
                .map_err(|_| Error::new("update_metadata", "The release version is invalid."))?;
            if !channel.allows(&version) {
                return Err(Error::new(
                    "update_channel",
                    "The endpoint returned a release outside your selected channel.",
                ));
            }
            if candidate.raw_json.to_string().len() > 256 * 1024
                || candidate
                    .body
                    .as_ref()
                    .is_some_and(|notes| notes.len() > 64 * 1024)
                || candidate.signature.len() > 4096
                || !policy::artifact_url(&candidate.download_url, &host)
            {
                return Err(Error::new(
                    "update_metadata",
                    "The release metadata violates the download policy.",
                ));
            }
            candidate.timeout = Some(Duration::from_secs(600));
        }
        if update.as_ref().is_some_and(|candidate| {
            Version::parse(&candidate.version)
                .is_ok_and(|version| version.cmp_precedence(&current).is_le())
        }) {
            update = None;
        }
        Ok(update)
    };
    let result = tokio::select! { biased; _ = cancellation => Err(Error::new("update_cancelled", "Update check cancelled.")), result = result => result };
    match result {
        Ok(update) => store.change(&app, |s| {
            s.cancel = None;
            s.snapshot.last_checked = Some(now());
            s.snapshot.phase = if update.is_some() {
                Phase::UpdateAvailable
            } else {
                Phase::UpToDate
            };
            s.snapshot.release = update.as_ref().map(|u| Release {
                version: u.version.clone(),
                notes: u.body.clone().unwrap_or_default(),
                published_at: u
                    .raw_json
                    .get("pub_date")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned),
            });
            s.update = update;
        }),
        Err(error) => store.fail(&app, error),
    }
}
pub async fn download<R: Runtime>(
    app: tauri::AppHandle<R>,
    channel: Option<Channel>,
) -> Result<Snapshot> {
    let store = app.state::<Arc<Store>>().inner().clone();
    let _operation = store
        .operation
        .try_lock()
        .map_err(|_| Error::new("update_busy", "An update operation is already running."))?;
    require_selected_channel(&store.snapshot()?, channel)?;
    let update = store
        .inner
        .lock()
        .map_err(|_| internal())?
        .update
        .clone()
        .ok_or_else(|| Error::new("update_missing", "Check for an update before downloading."))?;
    let (cancel, cancellation) = oneshot::channel();
    store.change(&app, |s| {
        s.cancel = Some(cancel);
        s.bytes = None;
        s.snapshot.phase = Phase::Downloading;
        s.snapshot.error = None;
        s.snapshot.received = 0;
        s.snapshot.total = None;
    })?;
    let (oversize, exceeded) = oneshot::channel();
    let mut oversize = Some(oversize);
    let mut received = 0_u64;
    let mut last_emit = 0;
    let downloading = update.download(
        |length, total| {
            received = received.saturating_add(length as u64);
            if received > MAX_DOWNLOAD || total.is_some_and(|total| total > MAX_DOWNLOAD) {
                if let Some(sender) = oversize.take() {
                    let _ = sender.send(());
                }
            }
            if now().saturating_sub(last_emit) >= 100 {
                last_emit = now();
                let _ = store.change(&app, |s| {
                    s.snapshot.received = received;
                    s.snapshot.total = total;
                });
            }
        },
        || {},
    );
    let result = tokio::select! { biased;
        _ = cancellation => Err(Error::new("update_cancelled", "Update download cancelled. Nothing was installed.")),
        Ok(()) = exceeded => Err(Error::new("update_size", "The update exceeds the 256 MiB download limit. Use a verified manual download.")),
        result = downloading => result.map_err(|e| plugin_error(e, false)),
    };
    match result {
        Ok(bytes) if bytes.len() as u64 <= MAX_DOWNLOAD => store.change(&app, |s| {
            s.cancel = None;
            s.snapshot.received = bytes.len() as u64;
            s.bytes = Some(bytes);
            s.snapshot.phase = Phase::Downloaded;
        }),
        Ok(_) => store.fail(
            &app,
            Error::new(
                "update_size",
                "The update exceeds the 256 MiB download limit.",
            ),
        ),
        Err(error) => store.fail(&app, error),
    }
}
pub fn cancel<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<Snapshot> {
    let store = app.state::<Arc<Store>>();
    let sender = store.inner.lock().map_err(|_| internal())?.cancel.take();
    if let Some(sender) = sender {
        let _ = sender.send(());
    }
    store.snapshot()
}
pub async fn install<R: Runtime>(
    app: tauri::AppHandle<R>,
    channel: Option<Channel>,
) -> Result<Snapshot> {
    let store = app.state::<Arc<Store>>().inner().clone();
    let _operation = store
        .operation
        .try_lock()
        .map_err(|_| Error::new("update_busy", "An update operation is already running."))?;
    require_selected_channel(&store.snapshot()?, channel)?;
    if !crate::integration::lifecycle::exit_approved()
        || !crate::integration::lifecycle::gate().is_closing()
    {
        return Err(Error::new(
            "update_shutdown_required",
            "Save or explicitly discard drafts and finish owned-process cleanup before installing.",
        ));
    }
    let (update, bytes) = {
        let mut state = store.inner.lock().map_err(|_| internal())?;
        let update = state
            .update
            .clone()
            .ok_or_else(|| Error::new("update_missing", "No update has been checked."))?;
        let bytes = state.bytes.take().ok_or_else(|| {
            Error::new(
                "update_unverified",
                "Download and verify the update before installing.",
            )
        })?;
        (update, bytes)
    };
    store.change(&app, |s| s.snapshot.phase = Phase::Installing)?;
    // Windows official installers must survive the IDE's app-lifetime job after acknowledged cleanup.
    let result = crate::integration::process_job::prepare_update_exit().map_err(|_| {
        Error::new(
            "update_process_boundary",
            "Cannot hand off the verified installer safely.",
        )
    });
    if let Err(error) = result {
        store.change(&app, |s| s.bytes = Some(bytes))?;
        return store.fail(&app, error);
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        let result = update.install(&bytes);
        (result, bytes)
    })
    .await;
    match result {
        Ok((Ok(()), _)) => {
            store.change(&app, |s| s.snapshot.phase = Phase::RestartRequired)?;
            app.restart()
        }
        Ok((Err(error), bytes)) => {
            let _ = crate::integration::process_job::restore_update_exit();
            store.change(&app, |s| s.bytes = Some(bytes))?;
            store.fail(&app, plugin_error(error, true))
        }
        Err(_) => {
            let _ = crate::integration::process_job::restore_update_exit();
            store.fail(&app, internal())
        }
    }
}
fn require_selected_channel(state: &Snapshot, requested: Option<Channel>) -> Result<()> {
    let current = Version::parse(&state.current_version).map_err(|_| internal())?;
    if state.channel != requested.unwrap_or_else(|| Channel::default_for(&current)) {
        return Err(Error::new(
            "update_channel",
            "The update channel changed. Check again before downloading or installing.",
        ));
    }
    if state.release.as_ref().is_some_and(|release| {
        Version::parse(&release.version).map_or(true, |version| {
            version.cmp_precedence(&current).is_le() || !state.channel.allows(&version)
        })
    }) {
        return Err(Error::new(
            "update_channel",
            "This release is not a newer compatible update.",
        ));
    }
    Ok(())
}
