#!/usr/bin/env node
/**
 * Post-build helper: copies src/cache/fundocs.json → dist/cache/fundocs.json
 * so the compiled server can locate the documentation cache at runtime.
 *
 * The compiled docs.ts looks for ../cache/fundocs.json relative to itself
 * (dist/tools/docs.js), i.e. dist/cache/fundocs.json.
 *
 * Skips silently if the source cache does not exist yet (the user may not
 * have run `npm run scrape` yet — the server will then surface a helpful
 * error at first tool call).
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src", "cache", "fundocs.json");
const DEST = join(__dirname, "..", "dist", "cache", "fundocs.json");

if (!existsSync(SRC)) {
  console.warn(
    "[build] No src/cache/fundocs.json found — run `npm run scrape` " +
      "before starting the server."
  );
  process.exit(0);
}

mkdirSync(dirname(DEST), { recursive: true });
copyFileSync(SRC, DEST);
console.log(`[build] Copied ${SRC} → ${DEST}`);
