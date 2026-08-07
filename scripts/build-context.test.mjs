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
      "Inline math: For every $d\\in\\mathcal D$, fix $E$ and write $\\to^*$.",
      "",
      "Escaped dollar: \\$5. Unmatched dollars: $5 and $10.",
      "",
      "Inline code: `$d\\in\\mathcal D$`.",
      "",
      "```math",
      "C_1 \\bowtie \\cdots \\bowtie C_n",
      "\\quad\\Longleftrightarrow\\quad",
      "\\bigwedge_{i=1}^{n-1}(C_i\\bowtie C_{i+1})",
      "\\qquad\\frac{}{d\\to^*d}",
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
  const katexLayoutCss = readFileSync(
    path.join(projectRoot, "public", "context", "katex-layout.css"),
    "utf8"
  );
  const katexCss = readFileSync(path.join(projectRoot, "public", "vendor", "katex", "katex.min.css"), "utf8");
  const katexMainFont = readFileSync(
    path.join(projectRoot, "public", "vendor", "katex", "fonts", "KaTeX_Main-Regular.woff2")
  );
  assert.match(html, /<blockquote>\s*<p>line 1<br>\nline 2<\/p>\s*<\/blockquote>/);
  assert.match(html, /<blockquote>\s*<p>soft line 1\s+soft line 2<\/p>\s*<\/blockquote>/);
  assert.match(html, /<li>outer\s*<ul>\s*<li>inner<\/li>\s*<\/ul>\s*<\/li>/);
  assert.match(html, /<a href="#markdown-exposition-theory-md" rel="noreferrer">Theory<\/a>/);
  assert.match(html, /<a href="#named-section" rel="noreferrer">Named section<\/a>/);
  assert.match(html, /<table>[\s\S]*<strong>two<\/strong>[\s\S]*<\/table>/);
  assert.equal(html.match(/class="math-inline"/g)?.length, 3);
  assert.equal(html.match(/class="katex-html"/g)?.length, 4);
  assert.match(html, /<span class="math-inline"><span class="katex"><span class="katex-mathml"><math[^>]*><semantics>/);
  assert.match(html, /<span class="katex-html" aria-hidden="true">/);
  assert.doesNotMatch(html, /\sstyle="/);
  const referencedLayoutStyles = new Set(
    Array.from(html.matchAll(/data-katex-layout="([^"]+)"/gu), (match) => match[1])
  );
  const generatedLayoutStyles = new Set(
    Array.from(katexLayoutCss.matchAll(/\[data-katex-layout="([^"]+)"\]/gu), (match) => match[1])
  );
  assert.ok(referencedLayoutStyles.size > 0);
  assert.deepEqual(generatedLayoutStyles, referencedLayoutStyles);
  assert.match(katexLayoutCss, /\{ [^}]*height:/);
  assert.match(katexLayoutCss, /\{ [^}]*top:/);
  assert.match(html, /<annotation encoding="application\/x-tex">d\\in\\mathcal D<\/annotation>/);
  assert.match(html, /Escaped dollar: \$5\. Unmatched dollars: \$5 and \$10\./);
  assert.match(html, /<code>\$d\\in\\mathcal D\$<\/code>/);
  assert.match(
    html,
    /<div class="math-block">\s*<span class="katex-display"><span class="katex"><span class="katex-mathml"><math[^>]+display="block">/
  );
  assert.match(html, /<annotation encoding="application\/x-tex">[\s\S]*\\bowtie[\s\S]*<\/annotation>/);
  assert.doesNotMatch(html, /<code class="language-math">/);
  assert.match(html, /<pre><code class="language-lean">#check Nat\.add_comm/);
  assert.match(html, /&lt;script&gt;alert\(&quot;nope&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<a href="javascript:/);
  assert.doesNotMatch(html, /<img[^>]+src="data:/);
  assert.match(katexCss, /KaTeX_Main-Regular\.woff2/);
  assert.ok(katexMainFont.byteLength > 0);
});

test("loads the CSP-safe generated KaTeX layout stylesheet", () => {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const indexHtml = readFileSync(path.join(repositoryRoot, "public", "index.html"), "utf8");
  assert.match(indexHtml, /<link rel="stylesheet" href="\/context\/katex-layout\.css">/);
});
