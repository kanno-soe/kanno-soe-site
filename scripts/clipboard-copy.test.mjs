import assert from "node:assert/strict";
import test from "node:test";
import { copyTextFromUrl, freezeFailedCopy } from "../public/clipboard-copy.js";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

class FakeClipboardItem {
  constructor(data) {
    this.data = data;
  }
}

test("starts a ClipboardItem write before the snapshot response arrives", async () => {
  const response = deferred();
  const events = [];
  const clipboard = {
    async write([item]) {
      events.push("write");
      const blob = await item.data["text/plain"];
      assert.equal(blob.type, "text/plain");
      assert.equal(await blob.text(), "snapshot contents");
      events.push("written");
    }
  };

  const copy = copyTextFromUrl("/context/kanno-soe.md", {
    fetchRequest() {
      events.push("fetch");
      return response.promise;
    },
    clipboard,
    ClipboardItemClass: FakeClipboardItem,
    BlobClass: Blob
  });

  assert.deepEqual(events, ["fetch", "write"]);

  response.resolve({
    ok: true,
    async text() {
      return "snapshot contents";
    }
  });
  await copy;

  assert.deepEqual(events, ["fetch", "write", "written"]);
});

test("falls back to writeText when ClipboardItem writes are unavailable", async () => {
  const response = deferred();
  let copiedText = "";
  const copy = copyTextFromUrl("/context/kanno-soe.md", {
    fetchRequest: () => response.promise,
    clipboard: {
      async writeText(text) {
        copiedText = text;
      }
    },
    ClipboardItemClass: undefined
  });

  assert.equal(copiedText, "");
  response.resolve({ ok: true, text: async () => "fallback contents" });
  await copy;

  assert.equal(copiedText, "fallback contents");
});

test("rejects the copy when the snapshot response is unsuccessful", async () => {
  const copy = copyTextFromUrl("/context/kanno-soe.md", {
    fetchRequest: async () => ({ ok: false }),
    clipboard: { writeText: async () => assert.fail("writeText should not run") },
    ClipboardItemClass: undefined
  });

  await assert.rejects(copy, /Snapshot could not be loaded/);
});

test("keeps a failed copy control frozen", () => {
  const button = { disabled: false, textContent: "Copying" };
  const status = { textContent: "" };

  freezeFailedCopy(button, status);

  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "Copy failed");
  assert.equal(status.textContent, "Copy failed. Reload the page to try again.");
});
