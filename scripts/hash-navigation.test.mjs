import assert from "node:assert/strict";
import test from "node:test";
import { scrollToHashTarget } from "../public/hash-navigation.js";

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
