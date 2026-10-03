use super::*;
#[test]
fn runtime_version_channel_and_no_downgrades_are_rechecked_before_download_and_install() {
    let store = Store::new(Version::parse("1.0.0").unwrap());
    let mut state = store.snapshot().unwrap();
    state.channel = Channel::Alpha;
    state.release = Some(Release {
        version: "1.1.0-alpha.1".into(),
        notes: String::new(),
        published_at: None,
    });
    assert!(require_selected_channel(&state, None).is_err());
    assert!(require_selected_channel(&state, Some(Channel::Alpha)).is_ok());
    state.release.as_mut().unwrap().version = "0.9.0".into();
    assert!(require_selected_channel(&state, Some(Channel::Alpha)).is_err());
    state.release.as_mut().unwrap().version = "invalid".into();
    assert!(require_selected_channel(&state, Some(Channel::Alpha)).is_err());
    state.release.as_mut().unwrap().version = "1.0.0+new-build".into();
    assert!(require_selected_channel(&state, Some(Channel::Alpha)).is_err());
    state.channel = Channel::Stable;
    state.release.as_mut().unwrap().version = "1.1.0-alpha.1".into();
    assert!(require_selected_channel(&state, Some(Channel::Stable)).is_err());
}
#[test]
fn updater_failures_are_typed_sanitized_and_signature_errors_never_become_network_errors() {
    use tauri_plugin_updater::Error as E;
    assert_eq!(
        plugin_error(E::MissingSignedVersion, false).code,
        "update_signature"
    );
    assert_eq!(
        plugin_error(
            E::SignedVersionMismatch {
                signed: "1.0.0".into(),
                announced: "1.1.0".into()
            },
            false
        )
        .code,
        "update_signature"
    );
    let error = plugin_error(
        E::Network("https://token:private@secret.example/?secret=x".into()),
        false,
    );
    assert_eq!(error.code, "update_network");
    assert!(!error.message.contains("secret"));
    assert_eq!(
        plugin_error(E::UnsupportedOs, false).code,
        "update_platform"
    );
    assert_eq!(
        plugin_error(E::Network("private".into()), true).code,
        "update_install"
    );
}
#[tokio::test]
async fn native_operation_lock_rejects_parallel_work_and_drops_for_retry() {
    let store = Store::new(Version::parse("0.2.0-alpha.1").unwrap());
    let first = store.operation.try_lock().unwrap();
    assert!(store.operation.try_lock().is_err());
    drop(first);
    assert!(store.operation.try_lock().is_ok());
    assert_eq!(store.snapshot().unwrap().channel, Channel::Alpha);
    assert_eq!(store.snapshot().unwrap().phase, Phase::Idle);
}
