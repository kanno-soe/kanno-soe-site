import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canUseNativeMathML,
  hasSuitableMathFont,
  supportsNativeMathML
} from "../public/math-rendering.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function probeDocument({ width = 77, height = 23, fonts } = {}) {
  const state = { appended: false, removed: false };
  const mspace = {
    getBoundingClientRect() {
      return { width, height };
    }
  };
  const probe = {
    className: "",
    setAttribute() {},
    querySelector(selector) {
      return selector === "mspace" ? mspace : null;
    },
    remove() {
      state.removed = true;
    }
  };
  const documentRef = {
    fonts,
    body: {
      appendChild(node) {
        assert.equal(node, probe);
        state.appended = true;
      }
    },
    createElement(tagName) {
      assert.equal(tagName, "div");
      return probe;
    }
  };

  return { documentRef, probe, state };
}

test("recognizes MathML only when the dimensioned mspace is laid out", () => {
  const supported = probeDocument();
  assert.equal(supportsNativeMathML(supported.documentRef), true);
  assert.equal(supported.probe.className, "mathml-support-probe");
  assert.deepEqual(supported.state, { appended: true, removed: true });

  const unsupported = probeDocument({ width: 0, height: 0 });
  assert.equal(supportsNativeMathML(unsupported.documentRef), false);
  assert.deepEqual(unsupported.state, { appended: true, removed: true });
});

test("accepts only a loaded face from the known local math-font family", async () => {
  let query = "";
  let sample = "";
  const available = await hasSuitableMathFont(
    {
      async load(nextQuery, nextSample) {
        query = nextQuery;
        sample = nextSample;
        return [{ status: "loaded" }];
      }
    },
    { timeoutMs: 20 }
  );

  assert.equal(available, true);
  assert.equal(query, '16px "KSMD Math"');
  assert.equal(sample, "∫∑√∞");
  assert.equal(await hasSuitableMathFont({ async load() { return []; } }, { timeoutMs: 20 }), false);
});

test("skips font loading when MathML layout is unavailable", async () => {
  let loadCalls = 0;
  const { documentRef } = probeDocument({
    width: 0,
    height: 0,
    fonts: {
      async load() {
        loadCalls += 1;
        return [{ status: "loaded" }];
      }
    }
  });

  assert.equal(await canUseNativeMathML({ documentRef, timeoutMs: 20 }), false);
  assert.equal(loadCalls, 0);
});

test("treats probe errors as an HTML-fallback result", async () => {
  const documentRef = {
    body: {},
    createElement() {
      throw new Error("probe unavailable");
    }
  };

  assert.equal(await canUseNativeMathML({ documentRef, timeoutMs: 20 }), false);
});

test("enables native MathML only after layout and font checks both pass", async () => {
  const { documentRef } = probeDocument({
    fonts: {
      async load() {
        return [{ status: "loaded" }];
      }
    }
  });

  assert.equal(await canUseNativeMathML({ documentRef, timeoutMs: 20 }), true);
});

test("keeps display math in vertical flow while scrolling wide formulas", () => {
  const css = readFileSync(path.join(projectRoot, "public", "style.css"), "utf8");
  const blockRule = css.match(/\.markdown-body \.math-block \{([^}]*)\}/u)?.[1] ?? "";
  const displayRule = css.match(/\.markdown-body \.math-block \.katex-display \{([^}]*)\}/u)?.[1] ?? "";

  assert.doesNotMatch(blockRule, /overflow-[xy]:/u);
  assert.match(displayRule, /overflow-x:\s*auto;/u);
  assert.match(displayRule, /overflow-y:\s*hidden;/u);
});
