$lines = Get-Content 'src\integration\process.rs'
$newCode = @(
    "#[cfg(windows)]",
    "async fn kill_process_group(child: &mut Child) {",
    "    if let Some(pid) = child.id() {",
    "        let _ = std::process::Command::new(""taskkill"")",
    "            .arg(""/F"")",
    "            .arg(""/T"")",
    "            .arg(""/PID"")",
    "            .arg(pid.to_string())",
    "            .output();",
    "    }",
    "}",
    "",
    "#[cfg(not(windows))]",
    "async fn kill_process_group(child: &mut Child) {",
    "    let _ = child.kill().await;",
    "}"
)
$result = $lines[0..62] + $newCode + $lines[63..($lines.Length-1)]
$result = $result -replace 'let _ = child.kill\(\).await;', 'kill_process_group(child).await;'
$result | Set-Content 'src\integration\process.rs'
