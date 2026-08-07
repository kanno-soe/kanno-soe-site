#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_SOURCE_REPO_URL = "https://github.com/kanno-soe/kanno-soe";
export const DEFAULT_SOURCE_REF = "main";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(path.dirname(scriptPath));
const defaultCheckoutPath = path.join(projectRoot, ".preview", "kanno-soe");
const buildContextScript = path.join(path.dirname(scriptPath), "build-context.mjs");

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: options.encoding,
    stdio: options.stdio ?? (options.encoding ? ["ignore", "pipe", "inherit"] : "inherit")
  });
}

function assertUsableCheckoutPath(checkoutPath) {
  if (!existsSync(checkoutPath)) return;
  if (!statSync(checkoutPath).isDirectory()) {
    throw new Error(`Preview source path is not a directory: ${checkoutPath}`);
  }
  if (!existsSync(path.join(checkoutPath, ".git")) && readdirSync(checkoutPath).length > 0) {
    throw new Error(`Preview source path is not an empty directory or Git checkout: ${checkoutPath}`);
  }
}

export function syncPreviewSource({
  repoUrl = DEFAULT_SOURCE_REPO_URL,
  ref = DEFAULT_SOURCE_REF,
  checkoutPath = defaultCheckoutPath
} = {}) {
  repoUrl = repoUrl.trim();
  ref = ref.trim();
  checkoutPath = path.resolve(checkoutPath);

  if (!repoUrl) throw new Error("The preview source repository URL cannot be empty.");
  if (!ref || ref.startsWith("-")) throw new Error(`Invalid preview source ref: ${ref}`);

  assertUsableCheckoutPath(checkoutPath);
  mkdirSync(path.dirname(checkoutPath), { recursive: true });

  if (!existsSync(path.join(checkoutPath, ".git"))) {
    runGit(["clone", "--filter=blob:none", "--no-checkout", "--", repoUrl, checkoutPath]);
  }

  runGit(["-C", checkoutPath, "remote", "set-url", "origin", repoUrl]);
  runGit(["-C", checkoutPath, "fetch", "--depth", "1", "origin", ref]);
  runGit(["-C", checkoutPath, "checkout", "--detach", "--force", "FETCH_HEAD"]);

  const commit = runGit(["-C", checkoutPath, "rev-parse", "--short", "HEAD"], {
    encoding: "utf8"
  }).trim();
  return { checkoutPath, commit, repoUrl, ref };
}

export function preparePreview({
  repoUrl = process.env.KANNO_SOE_REPO_URL || DEFAULT_SOURCE_REPO_URL,
  ref = process.env.KANNO_SOE_REF || DEFAULT_SOURCE_REF,
  checkoutPath = defaultCheckoutPath
} = {}) {
  console.log(`Refreshing preview content from ${repoUrl} (${ref})...`);
  const source = syncPreviewSource({ repoUrl, ref, checkoutPath });

  execFileSync(
    process.execPath,
    [buildContextScript, "--source", source.checkoutPath, "--repo-url", repoUrl],
    { cwd: projectRoot, stdio: "inherit" }
  );

  console.log(`Preview content is ready from source commit ${source.commit}.`);
  return source;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === scriptPath) preparePreview();
