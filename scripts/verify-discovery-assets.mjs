#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const VENDORED_BUNDLE = "public/vendor/nostr.bundle.1.17.0.js";
const DISCOVERY_HTML = "public/find-creators.html";
const EXPECTED_SHA256 =
  "44c3fcd0c1250642e7c4a2c8861c4473faf6f09e3bf78b9d0bf1747e93c5266b";
const EXPECTED_SCRIPT_REF = 'src="vendor/nostr.bundle.1.17.0.js"';

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const bundlePath = resolve(process.cwd(), VENDORED_BUNDLE);
  const htmlPath = resolve(process.cwd(), DISCOVERY_HTML);

  const [bundle, html] = await Promise.all([
    readFile(bundlePath),
    readFile(htmlPath, "utf8"),
  ]);

  const hash = sha256Hex(bundle);
  assert(
    hash === EXPECTED_SHA256,
    `Discovery bundle hash mismatch. Expected ${EXPECTED_SHA256}, got ${hash}.`,
  );

  assert(
    html.includes(EXPECTED_SCRIPT_REF),
    `Discovery HTML must reference vendored bundle (${EXPECTED_SCRIPT_REF}).`,
  );

  assert(
    !/unpkg\.com\/nostr-tools/i.test(html),
    "Discovery HTML must not depend on unpkg nostr-tools CDN.",
  );

  console.log(`Discovery assets verified (${VENDORED_BUNDLE})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
