//! Serialize process registration against final app shutdown.
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, OnceLock,
};
use tokio::sync::{Mutex, OwnedMutexGuard};

#[derive(Default)]
pub struct LifecycleGate {
    closing: AtomicBool,
    lock: Arc<Mutex<()>>,
}
impl LifecycleGate {
    pub fn is_closing(&self) -> bool {
        self.closing.load(Ordering::Acquire)
    }
    pub async fn operation(&self) -> Result<OwnedMutexGuard<()>, String> {
        let guard = self.lock.clone().lock_owned().await;
        if self.closing.load(Ordering::Acquire) {
            return Err("GoIDE is shutting down; no new process can start.".into());
        }
        Ok(guard)
    }
    pub async fn shutdown(&self) -> OwnedMutexGuard<()> {
        self.closing.store(true, Ordering::Release);
        self.lock.clone().lock_owned().await
    }
}
pub fn gate() -> &'static LifecycleGate {
    static GATE: OnceLock<LifecycleGate> = OnceLock::new();
    GATE.get_or_init(Default::default)
}
static CLOSED: AtomicBool = AtomicBool::new(false);
pub fn approve_exit() {
    CLOSED.store(true, Ordering::Release);
}
pub fn exit_approved() -> bool {
    CLOSED.load(Ordering::Acquire)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn shutdown_waits_for_registration_and_rejects_late_starts() {
        let gate = Arc::new(LifecycleGate::default());
        let registration = gate.operation().await.unwrap();
        let other = gate.clone();
        let shutdown = tokio::spawn(async move {
            let _guard = other.shutdown().await;
        });
        tokio::task::yield_now().await;
        assert!(!shutdown.is_finished());
        drop(registration);
        shutdown.await.unwrap();
        assert!(gate.operation().await.is_err());
        drop(gate.shutdown().await);
    }

    #[tokio::test]
    async fn timed_out_shutdown_keeps_the_start_gate_closed_and_allows_cleanup_retry() {
        let gate = LifecycleGate::default();
        let registration = gate.operation().await.unwrap();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(25), gate.shutdown())
                .await
                .is_err()
        );
        assert!(gate.is_closing());
        drop(registration);
        assert!(gate.operation().await.is_err());
        drop(gate.shutdown().await);
        assert!(gate.operation().await.is_err());
    }
}
