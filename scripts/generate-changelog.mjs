#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const CHANGELOG_PATH = resolve(ROOT_DIR, "CHANGELOG.md");
const REPO_URL = "https://github.com/sung2708/goide";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tag: null,
    from: null,
    to: "HEAD",
    output: null,
    prepend: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tag" && args[i + 1]) {
      options.tag = args[++i];
    } else if (args[i] === "--from" && args[i + 1]) {
      options.from = args[++i];
    } else if (args[i] === "--to" && args[i + 1]) {
      options.to = args[++i];
    } else if (args[i] === "--output" && args[i + 1]) {
      options.output = args[++i];
    } else if (args[i] === "--prepend-changelog") {
      options.prepend = true;
    }
  }

  return options;
}

function getPreviousTag(targetRef) {
  try {
    const prev = execSync(`git describe --tags --abbrev=0 ${targetRef}^ 2>/dev/null`, {
      encoding: "utf8",
      cwd: ROOT_DIR,
    }).trim();
    return prev;
  } catch {
    return null;
  }
}

function getCommits(from, to) {
  const range = from ? `${from}..${to}` : to;
  const raw = execSync(`git log ${range} --format="%H%x1f%s%x1f%b%x1e"`, {
    encoding: "utf8",
    cwd: ROOT_DIR,
  });

  const records = raw
    .split("\x1e")
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return records.map((record) => {
    const [hash, subject, body = ""] = record.split("\x1f");
    return {
      hash: hash?.trim(),
      shortHash: hash?.trim().slice(0, 7),
      subject: subject?.trim() || "",
      body: body?.trim() || "",
    };
  });
}

function categorizeCommits(commits) {
  const categories = {
    breaking: [],
    feat: [],
    fix: [],
    perf: [],
    refactor: [],
    docs: [],
    test: [],
    sec: [],
    build: [],
    deps: [],
  };

  const noisePatterns = [
    /^merge\s+/i,
    /^chore:\s*(release|prepare\s+v|bump|version|remove\s+superpowers)/i,
    /^release:\s*/i,
  ];

  for (const commit of commits) {
    const isNoise = noisePatterns.some((pattern) => pattern.test(commit.subject));
    if (isNoise && !commit.subject.includes("feat") && !commit.subject.includes("fix")) {
      continue;
    }

    const isBreaking =
      /^[a-z]+(\([^\)]+\))?!:/.test(commit.subject) ||
      commit.body.includes("BREAKING CHANGE:") ||
      commit.body.includes("BREAKING-CHANGE:");

    if (isBreaking) {
      categories.breaking.push(commit);
    }

    const convMatch = commit.subject.match(/^([a-z]+)(?:\(([^\)]+)\))?!?:\s*(.+)$/i);
    if (!convMatch) {
      // Loose categorization for older non-conventional commits
      const lower = commit.subject.toLowerCase();
      if (lower.startsWith("implement ") || lower.startsWith("add ")) {
        categories.feat.push(commit);
      } else if (lower.startsWith("fix:") || lower.startsWith("fix")) {
        categories.fix.push(commit);
      } else if (lower.startsWith("enhance ")) {
        categories.perf.push(commit);
      }
      continue;
    }

    const [, type, scope, description] = convMatch;
    const item = {
      ...commit,
      scope: scope || null,
      description: description.trim(),
    };

    switch (type.toLowerCase()) {
      case "feat":
        categories.feat.push(item);
        break;
      case "fix":
        categories.fix.push(item);
        break;
      case "perf":
        categories.perf.push(item);
        break;
      case "refactor":
        categories.refactor.push(item);
        break;
      case "docs":
        categories.docs.push(item);
        break;
      case "test":
        categories.test.push(item);
        break;
      case "sec":
      case "security":
        categories.sec.push(item);
        break;
      case "ci":
      case "build":
        categories.build.push(item);
        break;
      case "chore":
        if (scope === "deps") {
          categories.deps.push(item);
        }
        break;
    }
  }

  return categories;
}

