import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createGoWorkspace, openFile, openWorkspace } from "../support/workspace.js";

// P0 process ownership: Stop must end the program Goro started and everything
// it spawned. `go run` puts the program two levels below Goro, and this program
// adds a third level, so a leak at any level shows up as a live PID.
const program = (pidDir: string) => `package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"
)

func record(name string) {
	_ = os.WriteFile(filepath.Join(${JSON.stringify(pidDir)}, name), []byte(strconv.Itoa(os.Getpid())), 0o644)
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "child" {
		record("child.pid")
		time.Sleep(time.Hour)
		return
	}
	child := exec.Command(os.Args[0], "child")
	if err := child.Start(); err != nil {
		panic(err)
	}
	record("parent.pid")
	println("E2E-RUNNING")
	time.Sleep(time.Hour)
}
`;

function goAvailable() {
  try {
    execFileSync("go", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

describe("Run and Stop", function () {
  let workspace: ReturnType<typeof createGoWorkspace>;
  const pid = (name: string) => Number(readFileSync(join(workspace.root, name), "utf8"));

  before(async function () {
    if (!goAvailable()) {
      // CI installs Go; a local machine without it cannot run this spec.
      if (process.env.CI) throw new Error("Go is required for the Run/Stop e2e spec in CI");
      this.skip();
    }
    workspace = createGoWorkspace();
    workspace.write("main.go", program(workspace.root));
    await openWorkspace(workspace.root, { "files.autoSave": "off" });
    await openFile("main.go");
  });

  after(() => workspace?.dispose());

  it("starts the program and its child process", async () => {
    await $('button[aria-label="Run Go file"]').click();
    await browser.waitUntil(() => existsSync(join(workspace.root, "parent.pid")) && existsSync(join(workspace.root, "child.pid")), {
      timeout: 120_000, // first `go run` compiles
      timeoutMsg: "the Go program did not start",
    });
    expect(alive(pid("parent.pid"))).toBe(true);
    expect(alive(pid("child.pid"))).toBe(true);
    await expect($('button[aria-label="Stop Go run"]')).toBeDisplayed();
  });

  it("Stop ends the program and every descendant", async () => {
    const parent = pid("parent.pid");
    const child = pid("child.pid");
    await $('button[aria-label="Stop Go run"]').click();
    await $('button[aria-label="Run Go file"]').waitForDisplayed({ timeout: 30_000 });
    await browser.waitUntil(() => !alive(parent) && !alive(child), {
      timeout: 15_000,
      timeoutMsg: `still running after Stop: parent=${alive(parent)} child=${alive(child)}`,
    });
  });
});
