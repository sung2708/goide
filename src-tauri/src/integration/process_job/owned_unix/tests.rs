use super::*;
use std::process::Stdio;

async fn child() -> OwnedChild {
    let mut command = tokio::process::Command::new("sleep");
    command
        .arg("60")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    OwnedChild::spawn(&mut command, || Ok(())).await.unwrap()
}
#[tokio::test]
async fn transient_permission_denial_retries_without_losing_the_owned_leader() {
    retry_cleanup().await.unwrap();
    let mut foreign = child().await;
    let mut owned = child().await;
    let identity = owned.identity();
    owned.resources_mut().group.deny_next_signal_for_test();
    owned.stop().await.unwrap();
    assert_eq!(owned.identity(), identity);
    assert!(owned.resources().stopped);
    owned.stop().await.unwrap();
    drop(owned);
    assert!(!is_pending());
    assert!(foreign.try_wait().unwrap().is_none());
    foreign.stop().await.unwrap();
}
#[tokio::test]
async fn cancelled_group_cleanup_retains_child_and_uuid_until_confirmed_retry() {
    retry_cleanup().await.unwrap();
    let mut foreign = child().await;
    let owned = child().await;
    let identity = owned.identity();
    drop(owned);
    assert!(is_pending());
    pending()
        .lock()
        .unwrap()
        .last_mut()
        .unwrap()
        .pause_next_stop = true;
    assert!(
        tokio::time::timeout(Duration::from_millis(20), retry_cleanup())
            .await
            .is_err()
    );
    assert!(is_pending());
    assert_eq!(pending().lock().unwrap().last().unwrap().identity, identity);
    assert!(foreign.try_wait().unwrap().is_none());
    retry_cleanup().await.unwrap();
    assert!(!is_pending());
    assert!(foreign.try_wait().unwrap().is_none());
    foreign.stop().await.unwrap();
}
#[tokio::test]
async fn natural_async_exit_retires_descendants_and_cannot_resignal_after_stop() {
    retry_cleanup().await.unwrap();
    let mut foreign = child().await;
    let mut command = tokio::process::Command::new("sh");
    command
        .args(["-c", "sleep 60 & exit 9"])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut owned = OwnedChild::spawn(&mut command, || Ok(())).await.unwrap();
    let status = tokio::time::timeout(Duration::from_secs(10), owned.wait())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(status.code(), Some(9));
    owned.stop().await.unwrap();
    owned.stop().await.unwrap();
    drop(owned);
    assert!(!is_pending());
    assert!(foreign.try_wait().unwrap().is_none());
    foreign.stop().await.unwrap();
}
