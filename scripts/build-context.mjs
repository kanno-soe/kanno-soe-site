#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import katex from "katex";
import MarkdownIt from "markdown-it";

const DEFAULT_MAX_TOKENS = 600000;
const EXPOSITION_DIR = "Exposition";
const EXPOSITION_FILE_ORDER = [
  "Exposition/Preamble.md",
  "Exposition/Contents.md",
  "Exposition/Theory.md",
  "Exposition/Theorems.md",
  "Exposition/Identification.md",
  "Exposition/Assumptions.md",
  "Exposition/Glossary.md"
];
const SNAPSHOT_MODULES = [
  { id: "code", label: "Code" },
  { id: "exposition", label: "Exposition" }
];
const DEFAULT_SNAPSHOT_SELECTION = ["code", "exposition"];
const CODE_DIRECTORY_ORDER = ["Signature", "Consequences", "Doctrines", "Identification", "Meta", "Gen"];
const KATEX_LAYOUT_ATTRIBUTE = "data-katex-layout";
const katexLayoutStyles = new Map();

function usage() {
  console.error(
    "Usage: node scripts/build-context.mjs --source <path> [--max-tokens 600000] [--repo-url https://github.com/OWNER/kanno-soe]"
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = { maxTokens: DEFAULT_MAX_TOKENS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") args.source = argv[++i];
    else if (arg === "--max-tokens") args.maxTokens = Number(argv[++i]);
    else if (arg === "--repo-url") args.repoUrl = argv[++i];
    else usage();
  }
  if (!args.source || !Number.isFinite(args.maxTokens)) usage();
  return args;
}

function stripGitSuffix(value) {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function normalizeRepoUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return `https://github.com/${ssh[1]}/${stripGitSuffix(ssh[2])}`;

  try {
    const url = new URL(trimmed);
    if (url.hostname === "github.com") {
      url.username = "";
      url.password = "";
    }
    url.search = "";
    url.hash = "";
    return stripGitSuffix(url.toString().replace(/\/$/, ""));
  } catch {
    return stripGitSuffix(trimmed);
  }
}

function inferRepoUrl(sourcePath, explicitUrl) {
  if (explicitUrl) return normalizeRepoUrl(explicitUrl);

  try {
    const remoteUrl = execFileSync("git", ["-C", sourcePath, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const normalized = normalizeRepoUrl(remoteUrl);
    if (normalized) return normalized;
  } catch {
    // Fall through to the CI owner convention or project default.
  }

  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (owner) return `https://github.com/${owner}/kanno-soe`;
  return "https://github.com/kanno-soe/kanno-soe";
}

function walk(dir, root, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll(path.sep, "/");
    if (entry.isDirectory()) {
      if (rel === ".lake" || rel === "lake-packages" || rel.startsWith(".lake/") || rel.startsWith("lake-packages/")) {
        continue;
      }
      walk(full, root, out);
    } else if (entry.isFile() && rel.endsWith(".lean")) {
      out.push(rel);
    }
  }
}

function walkMarkdown(dir, root, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll(path.sep, "/");
    if (entry.isDirectory()) {
      walkMarkdown(full, root, out);
    } else if (entry.isFile() && rel.endsWith(".md")) {
      out.push(rel);
    }
  }
}

function moduleFileEntry(root, rel, displayRel = rel) {
  return { root, rel, displayRel };
}

function collectExpositionFiles(root) {
  const files = [];
  const expositionRoot = path.join(root, EXPOSITION_DIR);
  if (existsSync(expositionRoot) && statSync(expositionRoot).isDirectory()) {
    walkMarkdown(expositionRoot, root, files);
  }
  if (files.length > 0) return files.sort(compareExpositionFiles);
  return [];
}

function expositionOrder(rel) {
  const normalizedRel = rel.toLowerCase();
  const index = EXPOSITION_FILE_ORDER.findIndex((entry) => entry.toLowerCase() === normalizedRel);
  return index === -1 ? EXPOSITION_FILE_ORDER.length : index;
}

function compareExpositionFiles(a, b) {
  const order = expositionOrder(a) - expositionOrder(b);
  if (order !== 0) return order;
  return a.localeCompare(b);
}

function isExcludedCodePath(rel) {
  return rel.startsWith("KannoSoe/Exposition/");
}

function codeDirectoryRank(rel) {
  const parts = rel.split("/");
  const topLevel = parts[1] ?? "";
  const index = CODE_DIRECTORY_ORDER.indexOf(topLevel);
  return index === -1 ? CODE_DIRECTORY_ORDER.length : index;
}

function compareCodeFiles(a, b) {
  const rank = codeDirectoryRank(a) - codeDirectoryRank(b);
  if (rank !== 0) return rank;
  return a.localeCompare(b);
}

function collectCodeFiles(source) {
  const root = path.join(source, "KannoSoe");
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];

  const files = [];
  walk(root, source, files);
  return files
    .filter((rel) => !isExcludedCodePath(rel))
    .sort(compareCodeFiles)
    .map((rel) => moduleFileEntry(source, rel));
}

