const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
const PROBE_WIDTH = 77;
const PROBE_HEIGHT = 23;
const PROBE_TOLERANCE = 1;
const MATH_FONT_QUERY = '16px "KSMD Math"';
const MATH_FONT_SAMPLE = "∫∑√∞";
const FONT_LOAD_TIMEOUT_MS = 1500;

export const NATIVE_MATHML_CLASS = "native-mathml";

export function supportsNativeMathML(documentRef = globalThis.document) {
  if (!documentRef?.body || typeof documentRef.createElement !== "function") return false;

  let probe;

  try {
    probe = documentRef.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;contain:layout style";
    probe.innerHTML =
      `<math xmlns="${MATHML_NAMESPACE}">` +
      `<mspace width="${PROBE_WIDTH}px" height="${PROBE_HEIGHT}px" depth="0px"></mspace>` +
      "</math>";
    documentRef.body.appendChild(probe);

    const mspace = probe.querySelector("mspace");
    if (!mspace || typeof mspace.getBoundingClientRect !== "function") return false;

    const bounds = mspace.getBoundingClientRect();
    return (
      Math.abs(bounds.width - PROBE_WIDTH) <= PROBE_TOLERANCE &&
      Math.abs(bounds.height - PROBE_HEIGHT) <= PROBE_TOLERANCE
    );
  } catch {
    return false;
  } finally {
    try {
      probe?.remove();
    } catch {
      // Detection must never prevent the static HTML fallback from rendering.
    }
  }
}

export async function hasSuitableMathFont(
  fontFaceSet,
  {
    timeoutMs = FONT_LOAD_TIMEOUT_MS,
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout
  } = {}
) {
  if (!fontFaceSet || typeof fontFaceSet.load !== "function") return false;

  const unavailable = Symbol("font unavailable");
  let fontLoad;
  try {
    fontLoad = Promise.resolve(fontFaceSet.load(MATH_FONT_QUERY, MATH_FONT_SAMPLE)).catch(() => unavailable);
  } catch {
    return false;
  }

  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeoutFn(() => resolve(unavailable), timeoutMs);
  });
  const faces = await Promise.race([fontLoad, timeout]);
  clearTimeoutFn(timeoutId);

  return Array.isArray(faces) && faces.length > 0 && faces.every((face) => face.status === "loaded");
}

export async function canUseNativeMathML({
  documentRef = globalThis.document,
  timeoutMs = FONT_LOAD_TIMEOUT_MS,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout
} = {}) {
  try {
    if (!supportsNativeMathML(documentRef)) return false;

    return await hasSuitableMathFont(documentRef.fonts, {
      timeoutMs,
      setTimeoutFn,
      clearTimeoutFn
    });
  } catch {
    return false;
  }
}
