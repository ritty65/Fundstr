#!/usr/bin/env node

import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = process.env.DEPLOY_DIST_DIR || "dist/pwa";
const requiredFiles = [
  ".htaccess",
  "index.html",
  "find-creators.html",
  "find_profiles.php",
  "featured-creators.json",
  "manifest.json",
  "relayHealth.js",
  "vendor/nostr.bundle.1.17.0.js",
  "sw.js",
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

  const htaccessPath = resolve(root, ".htaccess");
  const htaccess = await readFile(htaccessPath, "utf8");
  assert(
    htaccess.includes(
      "RewriteRule ^find-creators\\.html$ /find-creators [R=301,L,NC,QSA]",
    ),
    "Deploy artifact validation failed: .htaccess is missing the legacy find-creators redirect.",
  );

  const redirectShim = await readFile(resolve(root, "find-creators.html"), "utf8");
  assert(
    redirectShim.includes("window.location.replace(target.toString())"),
    "Deploy artifact validation failed: find-creators.html is not the expected redirect shim.",
  );
  assert(
    redirectShim.includes('meta name="robots" content="noindex, nofollow"'),
    "Deploy artifact validation failed: find-creators.html must be marked noindex.",
  );
  assert(
    !redirectShim.includes("find-creators.css"),
    "Deploy artifact validation failed: find-creators.html still references the legacy stylesheet.",
  );
  assert(
    !redirectShim.includes("nostr.bundle.1.17.0.js"),
    "Deploy artifact validation failed: find-creators.html still references the legacy discovery bundle.",
  );

  const legacyBundle = await readFile(
    resolve(root, "vendor/nostr.bundle.1.17.0.js"),
    "utf8",
  );
  assert(
    legacyBundle.includes("Legacy placeholder retained for deploy parity."),
    "Deploy artifact validation failed: vendor/nostr.bundle.1.17.0.js is not the expected placeholder.",
  );

  console.log(
    `Deploy artifacts verified in ${distDir} (${requiredFiles.length} required files).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