function buildSnapshotModules(source, expositionRoot, expositionFiles) {
  return {
    code: collectCodeFiles(source),
    exposition: expositionFiles.map((rel) => moduleFileEntry(expositionRoot, rel))
  };
}

function readEntryText(entry) {
  const text = readFileSync(path.join(entry.root, entry.rel), "utf8").replace(/\r\n/g, "\n");
  if (!entry.rel.endsWith(".md")) return text;
  return text
    .split("\n")
    .filter((line) => !/\bGENERATED\b/.test(line))
    .join("\n");
}

function renderContext(files) {
  return files
    .map((entry) => `===== FILE: ${entry.displayRel ?? entry.rel} =====\n${readEntryText(entry)}`)
    .join("\n\n");
}

function selectedSnapshotFiles(modules, selectedIds) {
  return selectedIds.flatMap((id) => modules[id] ?? []);
}

function snapshotSlug(selectedIds) {
  return selectedIds.length > 0 ? selectedIds.join("-") : "empty";
}

function snapshotFileName(selectedIds) {
  const slug = snapshotSlug(selectedIds);
  return slug === "code-exposition" ? "kanno-soe.md" : `kanno-soe-${slug}.md`;
}

function moduleSelectionMask(index) {
  return SNAPSHOT_MODULES.filter((_module, bit) => (index & (1 << bit)) !== 0).map(({ id }) => id);
}

function allSnapshotSelections() {
  const selections = [];
  const count = 1 << SNAPSHOT_MODULES.length;
  for (let index = 0; index < count; index += 1) selections.push(moduleSelectionMask(index));
  return selections;
}

function snapshotHeader({ commit, builtAt, repoUrl, files, selectedIds }) {
  const selectedLabels = SNAPSHOT_MODULES.filter(({ id }) => selectedIds.includes(id)).map(({ label }) => label);
  return [
    "Kannō-Sōe Mutual Dependence (KSMD) context snapshot",
    `Source commit: ${commit}`,
    `Built at: ${builtAt}`,
    `Repository snapshot of ${repoUrl}.`,
    `Selected modules: ${selectedLabels.length > 0 ? selectedLabels.join(", ") : "none"}`,
    "",
    "Files:",
    ...(files.length > 0 ? files.map((entry) => `- ${entry.displayRel ?? entry.rel}`) : ["- none"]),
    "",
    "===== CONTEXT =====",
    ""
  ].join("\n");
}

function buildSnapshotText({ commit, builtAt, repoUrl, files, selectedIds }) {
  const context = renderContext(files);
  const body = context ? `${context}\n` : "";
  return `${snapshotHeader({ commit, builtAt, repoUrl, files, selectedIds })}${body}`;
}

function snapshotStats(text) {
  return {
    bytes: Buffer.byteLength(text, "utf8"),
    approxTokens: Math.ceil(text.length / 3.5)
  };
}

function resolveMarkdownLink(value, currentRel) {
  const target = value.trim();
  const match = target.match(/^([^?#]+\.md)(#[^?]+)?$/i);
  if (!match || !currentRel) return target;

  if (match[2]) return match[2];
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(currentRel), match[1]));
  return `#markdown-${slugify(resolved)}`;
}

function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "markdown"
  );
}

function externalizeKatexLayoutStyles(html) {
  return html.replace(/\sstyle="([^"]*)"/gu, (_match, declarations) => {
    const digest = createHash("sha256").update(declarations).digest("hex").slice(0, 16);
    const id = `katex-${digest}`;
    const existing = katexLayoutStyles.get(id);
    if (existing && existing !== declarations) {
      throw new Error(`KaTeX layout style hash collision for ${id}`);
    }
    katexLayoutStyles.set(id, declarations);
    return ` ${KATEX_LAYOUT_ATTRIBUTE}="${id}"`;
  });
}

function renderKatexLayoutCss() {
  const rules = Array.from(katexLayoutStyles.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([id, declarations]) =>
        `#expositionContent [${KATEX_LAYOUT_ATTRIBUTE}="${id}"] { ${declarations} }`
    );
  return ["/* Generated by scripts/build-context.mjs. Do not edit by hand. */", ...rules, ""].join("\n");
}

function renderMath(content, displayMode) {
  const html = katex.renderToString(content, {
    displayMode,
    output: "htmlAndMathml",
    strict: "warn",
    throwOnError: false,
    trust: false
  });
  return externalizeKatexLayoutStyles(html);
}

