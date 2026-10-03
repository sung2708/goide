# Local portable-pty patch

Source: portable-pty 0.8.1 from crates.io, upstream https://github.com/wez/wezterm. The upstream MIT license is retained in LICENSE.md.

Only Windows ConPTY adds an explicit `SlavePty::spawn_command_in_job` API with an owned job handle. `PROC_THREAD_ATTRIBUTE_JOB_LIST` registers membership during CreateProcess, before the first instruction. Unsupported implementations fail without spawning. Attribute value/handle lifetimes extend through attribute destruction. Opaque attribute storage is initialized and pointer-aligned. Other platforms retain upstream spawn behavior.

Windows attribute contract: https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute

Review the local delta when upgrading upstream; do not replace this path with an unpatched registry dependency.
