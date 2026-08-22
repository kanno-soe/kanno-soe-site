import assert from "node:assert/strict";
import test from "node:test";
import {
  scrollToHashTarget,
  scrollToHashTargetOnInitialNavigation
} from "../public/hash-navigation.js";

function hashFixture(hash, targetId = "section") {
  let scrolled = false;
  const target = {
    scrollIntoView() {
      scrolled = true;
    }
  };
  const documentRef = {
    getElementById(id) {
      return id === targetId ? target : null;
    }
  };

  return {
    documentRef,
    locationRef: { hash },
    didScroll: () => scrolled
  };
}

test("scrolls to a section identified by the opening URL hash", () => {
  const fixture = hashFixture("#section");

  assert.equal(scrollToHashTarget(fixture), true);
  assert.equal(fixture.didScroll(), true);
});

test("decodes URL-encoded section identifiers before finding the target", () => {
  const fixture = hashFixture("#mutual%20dependence", "mutual dependence");

  assert.equal(scrollToHashTarget(fixture), true);
  assert.equal(fixture.didScroll(), true);
});

test("leaves the page position unchanged when the hash has no target", () => {
  const fixture = hashFixture("#missing");

  assert.equal(scrollToHashTarget(fixture), false);
  assert.equal(fixture.didScroll(), false);
});

test("scrolls to a delayed hash target on a fresh navigation", () => {
  const fixture = hashFixture("#section");
  const performanceRef = {
    getEntriesByType: () => [{ type: "navigate" }]
  };

  assert.equal(scrollToHashTargetOnInitialNavigation({ ...fixture, performanceRef }), true);
  assert.equal(fixture.didScroll(), true);
});

test("leaves scroll restoration to the browser after a reload", () => {
  const fixture = hashFixture("#section");
  const performanceRef = {
    getEntriesByType: () => [{ type: "reload" }]
  };

  assert.equal(scrollToHashTargetOnInitialNavigation({ ...fixture, performanceRef }), false);
  assert.equal(fixture.didScroll(), false);
});

test("leaves scroll restoration to the browser after back or forward navigation", () => {
  const fixture = hashFixture("#section");
  const performanceRef = {
    getEntriesByType: () => [{ type: "back_forward" }]
  };

  assert.equal(scrollToHashTargetOnInitialNavigation({ ...fixture, performanceRef }), false);
  assert.equal(fixture.didScroll(), false);
});
