#!/usr/bin/env node

import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const dryRun = process.argv.includes("--dry-run");
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const reportPath = process.env.BRANCH_PROTECTION_REPORT_PATH || "";

const branches = splitCsv(
  process.env.BRANCH_PROTECTION_BRANCHES || "main,develop,Develop2",
);
const requiredChecks = splitCsv(
  process.env.BRANCH_PROTECTION_REQUIRED_CHECKS || "Test,build",
);

function splitCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseRepoFromRemote(remoteUrl) {
  const normalized = remoteUrl.trim();
  const sshMatch = normalized.match(
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
  );
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const httpsMatch = normalized.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i,
  );
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return "";
}

function resolveRepository() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY.trim();
  }

  try {
    const remote = execSync("git config --get remote.origin.url", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return parseRepoFromRemote(remote);
  } catch {
    return "";
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getContextNames(requiredStatusChecks) {
  const names = new Set();
  for (const context of requiredStatusChecks?.contexts || []) {
    if (typeof context === "string" && context.trim()) {
      names.add(context.trim());
    }
  }
  for (const check of requiredStatusChecks?.checks || []) {
    if (check && typeof check.context === "string" && check.context.trim()) {
      names.add(check.context.trim());
    }
  }
  return names;
}

async function githubRequest(pathname) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "fundstr-branch-protection-checker",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API ${response.status} for ${pathname}: ${body.slice(0, 240)}`,
    );
  }

  return response.json();
}

function evaluateProtection(protection) {
  const failures = [];
  const requiredStatusChecks = protection?.required_status_checks || null;
  const requiredReviews = protection?.required_pull_request_reviews || null;
  const contextNames = getContextNames(requiredStatusChecks);
  const normalizedContextNames = new Set(
    Array.from(contextNames, (name) => name.toLowerCase()),
  );

  if (!requiredStatusChecks) {
    failures.push("required_status_checks is not configured");
  } else {
    if (requiredStatusChecks.strict !== true) {
      failures.push("required_status_checks.strict must be true");
    }

    for (const requiredCheck of requiredChecks) {
      const normalizedRequiredCheck = requiredCheck.toLowerCase();
      if (!normalizedContextNames.has(normalizedRequiredCheck)) {
        failures.push(`missing required status check: ${requiredCheck}`);
      }
    }
  }

  if (!requiredReviews) {
    failures.push("required_pull_request_reviews is not configured");
  } else {
    const approvals = Number(
      requiredReviews.required_approving_review_count || 0,
    );
    if (!Number.isFinite(approvals) || approvals < 1) {
      failures.push("required_approving_review_count must be >= 1");
    }
    if (requiredReviews.dismiss_stale_reviews !== true) {
      failures.push("dismiss_stale_reviews must be true");
    }
  }

  if (protection?.allow_force_pushes?.enabled !== false) {
    failures.push("force pushes must be disabled");
  }

  if (protection?.allow_deletions?.enabled !== false) {
    failures.push("branch deletions must be disabled");
  }

  return {
    ok: failures.length === 0,
    failures,
    observedChecks: Array.from(contextNames).sort(),
  };
}

async function writeReport(report) {
  if (!reportPath) return;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}

async function main() {
  const repository = resolveRepository();
  assert(
    repository,
    "Unable to resolve repository. Set GITHUB_REPOSITORY=owner/repo.",
  );
  assert(branches.length > 0, "No branches configured to verify.");
  assert(requiredChecks.length > 0, "No required checks configured to verify.");

  console.log(
    `Verifying branch protection for ${repository} (${branches.join(", ")})${
      dryRun ? " [dry-run]" : ""
    }`,
  );

  if (dryRun) {
    const report = {
      generatedAt: new Date().toISOString(),
      repository,
      dryRun: true,
      branches,
      requiredChecks,
    };
    await writeReport(report);
    console.log("Dry-run complete");
    return;
  }

  assert(
    token,
    "Missing GITHUB_TOKEN/GH_TOKEN. Provide a token with repository admin read access.",
  );

  const branchResults = [];
  let failed = false;

  for (const branch of branches) {
    try {
      const encodedBranch = encodeURIComponent(branch);
      const protection = await githubRequest(
        `/repos/${repository}/branches/${encodedBranch}/protection`,
      );

      const evaluation = evaluateProtection(protection);
      branchResults.push({
        branch,
        ok: evaluation.ok,
        failures: evaluation.failures,
        observedChecks: evaluation.observedChecks,
      });

      if (evaluation.ok) {
        console.log(
          `OK  ${branch} (checks: ${evaluation.observedChecks.join(", ")})`,
        );
      } else {
        failed = true;
        console.error(`FAIL ${branch}:`);
        for (const failure of evaluation.failures) {
          console.error(`  - ${failure}`);
        }
      }
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      branchResults.push({ branch, ok: false, failures: [message] });
      console.error(`FAIL ${branch}: ${message}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    repository,
    dryRun: false,
    requiredChecks,
    failed,
    branchResults,
  };
  await writeReport(report);

  if (failed) {
    throw new Error("Branch protection verification failed");
  }

  console.log("Branch protection verification passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
