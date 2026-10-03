import { execFileSync } from "node:child_process";
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
try {
  const event = process.env.RELEASE_EVENT;
  const ref = process.env.RELEASE_REF;
  const tag = process.env.RELEASE_TAG;
  if (!/^v[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(tag || "")) throw new Error("Invalid release tag");
  if (event === "workflow_dispatch") {
    if (ref !== "refs/heads/main") throw new Error("Release dispatch must run from main");
  } else if (event !== "push" || ref !== `refs/tags/${tag}`) throw new Error("Release requires a matching tag push or main dispatch");
  git("merge-base", "--is-ancestor", "HEAD", "origin/main");
  let tagged;
  try { tagged = git("rev-parse", "--verify", `refs/tags/${tag}^{commit}`); } catch { /* An untagged manual candidate is allowed. */ }
  if (event === "push" && !tagged) throw new Error("Pushed release tag is missing");
  if (tagged && tagged !== git("rev-parse", "HEAD")) throw new Error("Existing tag must identify this exact candidate; rerun the original tag workflow instead");
  console.log("Verified exact candidate belongs to main.");
} catch (error) { console.error(`Release ref rejected: ${error.message}`); process.exitCode = 1; }
