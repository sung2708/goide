use super::*;
use crate::integration::delve::{read_dap_message, write_dap_message};
use tokio::io::BufReader;
use tokio::net::TcpListener;

#[tokio::test]
async fn dap_inspection_expands_issued_values_and_rejects_handles_after_continue() {
    let root = std::env::temp_dir().join(format!("goide-inspection-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("main.go"), "package main\nfunc main() {}\n").unwrap();
    let root = root.canonicalize().unwrap();
    let source = root.join("main.go").to_string_lossy().to_string();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let (read, mut write) = stream.into_split();
        let mut read = BufReader::new(read);
        for (index, command) in [
            "threads",
            "threads",
            "stackTrace",
            "scopes",
            "variables",
            "variables",
            "continue",
            "threads",
        ]
        .into_iter()
        .enumerate()
        {
            let request = read_dap_message(&mut read).await.unwrap();
            assert_eq!(request["command"], command);
            let body = match command {
                "threads" => {
                    if index == 0 || index == 7 {
                        write_dap_message(&mut write, &json!({ "type": "event", "event": "stopped", "body": { "threadId": 1 } })).await.unwrap();
                    }
                    json!({ "threads": [{ "id": 1, "name": "[Go 1] main.main" }] })
                }
                "stackTrace" => {
                    json!({ "stackFrames": [{ "id": 10, "name": "main.main", "source": { "path": source }, "line": 2, "column": 1 }], "totalFrames": 1 })
                }
                "scopes" => {
                    json!({ "scopes": [{ "name": "Locals", "variablesReference": 20, "expensive": false }] })
                }
                "variables" if request["arguments"]["variablesReference"] == 20 => {
                    json!({ "variables": [{ "name": "box", "type": "main.Box", "value": "main.Box {N: 41}", "variablesReference": 21 }] })
                }
                "variables" => {
                    json!({ "variables": [{ "name": "N", "type": "int", "value": "41", "variablesReference": 0 }] })
                }
                _ => json!({}),
            };
            write_dap_message(&mut write, &json!({ "type": "response", "request_seq": request["seq"], "command": command, "success": true, "body": body })).await.unwrap();
        }
    });
    let mut client = DapClient::connect(addr).await.unwrap();
    client
        .execution
        .observe(&json!({ "event": "stopped", "body": { "threadId": 1 } }));
    // No unissued frame or variable request may reach the transport.
    let initial = client.stop_token().unwrap();
    assert!(client
        .inspect(&initial, Query::Scopes { frame_id: 10 }, &root)
        .await
        .is_err());
    // Consume the newly observed stopped event before capturing its token.
    client.threads().await.unwrap();
    let token = client.stop_token().unwrap();
    client.inspect(&token, Query::Threads, &root).await.unwrap();
    let output = client
        .inspect(&token, Query::Stack { thread_id: 1 }, &root)
        .await
        .unwrap();
    let Output::Stack { items, .. } = output else {
        panic!("expected stack");
    };
    assert_eq!(items[0].relative_path.as_deref(), Some("main.go"));
    client
        .inspect(&token, Query::Scopes { frame_id: 10 }, &root)
        .await
        .unwrap();
    let Output::Variables { items, .. } = client
        .inspect(
            &token,
            Query::Variables {
                reference: 20,
                start: 0,
                indexed: false,
            },
            &root,
        )
        .await
        .unwrap()
    else {
        panic!("expected variables");
    };
    assert_eq!(items[0].name, "box");
    assert_eq!(items[0].reference, 21);
    let Output::Variables { items, .. } = client
        .inspect(
            &token,
            Query::Variables {
                reference: 21,
                start: 0,
                indexed: false,
            },
            &root,
        )
        .await
        .unwrap()
    else {
        panic!("expected nested variables");
    };
    assert_eq!(items[0].value, "41");
    client.continue_thread(1).await.unwrap();
    assert!(client.stop_token().is_none());
    assert!(client
        .inspect(&token, Query::Scopes { frame_id: 10 }, &root)
        .await
        .is_err());
    client.threads().await.unwrap();
    let fresh = client.stop_token().unwrap();
    assert_ne!(fresh, token);
    assert!(client
        .inspect(
            &fresh,
            Query::Variables {
                reference: 21,
                start: 0,
                indexed: false
            },
            &root
        )
        .await
        .is_err());
    server.await.unwrap();
    std::fs::remove_dir_all(root).unwrap();
}

#[tokio::test]
async fn continued_event_invalidates_an_inflight_variable_response() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let (read, mut write) = stream.into_split();
        let mut read = BufReader::new(read);
        let request = read_dap_message(&mut read).await.unwrap();
        write_dap_message(
            &mut write,
            &json!({ "type": "event", "event": "continued" }),
        )
        .await
        .unwrap();
        write_dap_message(&mut write, &json!({ "type": "response", "command": "variables", "request_seq": request["seq"], "success": true, "body": { "variables": [{ "name": "old", "value": "stale", "variablesReference": 99 }] } })).await.unwrap();
    });
    let mut client = DapClient::connect(addr).await.unwrap();
    client
        .execution
        .observe(&json!({ "event": "stopped", "body": { "threadId": 1 } }));
    let token = client.stop_token().unwrap();
    client.verify_stop(&token).unwrap();
    client.issue_reference(20, None).unwrap();
    let result = client
        .inspect(
            &token,
            Query::Variables {
                reference: 20,
                start: 0,
                indexed: false,
            },
            Path::new("."),
        )
        .await;
    assert!(result.unwrap_err().to_string().contains("stop changed"));
    assert!(!client.access.references.contains_key(&99));
    server.await.unwrap();
}

#[test]
fn frame_navigation_never_escapes_the_canonical_workspace() {
    let base = std::env::temp_dir().join(format!("goide-source-scope-{}", uuid::Uuid::new_v4()));
    let root = base.join("workspace");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("inside.go"), "package main").unwrap();
    std::fs::write(base.join("outside.go"), "package outside").unwrap();
    let root = root.canonicalize().unwrap();
    assert_eq!(
        scoped_source("inside.go", &root).as_deref(),
        Some("inside.go")
    );
    assert!(scoped_source("../outside.go", &root).is_none());
    assert!(scoped_source(&base.join("outside.go").to_string_lossy(), &root).is_none());
    std::fs::remove_dir_all(base).unwrap();
}
