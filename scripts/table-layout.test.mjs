import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("keeps exposition tables within the available page width", () => {
  const css = readFileSync(path.join(projectRoot, "public", "style.css"), "utf8");
  const tableRule = css.match(/\.markdown-body table \{([^}]*)\}/u)?.[1] ?? "";
  const containerRule = css.match(/\.markdown-table-container \{([^}]*)\}/u)?.[1] ?? "";
  const cellRule = css.match(/\.markdown-body th,\s*\.markdown-body td \{([^}]*)\}/u)?.[1] ?? "";

  assert.match(tableRule, /width:\s*100%;/u);
  assert.match(tableRule, /max-width:\s*100%;/u);
  assert.match(tableRule, /table-layout:\s*fixed;/u);
  assert.match(containerRule, /max-width:\s*100%;/u);
  assert.doesNotMatch(containerRule, /overflow-x:\s*auto;/u);
  assert.match(cellRule, /min-width:\s*0;/u);
  assert.match(cellRule, /padding:\s*clamp\(/u);
  assert.match(cellRule, /overflow-wrap:\s*anywhere;/u);
});

test("wraps tables without adding a horizontal-scroll interaction", () => {
  const script = readFileSync(path.join(projectRoot, "public", "home.js"), "utf8");

  assert.match(script, /wrapper\.className = "markdown-table-container";/u);
  assert.doesNotMatch(script, /markdown-table-scroll|markdown-table-hint|Scrollable table/u);
});
