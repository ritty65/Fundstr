#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const baseUrl = normalizeBaseUrl(
  process.env.BASE_URL || "https://staging.fundstr.me",
);
const timeoutMs = Number(process.env.SYNTHETIC_TIMEOUT_MS || 15000);
const artifactDir = path.resolve(
  process.env.SYNTHETIC_CANARY_ARTIFACT_DIR ||
    "artifacts/staging-synthetic-canary",
);

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
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

async function fetchText(pathname, expectedType) {
  const url = `${baseUrl}${pathname}`;
  const response = await withTimeout(url, {
    method: "GET",
    headers: { accept: expectedType || "*/*", "cache-control": "no-cache" },
    cache: "no-store",
  });
  assert(response.ok, `HTTP ${response.status} at ${url}`);
  const contentType = response.headers.get("content-type") || "";
  if (expectedType) {
    assert(
      contentType.toLowerCase().includes(expectedType.toLowerCase()),
      `Unexpected content-type for ${url}: ${contentType || "<missing>"}`,
    );
  }
  const body = await response.text();
  assert(body.length > 0, `Empty response body at ${url}`);
  return { body, contentType };
}

async function fetchJson(pathname) {
  const { body } = await fetchText(pathname, "application/json");
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(
      `Invalid JSON at ${baseUrl}${pathname}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function runSmokeScript() {
  return new Promise((resolve, reject) => {
    const proc = spawn("bash", ["scripts/smoke-tests.sh"], {
      cwd: process.cwd(),
      env: { ...process.env, BASE_URL: baseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });

    proc.on("error", (error) => reject(error));

    proc.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code: 0 });
        return;
      }
      reject(
        new Error(
          `scripts/smoke-tests.sh exited with code ${code}\n${stdout}\n${stderr}`,
        ),
      );
    });
  });
}

async function runStep(report, name, run) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  console.log(`\n[canary] START ${name}`);

  try {
    const details = await run();
    const durationMs = Date.now() - startedMs;
    const step = {
      name,
      status: "passed",
      startedAt,
      durationMs,
      details: details || "",
    };
    report.steps.push(step);
    console.log(`[canary] PASS ${name} (${durationMs}ms)`);
    return step;
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    const message = error instanceof Error ? error.message : String(error);
    const step = {
      name,
      status: "failed",
      startedAt,
      durationMs,
      details: message,
    };
    report.steps.push(step);
    console.error(`[canary] FAIL ${name} (${durationMs}ms)`);
    console.error(`[canary] REASON ${message}`);
    throw error;
  }
}

function looksLikeSpaShell(html) {
  return /<html/i.test(html) && /\/assets\/[A-Za-z0-9._-]+\.js/i.test(html);
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Staging Synthetic Canary Report");
  lines.push("");
  lines.push(`- Base URL: ${report.baseUrl}`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Completed: ${report.completedAt}`);
  lines.push(`- Status: ${report.status}`);
  lines.push("");
  lines.push("## Steps");
  lines.push("");

  for (const step of report.steps) {
    const icon = step.status === "passed" ? "PASS" : "FAIL";
    lines.push(`- [${icon}] ${step.name} (${step.durationMs}ms)`);
    if (step.details) {
      lines.push(`  - ${String(step.details).replace(/\n/g, " ")}`);
    }
  }

  lines.push("");
  lines.push("## Guidance");
  lines.push("");
  lines.push(
    "- If route checks fail, verify SPA rewrite/.htaccess rules on staging host.",
  );
  lines.push(
    "- If discovery checks fail, verify vendored bundle path and CSP for /find-creators.html.",
  );
  lines.push(
    "- If smoke script fails, inspect its log lines for headers/relay diagnostics.",
  );
  return `${lines.join("\n")}\n`;
}

async function writeArtifacts(report) {
  await mkdir(artifactDir, { recursive: true });
  const jsonPath = path.join(artifactDir, "synthetic-canary-report.json");
  const markdownPath = path.join(artifactDir, "synthetic-canary-report.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, toMarkdown(report), "utf8");
  console.log(`[canary] Artifacts written to ${artifactDir}`);
}

async function main() {
  assert(
    Number.isFinite(timeoutMs) && timeoutMs > 0,
    `Invalid SYNTHETIC_TIMEOUT_MS value: ${
      process.env.SYNTHETIC_TIMEOUT_MS || "<unset>"
    }`,
  );

  const report = {
    baseUrl,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    steps: [],
  };

  await mkdir(artifactDir, { recursive: true });

  console.log(`[canary] Running staging synthetic journey against ${baseUrl}`);

  try {
    await runStep(report, "Root document loads", async () => {
      const { body } = await fetchText("/", "text/html");
      assert(
        looksLikeSpaShell(body),
        "Root HTML missing expected SPA shell markers",
      );
      return "Root page returned HTML with bundled asset references.";
    });

    await runStep(report, "Primary SPA routes resolve", async () => {
      const wallet = await fetchText("/wallet", "text/html");
      const creators = await fetchText("/find-creators", "text/html");
      const diagnostics = await fetchText("/nutzap-tools", "text/html");
      assert(
        looksLikeSpaShell(wallet.body),
        "Route /wallet did not return a valid SPA shell",
      );
      assert(
        looksLikeSpaShell(creators.body),
        "Route /find-creators did not return a valid SPA shell",
      );
      assert(
        looksLikeSpaShell(diagnostics.body),
        "Route /nutzap-tools did not return a valid SPA shell",
      );
      return "Routes /wallet, /find-creators, /nutzap-tools serve SPA shell.";
    });

    await runStep(
      report,
      "Discovery iframe uses vendored dependency",
      async () => {
        const { body } = await fetchText("/find-creators.html", "text/html");
        if (looksLikeSpaShell(body)) {
          throw new Error(
            "Discovery route is serving SPA shell HTML. Deploy target likely missing standalone find-creators.html (or rewrite precedence is incorrect).",
          );
        }
        assert(
          body.includes("/vendor/nostr.bundle.1.17.0.js") ||
            body.includes("vendor/nostr.bundle.1.17.0.js"),
          "Discovery page missing vendored nostr bundle reference",
        );
        assert(
          !/unpkg\.com/i.test(body),
          "Discovery page still references unpkg.com",
        );
        return "Discovery iframe references local vendor bundle only.";
      },
    );

    await runStep(report, "Featured creators feed is available", async () => {
      const feed = await fetchJson("/featured-creators.json");
      assert(Array.isArray(feed), "featured-creators.json is not an array");
      assert(feed.length >= 5, "featured-creators.json has too few entries");
      const invalid = feed.find(
        (item) =>
          !item ||
          typeof item !== "object" ||
          typeof item.pubkey !== "string" ||
          item.pubkey.length !== 64,
      );
      assert(!invalid, "featured-creators.json contains invalid creator entry");
      return `Featured creators payload contains ${feed.length} creator records.`;
    });

    await runStep(report, "Extended smoke test script passes", async () => {
      await runSmokeScript();
      return "scripts/smoke-tests.sh completed successfully.";
    });

    report.status = "passed";
  } catch {
    report.status = "failed";
  } finally {
    report.completedAt = new Date().toISOString();
    await writeArtifacts(report);
  }

  if (report.status !== "passed") {
    process.exit(1);
  }

  console.log("[canary] Synthetic staging journey passed");
}

main().catch(async (error) => {
  console.error(
    `[canary] Fatal error: ${
      error instanceof Error ? error.stack || error.message : String(error)
    }`,
  );
  process.exit(1);
});
