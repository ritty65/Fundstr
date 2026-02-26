#!/usr/bin/env node

import { constants } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const expectSw = process.env.EXPECT_SW === "1";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function exists(pathname) {
  try {
    await access(pathname, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveDistDir() {
  const explicit = process.env.DEPLOY_DIST_DIR;
  if (explicit) {
    return resolve(process.cwd(), explicit);
  }

  const candidates = ["dist/pwa", "dist/spa"];
  for (const candidate of candidates) {
    const abs = resolve(process.cwd(), candidate);
    if (await exists(abs)) {
      return abs;
    }
  }

  const distRoot = resolve(process.cwd(), "dist");
  if (!(await exists(distRoot))) {
    throw new Error("Missing dist directory. Run build first.");
  }

  const entries = await readdir(distRoot, { withFileTypes: true });
  const firstDir = entries.find((entry) => entry.isDirectory());
  if (!firstDir) {
    throw new Error("Could not find built output directory under dist/.");
  }
  return resolve(distRoot, firstDir.name);
}

async function main() {
  const distDir = await resolveDistDir();

  const requiredFiles = ["index.html", ".htaccess"];
  if (expectSw) {
    requiredFiles.push("sw.js");
  }

  for (const relativePath of requiredFiles) {
    const abs = resolve(distDir, relativePath);
    assert(await exists(abs), `Missing deploy artifact: ${abs}`);
  }

  const assetsDir = resolve(distDir, "assets");
  assert(await exists(assetsDir), `Missing assets directory: ${assetsDir}`);
  const assets = await readdir(assetsDir);
  assert(
    assets.some((name) => name.endsWith(".js")),
    `No JavaScript bundles found in ${assetsDir}`,
  );

  console.log(
    `Deploy artifacts verified in ${distDir} (EXPECT_SW=${
      expectSw ? "1" : "0"
    }).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
