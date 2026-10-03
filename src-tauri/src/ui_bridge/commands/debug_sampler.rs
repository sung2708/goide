use super::{DapClient, DapSessionHandle, RuntimeSignalStore};
use std::sync::Arc;
use tokio::sync::Mutex;

// Natural exit and transport failure share the same ownership retirement path.
// Mark transfer under the slot lock so neither UI nor a new start sees an idle
// gap before the process and readers are actually stopped.
pub(super) async fn retire(
    client: &mut DapClient,
    sessions: &Arc<Mutex<Option<DapSessionHandle>>>,
    signals: &Arc<Mutex<RuntimeSignalStore>>,
    identity: uuid::Uuid,
) {
    let session = {
        let mut slot = sessions.lock().await;
        if slot.as_ref().map(|session| session.owner.identity()) != Some(identity) {
            return;
        }
        if let Some(session) = slot.as_mut() {
            session.owner.mark_cleanup_pending();
        }
        slot.take()
    };
    let Some(session) = session else {
        return;
    };
    {
        let mut store = signals.lock().await;
        store.signals.clear();
        store.healthy = false;
        store.paused = false;
        store.active_relative_path = None;
        store.active_line = None;
        store.active_column = None;
        store.active_thread_id = None;
        store.stop_token = None;
    }
    let _ = client.disconnect().await;
    // This is the sampler itself; joining its own handle would deadlock. All
    // actual pipe workers remain attached to the process owner through retry.
    let _ = session.owner.stop().await;
}
