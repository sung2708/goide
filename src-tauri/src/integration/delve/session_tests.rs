use super::*;
use tokio::net::TcpListener;

async fn respond<W: AsyncWriteExt + Unpin>(stream: &mut W, request: &Value, body: Value) {
    write_dap_message(
        stream,
        &json!({
            "seq": 100, "type": "response", "success": true,
            "request_seq": request["seq"], "command": request["command"], "body": body
        }),
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn dap_configuration_done_observes_a_breakpoint_before_the_response() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let (read, mut write) = stream.into_split();
        let mut read = BufReader::new(read);
        let request = read_dap_message(&mut read).await.unwrap();
        write_dap_message(
            &mut write,
            &json!({ "seq": 10, "type": "response", "success": true,
                "request_seq": request["seq"], "command": "initialize",
                "body": { "supportsConfigurationDoneRequest": true }
            }),
        )
        .await
        .unwrap();
        let request = read_dap_message(&mut read).await.unwrap();
        assert_eq!(request["command"], "configurationDone");
        write_dap_message(
            &mut write,
            &json!({ "type": "event", "event": "stopped", "body": { "threadId": 7 } }),
        )
        .await
        .unwrap();
        write_dap_message(
            &mut write,
            &json!({ "seq": 11, "type": "response", "success": true,
                "request_seq": request["seq"], "command": "configurationDone"
            }),
        )
        .await
        .unwrap();
    });
    let mut client = DapClient::connect(addr).await.unwrap();
    client.initialize().await.unwrap();
    client.configuration_done().await.unwrap();
    assert_eq!(client.observed_pause(), Some(true));
    assert_eq!(client.observed_thread(), Some(7));
    server.await.unwrap();
}

#[tokio::test]
async fn dap_mismatched_response_poisoning_prevents_reusing_the_stream() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let (read, mut write) = stream.into_split();
        let mut read = BufReader::new(read);
        let request = read_dap_message(&mut read).await.unwrap();
        let mut wrong = request;
        wrong["command"] = json!("continue");
        respond(&mut write, &wrong, json!({})).await;
    });
    let mut client = DapClient::connect(addr).await.unwrap();
    assert!(client
        .threads()
        .await
        .unwrap_err()
        .to_string()
        .contains("does not match"));
    assert!(client.is_poisoned());
    assert!(client
        .threads()
        .await
        .unwrap_err()
        .to_string()
        .contains("incomplete"));
    server.await.unwrap();
}

#[tokio::test]
async fn dap_partial_frame_deadline_is_bounded() {
    let (mut write, read) = tokio::io::duplex(128);
    write
        .write_all(b"Content-Length: 20\r\n\r\n{\"")
        .await
        .unwrap();
    let mut read = BufReader::new(read);
    let deadline = tokio::time::Instant::now() + Duration::from_millis(50);
    assert!(read_response_until(&mut read, deadline, false)
        .await
        .unwrap_err()
        .to_string()
        .contains("deadline"));
}

