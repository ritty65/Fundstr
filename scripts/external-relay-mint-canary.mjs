#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import WebSocket from "ws";

const relayHttpUrl = normalizeBaseUrl(
  process.env.CANARY_RELAY_HTTP_URL || "https://relay.fundstr.me",
);
const relayWsUrl = normalizeBaseUrl(
  process.env.CANARY_RELAY_WS_URL || "wss://relay.fundstr.me",
);
const mintUrls = splitCsv(process.env.CANARY_MINT_URLS || "");
const requireMints = toBoolean(process.env.CANARY_REQUIRE_MINTS || "0");
const timeoutMs = Number(process.env.CANARY_TIMEOUT_MS || 8000);
const artifactDir = path.resolve(
  process.env.CANARY_ARTIFACT_DIR || "artifacts/external-relay-mint-canary",
);

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildRelayRequestUrl(baseUrl, filters) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid CANARY_RELAY_HTTP_URL: ${baseUrl}`);
  }

  const trimmedPath = parsed.pathname.replace(/\/+$/, "");
  if (trimmedPath.endsWith("/req")) {
    parsed.pathname = trimmedPath;
  } else {
    parsed.pathname = `${trimmedPath || ""}/req`;
  }

  parsed.searchParams.set("filters", filters);
  return parsed.toString();
}

function splitCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toBoolean(value) {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

function impossibleFilter() {
  return [
    {
      kinds: [10019],
      authors: ["0".repeat(64)],
      limit: 1,
    },
  ];
}

async function runStep(report, name, run) {
  const started = Date.now();
  try {
    const details = await run();
    report.steps.push({
      name,
      status: "passed",
      durationMs: Date.now() - started,
      details,
    });
  } catch (error) {
    report.steps.push({
      name,
      status: "failed",
      durationMs: Date.now() - started,
      details: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function addWarning(report, name, details) {
  report.steps.push({
    name,
    status: "warning",
    durationMs: 0,
    details,
  });
}

async function checkRelayHttp() {
  const filters = encodeURIComponent(JSON.stringify(impossibleFilter()));
  const url = buildRelayRequestUrl(relayHttpUrl, filters);
  const res = await withTimeout(url, {
    method: "GET",
    headers: { accept: "application/json", "cache-control": "no-cache" },
    cache: "no-store",
  });
  assert(res.ok, `Relay HTTP query failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const events = Array.isArray(data)
    ? data
    : data && Array.isArray(data.events)
    ? data.events
    : null;
  assert(Array.isArray(events), "Relay HTTP query returned non-array payload");
  return `Relay HTTP OK with ${events.length} event(s) returned.`;
}

async function checkRelayWs() {
  const subId = `relay-canary-${Math.random().toString(36).slice(2, 10)}`;
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(relayWsUrl);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Relay WS timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    let settled = false;
    const finish = (fn, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // noop
      }
      fn(payload);
    };

    ws.on("open", () => {
      ws.send(JSON.stringify(["REQ", subId, ...impossibleFilter()]));
    });

    ws.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!Array.isArray(message) || message.length === 0) return;

      const [type, responseSubId] = message;
      if (typeof responseSubId === "string" && responseSubId !== subId) return;

      if (type === "EOSE") {
        finish(resolve);
      }

      if (type === "CLOSED") {
        finish(
          reject,
          new Error(`Relay WS closed subscription: ${message[2] || "unknown"}`),
        );
      }
    });

    ws.on("error", (error) => finish(reject, error));
    ws.on("close", () => {
      if (!settled) {
        finish(reject, new Error("Relay WS closed before EOSE"));
      }
    });
  });

  return "Relay WS OK (EOSE received).";
}

async function fetchJson(url) {
  const response = await withTimeout(url, {
    method: "GET",
    headers: { accept: "application/json", "cache-control": "no-cache" },
    cache: "no-store",
  });
  assert(response.ok, `HTTP ${response.status} for ${url}`);
  return response.json();
}

function normalizeMintBase(url) {
  return url.replace(/\/+$/, "");
}

async function checkMintEndpoints(mintUrl) {
  const base = normalizeMintBase(mintUrl);
  const [keysets, keys] = await Promise.all([
    fetchJson(`${base}/v1/keysets`),
    fetchJson(`${base}/v1/keys`),
  ]);

  assert(
    Array.isArray(keysets?.keysets),
    `Mint ${base} returned invalid /v1/keysets payload`,
  );
  assert(
    Array.isArray(keys?.keysets),
    `Mint ${base} returned invalid /v1/keys payload`,
  );

  return `Mint ${base} OK (keysets=${keysets.keysets.length}, keys=${keys.keysets.length}).`;
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# External Relay+Mint Canary Report");
  lines.push("");
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Completed: ${report.completedAt}`);
  lines.push(`- Status: ${report.status}`);
  lines.push(`- Relay HTTP: ${relayHttpUrl}`);
  lines.push(`- Relay WS: ${relayWsUrl}`);
  lines.push(
    `- Mint URLs: ${mintUrls.length > 0 ? mintUrls.join(", ") : "<none>"}`,
  );
  lines.push("");
  lines.push("## Steps");
  lines.push("");
  for (const step of report.steps) {
    const icon =
      step.status === "passed"
        ? "PASS"
        : step.status === "warning"
        ? "WARN"
        : "FAIL";
    lines.push(`- [${icon}] ${step.name} (${step.durationMs}ms)`);
    if (step.details) {
      lines.push(`  - ${String(step.details).replace(/\n/g, " ")}`);
    }
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- Keep this workflow non-required until several consecutive clean runs are recorded.",
  );
  lines.push(
    "- After stabilization, promote to a required pre-launch or release check.",
  );
  return `${lines.join("\n")}\n`;
}

async function writeArtifacts(report) {
  await mkdir(artifactDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(artifactDir, "external-relay-mint-canary-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(artifactDir, "external-relay-mint-canary-report.md"),
      toMarkdown(report),
      "utf8",
    ),
  ]);
}

async function main() {
  assert(
    Number.isFinite(timeoutMs) && timeoutMs > 0,
    `Invalid CANARY_TIMEOUT_MS: ${process.env.CANARY_TIMEOUT_MS || "<unset>"}`,
  );

  const report = {
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    steps: [],
  };

  try {
    await runStep(report, "Relay HTTP query", checkRelayHttp);
    await runStep(report, "Relay WS EOSE", checkRelayWs);

    if (mintUrls.length === 0) {
      if (requireMints) {
        throw new Error(
          "CANARY_MINT_URLS is empty but CANARY_REQUIRE_MINTS is enabled.",
        );
      }

      addWarning(
        report,
        "Mint endpoint checks",
        "No CANARY_MINT_URLS configured. Set CANARY_MINT_URLS to enable external mint checks.",
      );
    } else {
      for (const mintUrl of mintUrls) {
        await runStep(report, `Mint health: ${mintUrl}`, () =>
          checkMintEndpoints(mintUrl),
        );
      }
    }

    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    if (error instanceof Error) {
      report.error = error.message;
    }
  } finally {
    report.completedAt = new Date().toISOString();
    await writeArtifacts(report);
  }

  if (report.status !== "passed") {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const fallbackReport = {
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: "failed",
    steps: [],
    error: error instanceof Error ? error.message : String(error),
  };
  await writeArtifacts(fallbackReport);
  console.error(
    error instanceof Error ? error.stack || error.message : String(error),
  );
  process.exit(1);
});