function copyKaTeXAssets(projectRoot) {
  const sourceCss = fileURLToPath(import.meta.resolve("katex/dist/katex.min.css"));
  const sourcePackage = fileURLToPath(import.meta.resolve("katex/package.json"));
  const sourceRoot = path.dirname(sourcePackage);
  const sourceFonts = path.join(path.dirname(sourceCss), "fonts");
  const targetRoot = path.join(projectRoot, "public", "vendor", "katex");
  const targetFonts = path.join(targetRoot, "fonts");

  mkdirSync(targetFonts, { recursive: true });
  copyFileSync(sourceCss, path.join(targetRoot, "katex.min.css"));
  copyFileSync(path.join(sourceRoot, "LICENSE"), path.join(targetRoot, "LICENSE"));

  for (const fileName of readdirSync(sourceFonts)) {
    const sourcePath = path.join(sourceFonts, fileName);
    if (statSync(sourcePath).isFile()) copyFileSync(sourcePath, path.join(targetFonts, fileName));
  }
}

function isEscaped(source, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function parseLiteralBreak(state, silent) {
  const start = state.pos;
  if (!state.src.startsWith("<br>", start)) return false;

  if (!silent) {
    const token = state.push("hardbreak", "br", 0);
    token.markup = "<br>";
  }
  state.pos = start + "<br>".length;
  return true;
}

function parseInlineMath(state, silent) {
  const start = state.pos;
  const source = state.src;
  if (source[start] !== "$" || isEscaped(source, start)) return false;
  if (source[start - 1] === "$" || source[start + 1] === "$" || /\s/u.test(source[start + 1] ?? "")) {
    return false;
  }

  for (let end = start + 1; end < state.posMax; end += 1) {
    if (source[end] === "\n") return false;
    if (source[end] !== "$" || isEscaped(source, end)) continue;
    if (/\s/u.test(source[end - 1]) || source[end + 1] === "$" || /\d/u.test(source[end + 1] ?? "")) {
      continue;
    }

    if (!silent) {
      const token = state.push("math_inline", "math", 0);
      token.content = source.slice(start + 1, end);
      token.markup = "$";
    }
    state.pos = end + 1;
    return true;
  }

  return false;
}

function createMarkdownRenderer() {
  const renderer = new MarkdownIt({
    breaks: false,
    html: false,
    linkify: false,
    typographer: false
  });
  const renderLinkOpen =
    renderer.renderer.rules.link_open ??
    ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  const renderFence =
    renderer.renderer.rules.fence ??
    ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  const validateLink = renderer.validateLink.bind(renderer);

  renderer.validateLink = (target) =>
    !target.trim().toLowerCase().startsWith("data:") && validateLink(target);
  renderer.inline.ruler.before("escape", "literal_break", parseLiteralBreak);
  renderer.inline.ruler.before("escape", "math_inline", parseInlineMath);
  renderer.renderer.rules.math_inline = (tokens, index) =>
    `<span class="math-inline">${renderMath(tokens[index].content, false)}</span>`;
  renderer.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const href = tokens[index].attrGet("href");
    if (href !== null) tokens[index].attrSet("href", resolveMarkdownLink(href, env.currentRel));
    tokens[index].attrSet("rel", "noreferrer");
    return renderLinkOpen(tokens, index, options, env, self);
  };
  renderer.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/u, 1)[0]?.toLowerCase();
    if (language !== "math") return renderFence(tokens, index, options, env, self);

    const mathml = renderMath(token.content.trim(), true);
    return `<div class="math-block">\n${mathml}\n</div>\n`;
  };

  return renderer;
}

const markdownRenderer = createMarkdownRenderer();

function renderMarkdown(markdown, currentRel) {
  return markdownRenderer.render(markdown.replace(/\r\n/g, "\n"), { currentRel }).trimEnd();
}

function renderMarkdownFiles(root, files) {
  return files
    .map((rel) => {
      const text = readGeneratedMarkdown(root, rel);
      const id = `markdown-${slugify(rel)}`;
      return [
        `<section class="markdown-file" id="${id}">`,
        renderMarkdown(text, rel),
        "</section>"
      ].join("\n");
    })
    .join("\n");
}

function readGeneratedMarkdown(root, rel) {
  return readFileSync(path.join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/\bGENERATED\b/.test(line))
    .join("\n");
}

const { source, maxTokens, repoUrl: repoUrlArg } = parseArgs(process.argv.slice(2));
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(path.dirname(scriptPath));
const sourcePath = path.resolve(source);
if (!existsSync(sourcePath) || !statSync(sourcePath).isDirectory()) {
  throw new Error(`Source checkout does not exist or is not a directory: ${sourcePath}`);
}

const expositionRoot = sourcePath;
const expositionFiles = collectExpositionFiles(expositionRoot);
if (expositionFiles.length === 0) {
  throw new Error(`Exposition Markdown was not found under ${path.join(expositionRoot, EXPOSITION_DIR)}/`);
}

