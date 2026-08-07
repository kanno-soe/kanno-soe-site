#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparePreview } from "./preview-source.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(path.dirname(scriptPath));
const wranglerCli = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const wranglerArgs = process.argv.slice(2);
if (wranglerArgs[0] === "--") wranglerArgs.shift();

preparePreview();

if (!existsSync(wranglerCli)) {
  throw new Error("Wrangler is not installed. Run `pnpm install` before starting the preview.");
}

const child = spawn(process.execPath, [wranglerCli, "dev", ...wranglerArgs], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit"
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  throw error;
});

child.on("exit", (code, signal) => {
  const signalExitCodes = { SIGINT: 130, SIGTERM: 143 };
  process.exitCode = code ?? signalExitCodes[signal] ?? 1;
});
