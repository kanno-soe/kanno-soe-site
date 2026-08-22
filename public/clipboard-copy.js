export function copyTextFromUrl(
  url,
  {
    fetchRequest = globalThis.fetch,
    clipboard = globalThis.navigator?.clipboard,
    ClipboardItemClass = globalThis.ClipboardItem,
    BlobClass = globalThis.Blob
  } = {}
) {
  const textPromise = fetchRequest(url, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error("Snapshot could not be loaded.");
    return response.text();
  });

  if (typeof clipboard?.write === "function" && typeof ClipboardItemClass === "function") {
    const textBlobPromise = textPromise.then((text) => new BlobClass([text], { type: "text/plain" }));
    const item = new ClipboardItemClass({ "text/plain": textBlobPromise });
    return clipboard.write([item]);
  }

  if (typeof clipboard?.writeText === "function") {
    return textPromise.then((text) => clipboard.writeText(text));
  }

  return Promise.reject(new Error("Clipboard access is not available."));
}

export function freezeFailedCopy(button, status) {
  button.disabled = true;
  button.textContent = "Copy failed";
  if (status) status.textContent = "Copy failed. Reload the page to try again.";
}
