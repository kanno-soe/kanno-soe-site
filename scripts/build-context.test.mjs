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
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("renders exposition Markdown with markdown-it", (t) => {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const tempParent = path.join(repositoryRoot, "node_modules", ".cache");
  mkdirSync(tempParent, { recursive: true });
  const tempRoot = mkdtempSync(path.join(tempParent, "kanno-soe-context-test-"));
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
    [
      "# Parser fixture",
      "",
      "> line 1  ",
      "> line 2",
      "",
      "> soft line 1",
      "> soft line 2",
      "",
      "- outer",
      "  - inner",
      "",
      "[Theory][theory]",
      "",
      "[Named section](Theory.md#named-section)",
      "",
      "[Unsafe link](javascript:alert(1))",
      "",
      "![Unsafe image](data:image/png;base64,AAAA)",
      "",
      "[theory]: Theory.md",
      "",
      "<script>alert(\"nope\")</script>",
      "",
      "| Name | Value |",
      "| --- | --- |",
      "| one | **two** |",
      "",
      "```math",
      "C_1 \\bowtie \\cdots \\bowtie C_n",
      "\\quad\\Longleftrightarrow\\quad",
      "\\bigwedge_{i=1}^{n-1}(C_i\\bowtie C_{i+1})",
      "```",
      "",
      "```lean",
      "#check Nat.add_comm",
      "```",
      ""
    ].join("\n"),
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
  assert.match(html, /<blockquote>\s*<p>line 1<br>\nline 2<\/p>\s*<\/blockquote>/);
  assert.match(html, /<blockquote>\s*<p>soft line 1\s+soft line 2<\/p>\s*<\/blockquote>/);
  assert.match(html, /<li>outer\s*<ul>\s*<li>inner<\/li>\s*<\/ul>\s*<\/li>/);
  assert.match(html, /<a href="#markdown-exposition-theory-md" rel="noreferrer">Theory<\/a>/);
  assert.match(html, /<a href="#named-section" rel="noreferrer">Named section<\/a>/);
  assert.match(html, /<table>[\s\S]*<strong>two<\/strong>[\s\S]*<\/table>/);
  assert.match(html, /<div class="math-block">\s*<span class="katex"><math[^>]+display="block">/);
  assert.match(html, /<annotation encoding="application\/x-tex">[\s\S]*\\bowtie[\s\S]*<\/annotation>/);
  assert.doesNotMatch(html, /<code class="language-math">/);
  assert.match(html, /<pre><code class="language-lean">#check Nat\.add_comm/);
  assert.match(html, /&lt;script&gt;alert\(&quot;nope&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<a href="javascript:/);
  assert.doesNotMatch(html, /<img[^>]+src="data:/);
});
