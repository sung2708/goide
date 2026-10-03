# Security Policy

The Goro project takes security vulnerabilities seriously. We appreciate the responsible disclosure of security issues by researchers, developers, and users.

---

## Supported Versions

Because Goro is currently on a pre-1.0 stabilization track, security patches are actively applied to the latest development branch and released in subsequent pre-release/minor tags.

| Version Track | Supported | Notes |
|:---|:---:|:---|
| `main` (latest commit) | :white_check_mark: | Active development |
| `0.x.y` pre-releases | :white_check_mark: | Latest published pre-release |
| Legacy prototype tags (`1.0.x`, `1.1`) | :x: | Obsolete exploratory prototypes |

---

## Reporting a Vulnerability

**DO NOT report suspected security vulnerabilities through public GitHub Issues, discussions, or pull requests.**

To report a vulnerability privately:

1. Use **GitHub Private Vulnerability Reporting**:
   Navigate to [Security Advisories](https://github.com/sung2708/goide/security/advisories/new) and submit a confidential advisory report.
2. If GitHub Advisory reporting is unavailable in your browser, contact the maintainer privately via GitHub profile contact information.

### What to Include in Your Report

To help us triage and resolve the issue quickly, please provide:
- **Goro Version**: Exact release tag or Git commit hash.
- **Operating System and Architecture**: Windows, macOS, or Linux (x86_64 or aarch64).
- **Vulnerability Description**: Type of vulnerability (e.g., command injection, arbitrary path traversal, memory unsafety).
- **Proof of Concept / Reproduction**: Clear, step-by-step instructions or minimal project demonstrating the issue.
- **Impact Assessment**: What an attacker could achieve if this vulnerability were exploited.
- **Mitigation / Suggested Fix**: If you have identified a code correction or workaround.

---

## Response Process & SLA

1. **Initial Acknowledgement**: We aim to acknowledge receipt of vulnerability reports within **48 hours**.
2. **Assessment & Triage**: Within **5 business days**, we will validate the report, evaluate its severity using CVSS metrics, and confirm whether it qualifies as a security advisory.
3. **Resolution & Patch**: Once verified, we will develop and test a fix in a private fork.
4. **Coordinated Disclosure**: A public advisory and patched release will be coordinated with the reporter. Standard embargo periods are typically 30 to 90 days depending on complexity.

---

## Architectural Security Considerations

Goro combines a Web frontend (React / Vite) with a native Rust backend (Tauri v2). Maintainers and contributors must respect these architectural boundaries:

### 1. Tauri Content Security Policy (CSP)
The application window operates under a strict CSP configured in `src-tauri/tauri.conf.json`:
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: https://asset.localhost data:; font-src 'self'; connect-src 'self' ipc: http://ipc.localhost
```
Remote network access from the webview is prohibited; network communication is routed exclusively through native Rust IPC handlers.

### 2. Process Execution & Command Sanitization
- Goro executes local binaries (`go`, `gopls`, `dlv`) on behalf of the user.
- Subprocesses are spawned directly using `std::process::Command` / `tokio::process::Command` without passing strings to an intermediate shell interpreter (`cmd.exe` or `/bin/sh`), preventing shell injection attacks.
- Arguments are explicitly structured as individual strings rather than concatenated command lines.

### 3. Filesystem Sandboxing & Path Traversal
- File reading, writing, renaming, and deletion commands in `src-tauri/src/ui_bridge/commands.rs` validate that target paths resolve within the active workspace root.
- Relative paths are normalized using canonicalization checks to prevent directory traversal (`../`) attacks across workspace boundaries.

### 4. Terminal PTY Isolation
- Integrated terminal sessions use `portable-pty` to spawn user shells (PowerShell, bash, zsh).
- PTY streams are strictly bound to the local desktop session and communicate with the frontend via typed IPC events.

### 5. Binary Artifact Integrity
- Every release artifact published on GitHub Releases is accompanied by cryptographic SHA-256 checksums in `SHA256SUMS.txt`.
- Users and package maintainers should verify binary hashes against the published checksum manifest prior to installation.