const snapshotModules = buildSnapshotModules(sourcePath, expositionRoot, expositionFiles);
const defaultFiles = selectedSnapshotFiles(snapshotModules, DEFAULT_SNAPSHOT_SELECTION);
if (defaultFiles.length === 0) {
  throw new Error(`No context files found in ${sourcePath}`);
}

const context = renderContext(defaultFiles);

const approxTokens = Math.ceil(context.length / 3.5);
if (approxTokens > maxTokens) {
  throw new Error(`Context estimate ${approxTokens} exceeds guard ${maxTokens}`);
}

const commit = execFileSync("git", ["-C", sourcePath, "rev-parse", "--short", "HEAD"], {
  encoding: "utf8"
}).trim();
const repoUrl = inferRepoUrl(sourcePath, repoUrlArg);
const builtAt = new Date().toISOString();

copyKaTeXAssets(projectRoot);

const contextDir = path.join(projectRoot, "public", "context");
mkdirSync(contextDir, { recursive: true });

const snapshotPath = path.join(contextDir, "kanno-soe.md");
const expositionPath = path.join(contextDir, "exposition.md");
const expositionHtmlPath = path.join(contextDir, "exposition.html");
const katexLayoutCssPath = path.join(contextDir, "katex-layout.css");
const manifestPath = path.join(contextDir, "manifest.json");
const snapshots = {};
let defaultSnapshot = null;
for (const selectedIds of allSnapshotSelections()) {
  const selectedFiles = selectedSnapshotFiles(snapshotModules, selectedIds);
  const text = buildSnapshotText({ commit, builtAt, repoUrl, files: selectedFiles, selectedIds });
  const fileName = snapshotFileName(selectedIds);
  const stats = snapshotStats(text);
  writeFileSync(path.join(contextDir, fileName), text, "utf8");
  snapshots[snapshotSlug(selectedIds)] = {
    file: `/context/${fileName}`,
    modules: selectedIds,
    files: selectedFiles.map((entry) => entry.displayRel ?? entry.rel),
    ...stats
  };
  if (selectedIds.join(",") === DEFAULT_SNAPSHOT_SELECTION.join(",")) defaultSnapshot = snapshots[snapshotSlug(selectedIds)];
}
const snapshotBytes = defaultSnapshot?.bytes ?? 0;
const expositionText = expositionFiles
  .map((rel) => {
    const text = readGeneratedMarkdown(expositionRoot, rel);
    return `===== FILE: ${rel} =====\n${text}`;
  })
  .join("\n\n");
const expositionHtml = `${renderMarkdownFiles(expositionRoot, expositionFiles)}\n`;
writeFileSync(expositionPath, expositionText, "utf8");
writeFileSync(expositionHtmlPath, expositionHtml, "utf8");
writeFileSync(katexLayoutCssPath, renderKatexLayoutCss(), "utf8");
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      commit,
      builtAt,
      bytes: snapshotBytes,
      approxTokens: defaultSnapshot?.approxTokens ?? approxTokens,
      repoUrl,
      expositionPaths: expositionFiles,
      snapshotModules: SNAPSHOT_MODULES.map(({ id, label }) => ({
        id,
        label,
        files: (snapshotModules[id] ?? []).map((entry) => entry.displayRel ?? entry.rel)
      })),
      defaultSnapshotModules: DEFAULT_SNAPSHOT_SELECTION,
      snapshots
    },
    null,
    2
  )}\n`,
  "utf8"
);

const relativeSnapshot = path.relative(path.dirname(scriptPath), snapshotPath).replaceAll(path.sep, "/");
const relativeExposition = path.relative(path.dirname(scriptPath), expositionPath).replaceAll(path.sep, "/");
const relativeExpositionHtml = path.relative(path.dirname(scriptPath), expositionHtmlPath).replaceAll(path.sep, "/");
const relativeKatexLayoutCss = path.relative(path.dirname(scriptPath), katexLayoutCssPath).replaceAll(path.sep, "/");
const relativeManifest = path.relative(path.dirname(scriptPath), manifestPath).replaceAll(path.sep, "/");
console.log(`SOURCE_COMMIT=${commit}`);
console.log(`CONTEXT_APPROX_TOKENS=${approxTokens}`);
console.log(`CONTEXT_SNAPSHOT=${relativeSnapshot}`);
console.log(`CONTEXT_SNAPSHOT_BYTES=${snapshotBytes}`);
console.log(`EXPOSITION_MARKDOWN=${relativeExposition}`);
console.log(`EXPOSITION_HTML=${relativeExpositionHtml}`);
console.log(`KATEX_LAYOUT_CSS=${relativeKatexLayoutCss}`);
console.log(`CONTEXT_MANIFEST=${relativeManifest}`);
