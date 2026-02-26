#!/usr/bin/env node

const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const repository = process.env.GITHUB_REPOSITORY || "";
const sha = process.env.GITHUB_SHA || "";
const timeoutMs = Number(process.env.PREDEPLOY_TIMEOUT_MS || 20 * 60 * 1000);
const pollIntervalMs = Number(process.env.PREDEPLOY_POLL_INTERVAL_MS || 15000);
const requiredChecks = parseCsv(
  process.env.PREDEPLOY_REQUIRED_CHECKS || "Test,build",
);
const dryRun = process.argv.includes("--dry-run");

function parseCsv(value) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function lookupByName(items, name) {
  const direct = items.get(name);
  if (direct) return direct;
  const normalizedTarget = normalizeName(name);
  for (const [key, value] of items.entries()) {
    if (normalizeName(key) === normalizedTarget) {
      return value;
    }
  }
  return undefined;
}

function toStatusState(status) {
  if (!status) return "missing";
  switch ((status.state || "").toLowerCase()) {
    case "success":
      return "success";
    case "failure":
    case "error":
      return "failure";
    case "pending":
      return "pending";
    default:
      return "pending";
  }
}

function toCheckRunState(checkRun) {
  if (!checkRun) return "missing";

  const status = (checkRun.status || "").toLowerCase();
  if (status !== "completed") {
    return "pending";
  }

  const conclusion = (checkRun.conclusion || "").toLowerCase();
  if (["success", "neutral", "skipped"].includes(conclusion)) {
    return "success";
  }
  if (!conclusion || conclusion === "action_required") {
    return "pending";
  }
  return "failure";
}

function combineCheckState(statusState, checkRunState) {
  const states = [statusState, checkRunState].filter((s) => s !== "missing");
  if (!states.length) return "missing";
  if (states.includes("failure")) return "failure";
  if (states.includes("pending")) return "pending";
  return "success";
}

async function githubRequest(pathname) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "fundstr-predeploy-gate",
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

function latestByName(items, nameField) {
  const map = new Map();
  for (const item of items) {
    const name = item?.[nameField];
    if (!name || typeof name !== "string") continue;

    const current = map.get(name);
    if (!current) {
      map.set(name, item);
      continue;
    }

    const currentId = Number(current.id || 0);
    const nextId = Number(item.id || 0);
    if (Number.isFinite(nextId) && nextId > currentId) {
      map.set(name, item);
    }
  }
  return map;
}

async function fetchCheckSnapshot() {
  const [combined, checkRunsResponse] = await Promise.all([
    githubRequest(`/repos/${repository}/commits/${sha}/status`),
    githubRequest(
      `/repos/${repository}/commits/${sha}/check-runs?per_page=100`,
    ),
  ]);

  const statusByContext = latestByName(combined.statuses || [], "context");
  const checkRunByName = latestByName(
    checkRunsResponse.check_runs || [],
    "name",
  );

  return { statusByContext, checkRunByName };
}

function summarizeStates(states) {
  return states.map((state) => `${state.name}=${state.state}`).join(", ");
}

async function main() {
  assert(repository, "Missing GITHUB_REPOSITORY env var.");
  assert(sha, "Missing GITHUB_SHA env var.");
  assert(requiredChecks.length > 0, "No required checks configured.");
  assert(Number.isFinite(timeoutMs) && timeoutMs > 0, "Invalid timeout value.");
  assert(
    Number.isFinite(pollIntervalMs) && pollIntervalMs > 0,
    "Invalid poll interval value.",
  );

  console.log(
    `Predeploy gate for ${repository}@${sha.slice(
      0,
      12,
    )} checks [${requiredChecks.join(", ")}]${dryRun ? " (dry-run)" : ""}`,
  );

  if (dryRun) {
    return;
  }

  assert(token, "Missing GITHUB_TOKEN/GH_TOKEN for predeploy gate checks.");

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const snapshot = await fetchCheckSnapshot();
    const states = requiredChecks.map((name) => {
      const status = lookupByName(snapshot.statusByContext, name);
      const checkRun = lookupByName(snapshot.checkRunByName, name);
      const statusState = toStatusState(status);
      const checkRunState = toCheckRunState(checkRun);
      return {
        name,
        state: combineCheckState(statusState, checkRunState),
      };
    });

    const failed = states.filter((item) => item.state === "failure");
    if (failed.length > 0) {
      throw new Error(
        `Predeploy gate failed: ${summarizeStates(
          states,
        )} (at least one required check failed)`,
      );
    }

    const pending = states.filter(
      (item) => item.state === "pending" || item.state === "missing",
    );
    if (pending.length === 0) {
      console.log(`Predeploy gate passed: ${summarizeStates(states)}`);
      return;
    }

    console.log(
      `Waiting on required checks: ${summarizeStates(
        states,
      )} (next poll in ${Math.round(pollIntervalMs / 1000)}s)`,
    );
    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for required checks (${requiredChecks.join(
      ", ",
    )}) after ${Math.round(timeoutMs / 1000)}s`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