#[tokio::test]
#[ignore = "requires installed Go and Delve; run explicitly with --include-ignored"]
async fn installed_delve_hits_an_actual_breakpoint_after_configuration_done() {
    let root = std::env::temp_dir().join(format!("goide-dap-real-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(
        root.join("go.mod"),
        "module example.com/dapfixture\n\ngo 1.22\n",
    )
    .unwrap();
    let root = root.canonicalize().unwrap();
    let main = root.join("main.go");
    std::fs::write(
        &main,
        "package main\nimport \"time\"\ntype Box struct { N int; Values []int }\nfunc inspect(box Box) {\n value := box.N + 1\n time.Sleep(time.Duration(value)*time.Second)\n}\nfunc main() { box := Box{N: 41, Values: []int{1,2,3}}; inspect(box) }\n",
    )
    .unwrap();
    let process = spawn_dlv_dap(&root).await.unwrap();
    let result: Result<()> = async {
        let mut client = DapClient::connect(process.listen_addr).await?;
        client.initialize().await?;
        client
            .launch(
                LaunchMode::Package {
                    package: ".".into(),
                    cwd: root.to_string_lossy().into(),
                },
                &root,
                &main,
            )
            .await?;
        client.set_breakpoints(&main, &[6]).await?;
        client.configuration_done().await?;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        loop {
            let _ = client.threads().await;
            if client.observed_pause() == Some(true) {
                break;
            }
            anyhow::ensure!(
                tokio::time::Instant::now() < deadline,
                "no actual stopped event"
            );
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        let thread = client
            .observed_thread()
            .context("stopped event missing thread")?;
        let frame = client
            .stack_trace(thread)
            .await?
            .context("missing stopped frame")?;
        anyhow::ensure!(frame.line == 6, "breakpoint source differs: {frame:?}");
        use inspection::{Output, Query};
        let token = client.stop_token().context("missing actual stop token")?;
        client.inspect(&token, Query::Threads, &root).await?;
        let Output::Stack { items: frames, .. } = client
            .inspect(&token, Query::Stack { thread_id: thread }, &root)
            .await?
        else {
            anyhow::bail!("missing stack");
        };
        let top = frames.first().context("missing actual call stack frame")?;
        anyhow::ensure!(
            top.name == "main.inspect" && top.relative_path.as_deref() == Some("main.go"),
            "unexpected real frame: {top:?}"
        );
        anyhow::ensure!(
            frames.iter().any(|frame| frame.name == "main.main"),
            "missing real calling frame"
        );
        let frame_id = top.id;
        let Output::Scopes { items: scopes, .. } = client
            .inspect(&token, Query::Scopes { frame_id }, &root)
            .await?
        else {
            anyhow::bail!("missing scopes");
        };
        let scope = scopes
            .iter()
            .find(|scope| scope.name.starts_with("Locals"))
            .context("missing actual locals scope")?;
        let Output::Variables { items: locals, .. } = client
            .inspect(
                &token,
                Query::Variables {
                    reference: scope.reference,
                    start: 0,
                    indexed: false,
                },
                &root,
            )
            .await?
        else {
            anyhow::bail!("missing locals");
        };
        anyhow::ensure!(
            locals
                .iter()
                .any(|value| value.name == "value" && value.value == "42"),
            "missing actual local alongside the box argument"
        );
        let box_value = locals
            .iter()
            .find(|value| value.name == "box")
            .context("missing actual box local")?;
        let Output::Variables {
            items: children, ..
        } = client
            .inspect(
                &token,
                Query::Variables {
                    reference: box_value.reference,
                    start: 0,
                    indexed: false,
                },
                &root,
            )
            .await?
        else {
            anyhow::bail!("missing nested values");
        };
        anyhow::ensure!(
            children
                .iter()
                .any(|value| value.name == "N" && value.value == "41"),
            "actual nested N value missing: {children:?}"
        );
        let values = children
            .iter()
            .find(|value| value.name == "Values")
            .context("missing actual slice")?;
        anyhow::ensure!(
            values.indexed_variables == Some(3),
            "unexpected actual slice size"
        );
        let Output::Variables {
            items: elements, ..
        } = client
            .inspect(
                &token,
                Query::Variables {
                    reference: values.reference,
                    start: 0,
                    indexed: true,
                },
                &root,
            )
            .await?
        else {
            anyhow::bail!("missing slice values");
        };
        anyhow::ensure!(
            elements
                .iter()
                .map(|value| value.value.as_str())
                .collect::<Vec<_>>()
                == vec!["1", "2", "3"],
            "wrong actual slice values"
        );
        client.continue_thread(thread).await?;
        anyhow::ensure!(
            client
                .inspect(&token, Query::Scopes { frame_id }, &root)
                .await
                .is_err(),
            "obsolete stop retained frame access"
        );
        client.disconnect().await?;
        Ok(())
    }
    .await;
    let cleanup = process.owner.stop().await;
    std::fs::remove_dir_all(&root).unwrap();
    cleanup.unwrap();
    result.unwrap();
}

#[tokio::test]
async fn test_package_launch_uses_build_directory_and_exact_filter() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let (read, mut write) = stream.into_split();
        let mut read = BufReader::new(read);
        let request = read_dap_message(&mut read).await.unwrap();
        let args = &request["arguments"];
        assert_eq!(args["mode"], "test");
        assert_eq!(args["program"], ".");
        assert_eq!(args["cwd"], "/scoped/module/checks");
        assert_eq!(args["dlvCwd"], "/scoped/module/checks");
        assert_eq!(
            args["args"],
            json!(["-test.run", "^TestSelected$", "-test.count=1"])
        );
        assert_eq!(args["env"]["GOWORK"], "off");
        assert_eq!(args["env"]["GOFLAGS"], "");
        respond(&mut write, &request, json!({})).await;
    });
    let mut client = DapClient::connect(addr).await.unwrap();
    client
        .launch(
            LaunchMode::TestPackage {
                cwd: "/scoped/module/checks".into(),
                filter: Some("^TestSelected$".into()),
                work: None,
            },
            Path::new("/unused"),
            Path::new("/unused"),
        )
        .await
        .unwrap();
    server.await.unwrap();
}
