import { spawn } from "node:child_process";

function looksLikeZig(value) {
  if (!value) return false;
  return /\bzig(\.exe)?\b/i.test(value);
}

function unsetIfZig(env, key) {
  if (looksLikeZig(env[key])) {
    delete env[key];
  }
}

const env = { ...process.env };

// Some environments set CC/CXX to `zig cc` / `zig c++`, which breaks crates that
// pass Rust target triples like `x86_64-pc-windows-msvc` through to the C/C++
// compiler. If the compiler is Zig, drop these overrides and let Cargo pick the
// normal Windows toolchain.
unsetIfZig(env, "CC");
unsetIfZig(env, "CXX");
unsetIfZig(env, "HOST_CC");
unsetIfZig(env, "HOST_CXX");
unsetIfZig(env, "CC_x86_64_pc_windows_msvc");
unsetIfZig(env, "CXX_x86_64_pc_windows_msvc");
unsetIfZig(env, "CC_x86_64-pc-windows-msvc");
unsetIfZig(env, "CXX_x86_64-pc-windows-msvc");

const args = process.argv.slice(2);

let cmd = "tauri";
let spawnArgs = args;

if (process.platform === "win32") {
  // On Windows, `tauri` is typically a `.cmd` shim in `node_modules/.bin`.
  // Running through `cmd.exe` avoids Node's `.cmd` spawning quirks and keeps
  // logs free of `shell:true` deprecation warnings.
  cmd = process.env.ComSpec || "cmd.exe";
  spawnArgs = ["/d", "/s", "/c", "tauri", ...args];
}

const child = spawn(cmd, spawnArgs, { stdio: "inherit", env });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
