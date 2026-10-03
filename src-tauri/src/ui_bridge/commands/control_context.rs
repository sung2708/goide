use super::*;
use crate::ui_bridge::types::DebuggerControlContextDto;

pub(super) fn validate_identity(
    context: &DebuggerControlContextDto,
    requested_root: &Path,
    session_root: &Path,
    session_id: uuid::Uuid,
) -> Result<(), String> {
    if requested_root != session_root || context.session_id != session_id.to_string() {
        return Err("Debugger session changed; refresh observed state before retrying.".into());
    }
    Ok(())
}

pub(super) fn validate_execution(
    client: &DapClient,
    kind: &DebuggerControlKind,
    context: &DebuggerControlContextDto,
) -> Result<(), String> {
    if client.is_poisoned() || client.has_terminated() {
        return Err(
            "Debugger transport or target is no longer active; Stop before restarting.".into(),
        );
    }
    match kind {
        DebuggerControlKind::Pause => {
            if context.stop_token.is_some() || client.observed_pause() != Some(false) {
                return Err(
                    "Debugger state changed; Pause requires an observed running target.".into(),
                );
            }
        }
        DebuggerControlKind::Continue
        | DebuggerControlKind::StepOver
        | DebuggerControlKind::StepInto
        | DebuggerControlKind::StepOut => {
            if context.stop_token.is_none() || context.stop_token != client.stop_token() {
                return Err("Debugger stop changed; refresh before continuing or stepping.".into());
            }
        }
        DebuggerControlKind::ToggleBreakpoint { .. } => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn control_validation_tracks_events_consumed_during_adapter_reads() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let (reader, mut writer) = stream.into_split();
            let mut reader = BufReader::new(reader);
            for event in [
                json!({ "event": "stopped", "body": { "threadId": 7 } }),
                json!({ "event": "stopped", "body": { "threadId": 8 } }),
                json!({ "event": "continued" }),
                json!({ "event": "exited" }),
            ] {
                let mut length = 0;
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).await.unwrap();
                    if line == "\r\n" {
                        break;
                    }
                    if let Some(value) = line.strip_prefix("Content-Length: ") {
                        length = value.trim().parse::<usize>().unwrap();
                    }
                }
                assert!(length > 0 && length < 8192);
                let mut body = vec![0; length];
                reader.read_exact(&mut body).await.unwrap();
                let request: serde_json::Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(request["command"], "threads");
                let mut event = event;
                event["type"] = json!("event");
                let response = json!({ "type": "response", "request_seq": request["seq"], "command": "threads", "success": true, "body": { "threads": [{ "id": 7, "name": "main.main" }] } });
                for message in [event, response] {
                    let body = serde_json::to_vec(&message).unwrap();
                    writer
                        .write_all(format!("Content-Length: {}\r\n\r\n", body.len()).as_bytes())
                        .await
                        .unwrap();
                    writer.write_all(&body).await.unwrap();
                }
            }
        });
        let mut client = DapClient::connect(address).await.unwrap();
        client.threads().await.unwrap();
        let context = DebuggerControlContextDto {
            workspace_root: "root".into(),
            session_id: uuid::Uuid::new_v4().to_string(),
            stop_token: client.stop_token(),
        };
        assert!(validate_execution(&client, &DebuggerControlKind::StepOver, &context).is_ok());
        client.threads().await.unwrap();
        assert!(validate_execution(&client, &DebuggerControlKind::StepOver, &context).is_err());
        let next = DebuggerControlContextDto {
            stop_token: client.stop_token(),
            ..context
        };
        assert!(validate_execution(&client, &DebuggerControlKind::Continue, &next).is_ok());
        client.threads().await.unwrap();
        assert!(validate_execution(&client, &DebuggerControlKind::Continue, &next).is_err());
        let running = DebuggerControlContextDto {
            stop_token: None,
            ..next
        };
        assert!(validate_execution(&client, &DebuggerControlKind::Pause, &running).is_ok());
        client.threads().await.unwrap();
        assert!(validate_execution(&client, &DebuggerControlKind::Pause, &running).is_err());
        server.await.unwrap();
    }
    #[test]
    fn a_matching_path_cannot_authorize_a_replaced_session() {
        let owner = uuid::Uuid::new_v4();
        let mut context = DebuggerControlContextDto {
            workspace_root: "root".into(),
            session_id: owner.to_string(),
            stop_token: None,
        };
        let root = Path::new("root");
        assert!(validate_identity(&context, root, root, owner).is_ok());
        assert!(validate_identity(&context, Path::new("other"), root, owner).is_err());
        context.session_id = uuid::Uuid::new_v4().to_string();
        assert!(validate_identity(&context, root, root, owner).is_err());
    }
}
