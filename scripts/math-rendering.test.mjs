import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseNativeMathML,
  hasSuitableMathFont,
  supportsNativeMathML
} from "../public/math-rendering.js";

function probeDocument({ width = 77, height = 23, fonts } = {}) {
  const state = { appended: false, removed: false };
  const mspace = {
    getBoundingClientRect() {
      return { width, height };
    }
  };
  const probe = {
    style: {},
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

  return { documentRef, state };
}

test("recognizes MathML only when the dimensioned mspace is laid out", () => {
  const supported = probeDocument();
  assert.equal(supportsNativeMathML(supported.documentRef), true);
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
