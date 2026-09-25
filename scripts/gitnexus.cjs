#!/usr/bin/env node
/**
 * Runs GitNexus the way its generated AGENTS.md asks: through the index's own
 * `.gitnexus/run.cjs`, which picks a runner that works on this machine (the
 * global `gitnexus` first, and never `npx` on npm 11+, where it crashes, see
 * gitnexus #1939). A fresh clone has no run.cjs until its first analyze, so
 * that one case falls back to `npx gitnexus`.
 *
 *   node scripts/gitnexus.cjs <index dir> <gitnexus arguments...>
 *
 * Analysis options (like `pdg: true`) live in each index's `.gitnexusrc`, not
 * here, so a manual `node .gitnexus/run.cjs analyze` gets the same index.
 */
const { spawnSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

const [dir = ".", ...args] = process.argv.slice(2);
const cwd = path.resolve(__dirname, "..", dir);
const runner = path.join(cwd, ".gitnexus", "run.cjs");

const [command, commandArgs] = existsSync(runner)
  ? [process.execPath, [runner, ...args]]
  : ["npx", ["gitnexus", ...args]];

const result = spawnSync(command, commandArgs, { cwd, stdio: "inherit" });
process.exit(result.status ?? 1);
