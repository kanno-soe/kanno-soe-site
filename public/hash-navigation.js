export function scrollToHashTarget({ documentRef = document, locationRef = window.location } = {}) {
  if (!locationRef.hash || locationRef.hash === "#") return false;

  const encodedId = locationRef.hash.slice(1);
  let targetId = encodedId;
  try {
    targetId = decodeURIComponent(encodedId);
  } catch {
    // Match the browser's best-effort handling of malformed URL fragments.
  }

  const target = documentRef.getElementById(targetId);
  if (!target) return false;

  target.scrollIntoView();
  return true;
}
