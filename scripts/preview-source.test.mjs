import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DEFAULT_SOURCE_REPO_URL, syncPreviewSource } from "./preview-source.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function commitFile(repository, contents, message) {
  const file = path.join(repository, "Exposition", "Preamble.md");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
  git(repository, "add", "Exposition/Preamble.md");
  git(repository, "commit", "-m", message);
  return git(repository, "rev-parse", "--short", "HEAD");
}

test("local preview defaults to the public kanno-soe source repository", () => {
  assert.equal(DEFAULT_SOURCE_REPO_URL, "https://github.com/kanno-soe/kanno-soe");
});

test("preview source checkout follows the requested repository ref", () => {
  const cacheRoot = path.join(repositoryRoot, "node_modules", ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  const tempRoot = mkdtempSync(path.join(cacheRoot, "kanno-soe-preview-test-"));
  const source = path.join(tempRoot, "source");
  const checkoutPath = path.join(tempRoot, "preview", "kanno-soe");

  try {
    mkdirSync(source, { recursive: true });
    git(source, "init", "--initial-branch=main");
    git(source, "config", "user.name", "Preview Test");
    git(source, "config", "user.email", "preview@example.invalid");

    const firstCommit = commitFile(source, "First version\n", "Add first version");
    const firstSync = syncPreviewSource({ repoUrl: source, ref: "main", checkoutPath });
    assert.equal(firstSync.commit, firstCommit);
    assert.equal(readFileSync(path.join(checkoutPath, "Exposition", "Preamble.md"), "utf8"), "First version\n");

    const secondCommit = commitFile(source, "Second version\n", "Update source");
    const secondSync = syncPreviewSource({ repoUrl: source, ref: "main", checkoutPath });
    assert.equal(secondSync.commit, secondCommit);
    assert.equal(readFileSync(path.join(checkoutPath, "Exposition", "Preamble.md"), "utf8"), "Second version\n");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
