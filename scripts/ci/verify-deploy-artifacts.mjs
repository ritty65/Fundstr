#!/usr/bin/env node

import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = process.env.DEPLOY_DIST_DIR || "dist/pwa";
const requiredFiles = [
  ".htaccess",
  "index.html",
  "find-creators.html",
  "find-creators.css",
  "featured-creators.json",
  "manifest.json",
  "relayHealth.js",
  "vendor/nostr.bundle.1.17.0.js",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertFileExists(pathname) {
  try {
    await access(pathname, constants.F_OK);
  } catch {
    throw new Error(`Missing deploy artifact: ${pathname}`);
  }
}

async function main() {
  const root = resolve(process.cwd(), distDir);
  await Promise.all(
    requiredFiles.map((relativePath) =>
      assertFileExists(resolve(root, relativePath)),
    ),
  );

  const discoveryHtmlPath = resolve(root, "find-creators.html");
  const discoveryHtml = await readFile(discoveryHtmlPath, "utf8");
  assert(
    discoveryHtml.includes("vendor/nostr.bundle.1.17.0.js"),
    "Deploy artifact validation failed: find-creators.html is missing vendored nostr bundle reference.",
  );
  assert(
    !/unpkg\.com\/nostr-tools/i.test(discoveryHtml),
    "Deploy artifact validation failed: find-creators.html still references unpkg nostr-tools.",
  );

  console.log(
    `Deploy artifacts verified in ${distDir} (${requiredFiles.length} required files).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
