//! Cancellation identity stays independent of the serialized gopls lock.
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::{
    cell::RefCell,
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelRequest {
    pub workspace_root: String,
    pub request_id: String,
}
#[derive(Clone)]
struct Context {
    cancelled: Arc<AtomicBool>,
    deadline: Instant,
}
#[derive(Default)]
struct Registry {
    active: HashMap<Uuid, (PathBuf, Arc<AtomicBool>)>,
    cancelled: HashMap<Uuid, (PathBuf, Instant)>,
}
static REQUESTS: OnceLock<Mutex<Registry>> = OnceLock::new();
thread_local! { static CURRENT: RefCell<Option<Context>> = const { RefCell::new(None) }; }

#[derive(Debug)]
struct Stopped(&'static str);
impl std::fmt::Display for Stopped {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for Stopped {}
pub(crate) fn is_deadline(error: &anyhow::Error) -> bool {
    error
        .downcast_ref::<Stopped>()
        .is_some_and(|error| error.0.contains("deadline"))
}
pub fn is_stopped(error: &anyhow::Error) -> bool {
    error.downcast_ref::<Stopped>().is_some()
}
pub fn check() -> Result<()> {
    if super::lifecycle::gate().is_closing() {
        return Err(Stopped("Language request cancelled for app shutdown.").into());
    }
    CURRENT.with(|context| {
        if let Some(context) = context.borrow().as_ref() {
            if context.cancelled.load(Ordering::Acquire) {
                return Err(Stopped("Language request cancelled.").into());
            }
            if Instant::now() >= context.deadline {
                return Err(Stopped("Language request exceeded its execution deadline.").into());
            }
        }
        Ok(())
    })
}
pub fn deadline(fallback: Instant) -> Instant {
    CURRENT.with(|context| {
        context
            .borrow()
            .as_ref()
            .map_or(fallback, |context| context.deadline.min(fallback))
    })
}

pub fn lock<T>(mutex: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>> {
    loop {
        check()?;
        match mutex.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(std::sync::TryLockError::WouldBlock) => {
                std::thread::sleep(Duration::from_millis(25))
            }
            Err(std::sync::TryLockError::Poisoned(_)) => {
                return Err(anyhow!("Language server lock poisoned"))
            }
        }
    }
}

pub struct Scope {
    id: Uuid,
    previous: Option<Context>,
    _thread: std::marker::PhantomData<std::rc::Rc<()>>,
}
impl Drop for Scope {
    fn drop(&mut self) {
        CURRENT.with(|context| {
            context.replace(self.previous.take());
        });
        if let Ok(mut requests) = REQUESTS.get_or_init(Default::default).lock() {
            requests.active.remove(&self.id);
        }
    }
}
fn register(root: &Path, id: Option<&str>, timeout: Duration) -> Result<(Uuid, Context)> {
    if super::lifecycle::gate().is_closing() {
        return Err(Stopped("App is shutting down.").into());
    }
    let id = match id {
        Some(id) => {
            Uuid::parse_str(id).map_err(|_| anyhow!("Language request identity must be a UUID."))?
        }
        None => Uuid::new_v4(),
    };
    let mut requests = REQUESTS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| anyhow!("Language request registry unavailable."))?;
    if requests.active.len() >= 128 || requests.active.contains_key(&id) {
        return Err(anyhow!(
            "Language request identity is active or the 128 request budget is exhausted."
        ));
    }
    requests
        .cancelled
        .retain(|_, (_, time)| time.elapsed() < Duration::from_secs(300));
    let cancelled = if let Some((cancelled_root, _)) = requests.cancelled.get(&id) {
        if cancelled_root != root {
            return Err(anyhow!(
                "Language cancellation belongs to a different workspace."
            ));
        }
        requests.cancelled.remove(&id);
        true
    } else {
        false
    };
    let token = Arc::new(AtomicBool::new(cancelled));
    requests
        .active
        .insert(id, (root.to_path_buf(), token.clone()));
    drop(requests);
    Ok((
        id,
        Context {
            cancelled: token,
            deadline: Instant::now() + timeout,
        },
    ))
}

/// Async startup authority can bind its same cancellation/deadline to a blocking SDK thread.
pub(crate) struct StartupRequest {
    id: Uuid,
    context: Context,
    completed: bool,
}
pub(crate) struct BoundContext {
    previous: Option<Context>,
    _thread: std::marker::PhantomData<std::rc::Rc<()>>,
}
impl Drop for BoundContext {
    fn drop(&mut self) {
        CURRENT.with(|current| {
            current.replace(self.previous.take());
        });
    }
}
impl StartupRequest {
    pub(crate) fn begin(root: &Path, id: &str, timeout: Duration) -> Result<Self> {
        let (id, context) = register(root, Some(id), timeout)?;
        let request = Self {
            id,
            context,
            completed: false,
        };
        request.check()?;
        Ok(request)
    }
    pub(crate) fn check(&self) -> Result<()> {
        if super::lifecycle::gate().is_closing() {
            return Err(Stopped("Startup cancelled for app shutdown.").into());
        }
        if self.context.cancelled.load(Ordering::Acquire) {
            return Err(Stopped("Execution startup cancelled.").into());
        }
        if Instant::now() >= self.context.deadline {
            return Err(Stopped("Execution startup exceeded its deadline.").into());
        }
        Ok(())
    }
    pub(crate) fn disarm(&mut self) {
        self.completed = true;
    }
    pub(crate) fn cancellation_token(&self) -> Arc<AtomicBool> {
        self.context.cancelled.clone()
    }
    pub(crate) async fn stopped(&self) -> anyhow::Error {
        loop {
            if let Err(error) = self.check() {
                return error;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }
    pub(crate) fn binder(&self) -> impl FnOnce() -> BoundContext + Send + 'static {
        let context = self.context.clone();
        move || BoundContext {
            previous: CURRENT.with(|current| current.replace(Some(context))),
            _thread: std::marker::PhantomData,
        }
    }
}
impl Drop for StartupRequest {
    fn drop(&mut self) {
        // Abandoned async callers cancel the still-owned blocking tool as well.
        if !self.completed {
            self.context.cancelled.store(true, Ordering::Release);
        }
        if let Ok(mut requests) = REQUESTS.get_or_init(Default::default).lock() {
            if let Some((root, _)) = requests.active.remove(&self.id) {
                requests
                    .cancelled
                    .retain(|_, (_, time)| time.elapsed() < Duration::from_secs(300));
                if requests.cancelled.len() >= 256 {
                    if let Some(oldest) = requests
                        .cancelled
                        .iter()
                        .min_by_key(|(_, (_, time))| *time)
                        .map(|(id, _)| *id)
                    {
                        requests.cancelled.remove(&oldest);
                    }
                }
                // Startup UUIDs are single-use, including successful acknowledgements.
                // Keep their root binding so a foreign late cancellation cannot poison cleanup.
                requests
                    .cancelled
                    .entry(self.id)
                    .or_insert((root, Instant::now()));
            }
        }
    }
}

pub fn begin(root: &Path, id: Option<&str>) -> Result<Scope> {
    begin_with_timeout(root, id, Duration::from_secs(45))
}
pub(crate) fn begin_with_timeout(
    root: &Path,
    id: Option<&str>,
    timeout: Duration,
) -> Result<Scope> {
    check()?;
    let (id, context) = register(root, id, timeout)?;
    let previous = CURRENT.with(|current| current.replace(Some(context)));
    Ok(Scope {
        id,
        previous,
        _thread: std::marker::PhantomData,
    })
}
pub fn cancel(root: &Path, id: &str) -> Result<bool> {
    let id =
        Uuid::parse_str(id).map_err(|_| anyhow!("Language request identity must be a UUID."))?;
    let mut requests = REQUESTS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| anyhow!("Language request registry unavailable."))?;
    if let Some((active_root, token)) = requests.active.get(&id) {
        if active_root != root {
            return Err(anyhow!(
                "Language request belongs to a different workspace."
            ));
        }
        token.store(true, Ordering::Release);
        return Ok(true);
    }
    // Cancellation can precede spawn_blocking registration. Retain a bounded
    // tombstone so a cancelled queued operation cannot start afterward.
    requests
        .cancelled
        .retain(|_, (_, time)| time.elapsed() < Duration::from_secs(300));
    if requests.cancelled.len() >= 256 {
        if let Some(oldest) = requests
            .cancelled
            .iter()
            .min_by_key(|(_, (_, time))| *time)
            .map(|(id, _)| *id)
        {
            requests.cancelled.remove(&oldest);
        }
    }
    if requests
        .cancelled
        .get(&id)
        .is_some_and(|(existing_root, _)| existing_root != root)
    {
        return Err(anyhow!(
            "Language cancellation belongs to a different workspace."
        ));
    }
    requests
        .cancelled
        .insert(id, (root.to_path_buf(), Instant::now()));
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn acknowledged_startup_disarms_abandonment_but_keeps_identity_scoped() {
        let root = Path::new("acknowledged-startup");
        let id = Uuid::new_v4().to_string();
        let mut startup = StartupRequest::begin(root, &id, Duration::from_secs(10)).unwrap();
        let token = startup.cancellation_token();
        startup.disarm();
        drop(startup);
        assert!(!token.load(Ordering::Acquire));
        assert!(StartupRequest::begin(root, &id, Duration::from_secs(10)).is_err());
        assert!(cancel(Path::new("foreign-ack-root"), &id).is_err());
        assert!(cancel(root, &id).unwrap());
    }
    #[tokio::test]
    async fn asynchronous_startup_wait_observes_a_shared_deadline() {
        let startup = StartupRequest::begin(
            Path::new("async-deadline"),
            &Uuid::new_v4().to_string(),
            Duration::from_millis(25),
        )
        .unwrap();
        let error = startup.stopped().await;
        assert!(is_deadline(&error));
    }
    #[test]
    fn startup_identity_cancels_bound_sdk_thread_and_abandonment() {
        let root = Path::new("startup-owner");
        let id = Uuid::new_v4().to_string();
        let startup = StartupRequest::begin(root, &id, Duration::from_secs(10)).unwrap();
        let bind = startup.binder();
        assert!(cancel(Path::new("foreign-root"), &id).is_err());
        assert!(StartupRequest::begin(root, &id, Duration::from_secs(10)).is_err());
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let _context = bind();
            assert!(check().is_ok());
            ready_tx.send(()).unwrap();
            let started = Instant::now();
            loop {
                if let Err(error) = check() {
                    assert!(is_stopped(&error));
                    break;
                }
                assert!(started.elapsed() < Duration::from_secs(2));
                std::thread::sleep(Duration::from_millis(5));
            }
        });
        ready_rx.recv().unwrap();
        drop(startup);
        worker.join().unwrap();
        let early = Uuid::new_v4().to_string();
        cancel(root, &early).unwrap();
        assert!(StartupRequest::begin(root, &early, Duration::from_secs(10)).is_err());
    }
    #[test]
    fn startup_deadline_applies_on_async_and_bound_threads() {
        let startup = StartupRequest::begin(
            Path::new("startup-deadline"),
            &Uuid::new_v4().to_string(),
            Duration::from_millis(20),
        )
        .unwrap();
        let bind = startup.binder();
        std::thread::sleep(Duration::from_millis(30));
        assert!(is_stopped(&startup.check().unwrap_err()));
        std::thread::spawn(move || {
            let _scope = bind();
            assert!(is_stopped(&check().unwrap_err()));
        })
        .join()
        .unwrap();
    }
    #[test]
    fn cancellation_is_scoped_and_also_covers_requests_not_registered_yet() {
        let id = Uuid::new_v4().to_string();
        let root = Path::new("repo");
        let scope = begin(root, Some(&id)).unwrap();
        assert!(cancel(Path::new("other"), &id).is_err());
        assert!(check().is_ok());
        assert!(cancel(root, &id).unwrap());
        assert!(is_stopped(&check().unwrap_err()));
        drop(scope);
        assert!(check().is_ok());
        let queued = Uuid::new_v4().to_string();
        cancel(root, &queued).unwrap();
        assert!(begin(Path::new("other"), Some(&queued)).is_err());
        let scope = begin(root, Some(&queued)).unwrap();
        assert!(is_stopped(&check().unwrap_err()));
        drop(scope);
        assert!(begin(root, Some("not-a-uuid")).is_err());
    }
    #[test]
    fn deadline_is_shared_and_dropping_a_scope_restores_the_thread_context() {
        let scope = begin_with_timeout(Path::new("repo"), None, Duration::ZERO).unwrap();
        assert!(deadline(Instant::now() + Duration::from_secs(60)) <= Instant::now());
        assert!(is_stopped(&check().unwrap_err()));
        drop(scope);
        assert!(check().is_ok());
    }
    #[test]
    fn a_pending_protocol_wait_observes_scoped_cancellation_promptly() {
        let id = Uuid::new_v4().to_string();
        let root = Path::new("protocol-test");
        let scope = begin(root, Some(&id)).unwrap();
        let thread = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            cancel(root, &id).unwrap();
        });
        let (_sender, receiver) = std::sync::mpsc::channel();
        let start = Instant::now();
        let result = super::super::lsp_manager::wait_lsp_response_until_sync(
            &receiver,
            1,
            start + Duration::from_secs(5),
        );
        assert!(is_stopped(&result.unwrap_err()));
        assert!(start.elapsed() < Duration::from_secs(1));
        thread.join().unwrap();
        drop(scope);
    }
}
