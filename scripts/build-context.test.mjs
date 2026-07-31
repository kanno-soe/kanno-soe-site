import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("renders Markdown hard breaks inside blockquotes", (t) => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "kanno-soe-context-test-"));
  t.after(() => rmSync(tempRoot, { recursive: true, force: true }));

  const projectRoot = path.join(tempRoot, "site");
  const sourceRoot = path.join(tempRoot, "source");
  const scriptsRoot = path.join(projectRoot, "scripts");
  const expositionRoot = path.join(sourceRoot, "Exposition");
  const outputPath = path.join(projectRoot, "src", "context.generated.ts");
  mkdirSync(scriptsRoot, { recursive: true });
  mkdirSync(expositionRoot, { recursive: true });
  mkdirSync(path.dirname(outputPath), { recursive: true });

  copyFileSync(fileURLToPath(new URL("./build-context.mjs", import.meta.url)), path.join(scriptsRoot, "build-context.mjs"));
  writeFileSync(
    path.join(expositionRoot, "Preamble.md"),
    "> line 1  \n> line 2\n\n> soft line 1\n> soft line 2\n",
    "utf8"
  );

  execFileSync("git", ["init", "--quiet", sourceRoot]);
  execFileSync("git", ["-C", sourceRoot, "add", "."]);
  execFileSync("git", [
    "-C",
    sourceRoot,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--quiet",
    "-m",
    "Fixture"
  ]);

  execFileSync(process.execPath, [
    path.join(scriptsRoot, "build-context.mjs"),
    "--source",
    sourceRoot,
    "--out",
    outputPath,
    "--repo-url",
    "https://github.com/kanno-soe/kanno-soe"
  ]);

  const html = readFileSync(path.join(projectRoot, "public", "context", "exposition.html"), "utf8");
  assert.match(html, /<blockquote><p>line 1<br>\nline 2<\/p><\/blockquote>/);
  assert.match(html, /<blockquote><p>soft line 1 soft line 2<\/p><\/blockquote>/);
});