function formatCommitLine(c) {
  const scopePrefix = c.scope ? `**${c.scope}**: ` : "";
  const text = c.description || c.subject;
  return `- ${scopePrefix}${text} ([${c.shortHash}](${REPO_URL}/commit/${c.hash}))`;
}

function generateMarkdown(tag, from, to, categories) {
  const versionTitle = tag ? (tag.startsWith("v") ? tag : `v${tag}`) : "Unreleased";
  const dateStr = new Date().toISOString().slice(0, 10);

  const lines = [];
  lines.push(`## [${versionTitle}] - ${dateStr}`);
  lines.push("");

  const isPrerelease =
    versionTitle.includes("-alpha") ||
    versionTitle.includes("-beta") ||
    versionTitle.includes("-rc");

  if (isPrerelease) {
    let preType = "Pre-Release";
    if (versionTitle.includes("-alpha")) preType = "Alpha Release";
    else if (versionTitle.includes("-beta")) preType = "Beta Release";
    else if (versionTitle.includes("-rc")) preType = "Release Candidate";

    lines.push(`> [!WARNING]`);
    lines.push(
      `> **${preType} Notice**: This is a pre-release intended for testing, validation, and feedback. It is NOT a stable production release.`
    );
    lines.push("");
  }

  const sections = [
    { title: "Breaking Changes", items: categories.breaking },
    { title: "Features", items: categories.feat },
    { title: "Bug Fixes", items: categories.fix },
    { title: "Performance Improvements", items: categories.perf },
    { title: "Refactoring", items: categories.refactor },
    { title: "Security", items: categories.sec },
    { title: "Documentation", items: categories.docs },
    { title: "Testing", items: categories.test },
    { title: "Build & CI Automation", items: categories.build },
    { title: "Dependencies", items: categories.deps },
  ];

  let hasEntries = false;
  for (const sec of sections) {
    if (sec.items && sec.items.length > 0) {
      hasEntries = true;
      lines.push(`### ${sec.title}`);
      lines.push("");
      for (const item of sec.items) {
        lines.push(formatCommitLine(item));
      }
      lines.push("");
    }
  }

  if (!hasEntries) {
    lines.push("- Maintenance and documentation updates.");
    lines.push("");
  }

  if (from) {
    lines.push(`**Full Changelog**: [${from}...${to}](${REPO_URL}/compare/${from}...${to})`);
  } else {
    lines.push(`**Full Commit History**: [${to}](${REPO_URL}/commits/${to})`);
  }
  lines.push("");

  return lines.join("\n");
}

function main() {
  const options = parseArgs();
  const targetTag = options.tag || options.to;
  const fromTag = options.from || getPreviousTag(targetTag);
  const toTag = options.tag || options.to;

  const commits = getCommits(fromTag, toTag);
  const categories = categorizeCommits(commits);
  const markdown = generateMarkdown(options.tag, fromTag, toTag, categories);

  if (options.prepend) {
    let existing = "";
    try {
      existing = readFileSync(CHANGELOG_PATH, "utf8");
    } catch {
      existing = "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n";
    }

    const headerEnd = existing.indexOf("## ");
    let updated;
    if (headerEnd !== -1) {
      updated = existing.slice(0, headerEnd) + markdown + "\n" + existing.slice(headerEnd);
    } else {
      updated = existing + "\n" + markdown;
    }

    writeFileSync(CHANGELOG_PATH, updated, "utf8");
    console.log(`[OK] Prepended release notes for ${options.tag || "Unreleased"} into CHANGELOG.md`);
  } else if (options.output) {
    writeFileSync(resolve(ROOT_DIR, options.output), markdown, "utf8");
    console.log(`[OK] Wrote release notes to ${options.output}`);
  } else {
    console.log(markdown);
  }
}

main();
