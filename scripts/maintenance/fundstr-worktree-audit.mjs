#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const keepPaths = new Set(
  (process.env.FUNDSTR_KEEP_WORKTREES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

if (!keepPaths.has(repoRoot)) {
  keepPaths.add(repoRoot);
}

function runGit(args, workdir = repoRoot) {
  try {
    return execFileSync("git", args, {
      cwd: workdir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function runGitOk(args, workdir = repoRoot) {
  try {
    execFileSync("git", args, {
      cwd: workdir,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function parseWorktrees() {
  const raw = runGit(["worktree", "list", "--porcelain"]);
  const entries = [];
  let current = null;

  for (const line of raw.split("\n")) {
    if (!line.trim()) {
      if (current) {
        entries.push(current);
        current = null;
      }
      continue;
    }

    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ").trim();
    if (key === "worktree") {
      current = { path: value, detached: false, prunable: false };
      continue;
    }

    if (!current) {
      continue;
    }

    if (key === "branch") {
      current.branch = value.replace("refs/heads/", "");
    } else if (key === "HEAD") {
      current.head = value;
    } else if (key === "detached") {
      current.detached = true;
    } else if (key === "prunable") {
      current.prunable = true;
    }
  }

  if (current) {
    entries.push(current);
  }

  return entries;
}

function classifyWorktree(entry) {
  const shortHead = runGit(
    ["rev-parse", "--short", entry.head || "HEAD"],
    entry.path,
  );
  const status = runGit(["status", "--short"], entry.path);
  const dirty = status.length > 0;
  const branch = entry.detached
    ? "(detached)"
    : entry.branch || runGit(["rev-parse", "--abbrev-ref", "HEAD"], entry.path);
  const isAncestorOfMain = runGitOk(
    ["merge-base", "--is-ancestor", entry.head || "HEAD", "origin/main"],
    repoRoot,
  );
  const isAncestorOfDevelop2 = runGitOk(
    ["merge-base", "--is-ancestor", entry.head || "HEAD", "origin/Develop2"],
    repoRoot,
  );
  const keep = keepPaths.has(entry.path);

  let recommendation = "review";
  if (keep) {
    recommendation = "keep";
  } else if (entry.prunable) {
    recommendation = "prune-metadata";
  } else if (
    !dirty &&
    !entry.detached &&
    (isAncestorOfMain || isAncestorOfDevelop2)
  ) {
    recommendation = "safe-remove";
  }

  return {
    path: entry.path,
    name: path.basename(entry.path),
    branch,
    head: shortHead || (entry.head || "").slice(0, 7),
    dirty,
    prunable: entry.prunable,
    recommendation,
  };
}

function printMarkdown(rows) {
  console.log("| Worktree | Branch | Head | Dirty | Recommendation |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const row of rows) {
    console.log(
      `| ${row.name} | ${row.branch} | ${row.head} | ${
        row.dirty ? "yes" : "no"
      } | ${row.recommendation} |`,
    );
  }
}

const rows = parseWorktrees()
  .map(classifyWorktree)
  .sort((a, b) => a.name.localeCompare(b.name));
printMarkdown(rows);
