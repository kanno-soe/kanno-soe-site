const SOURCE_REPO_URL = "https://github.com/kanno-soe/kanno-soe";
const MARKDOWN_CONTENT_TYPE = "text/markdown";

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; font-src 'self'"
};

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    secured.headers.set(key, value);
  }
  return secured;
}

function textResponse(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "text/plain; charset=utf-8");
  headers.set("cache-control", "no-store");
  return withSecurityHeaders(new Response(body, { ...init, headers }));
}

interface MediaPreference {
  q: number;
  specificity: number;
  order: number;
}

function mediaPreference(accept: string, mediaType: string): MediaPreference | null {
  const [candidateType, candidateSubtype] = mediaType.toLowerCase().split("/");
  let best: MediaPreference | null = null;

  for (const [order, entry] of accept.split(",").entries()) {
    const [range, ...parameters] = entry.split(";").map((part) => part.trim());
    const [type, subtype] = range.toLowerCase().split("/");
    if (!type || !subtype) continue;
    if (type !== "*" && type !== candidateType) continue;
    if (subtype !== "*" && subtype !== candidateSubtype) continue;

    let q = 1;
    for (const parameter of parameters) {
      const match = parameter.match(/^q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i);
      if (match) q = Number(match[1]);
    }

    const specificity = type === "*" ? 0 : subtype === "*" ? 1 : 2;
    if (!best || specificity > best.specificity) best = { q, specificity, order };
  }

  return best;
}

function prefersMarkdown(request: Request): boolean {
  const accept = request.headers.get("accept");
  if (!accept) return false;

  const markdown = mediaPreference(accept, MARKDOWN_CONTENT_TYPE);
  if (!markdown || markdown.q === 0) return false;

  const html = mediaPreference(accept, "text/html");
  if (!html || html.q === 0) return true;
  if (markdown.q !== html.q) return markdown.q > html.q;
  if (markdown.specificity !== html.specificity) return markdown.specificity > html.specificity;
  if (markdown.order !== html.order) return markdown.order < html.order;
  return false;
}

function withAcceptVary(response: Response): Response {
  const varied = new Response(response.body, response);
  const current = varied.headers.get("vary");
  const values = current
    ? current
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  if (!values.some((value) => value.toLowerCase() === "accept")) values.push("Accept");
  varied.headers.set("vary", values.join(", "));
  return varied;
}

function prependText(prefix: string, body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const prefixBytes = new TextEncoder().encode(prefix);
  let prefixPending = true;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (prefixPending) {
        prefixPending = false;
        controller.enqueue(prefixBytes);
        return;
      }

      const chunk = await reader.read();
      if (chunk.done) {
        controller.close();
        return;
      }
      controller.enqueue(chunk.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
}

function markdownPreamble(request: Request): string {
  const origin = new URL(request.url).origin;
  return [
    "# Kannō-Sōe Mutual Dependence (KSMD)",
    "",
    "A formal-theory reconstruction of Zen metaphysics and soteriology.",
    "",
    "## Source and downloads",
    "",
    `- [Repository](${SOURCE_REPO_URL})`,
    `- [Download Code](${origin}/context/kanno-soe-code.md)`,
    `- [Download Exposition](${origin}/context/kanno-soe-exposition.md)`,
    `- [Download the default Code + Exposition snapshot](${origin}/context/kanno-soe.md)`,
    "",
    "---",
    "",
    ""
  ].join("\n");
}

async function fetchAsset(
  request: Request,
  env: Env,
  pathname: string,
  forwardRequestHeaders = true
): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  return env.ASSETS.fetch(
    new Request(url, {
      method: request.method,
      headers: forwardRequestHeaders ? request.headers : undefined
    })
  );
}

async function markdownHome(request: Request, env: Env): Promise<Response> {
  const exposition = await fetchAsset(request, env, "/context/exposition.md", false);
  if (!exposition.ok) {
    const body =
      request.method === "HEAD"
        ? null
        : "# Kannō-Sōe Mutual Dependence (KSMD)\n\nThe frozen Exposition is not available in this build.\n";
    return withAcceptVary(
      withSecurityHeaders(
        new Response(body, {
          status: exposition.status,
          headers: {
            "content-type": `${MARKDOWN_CONTENT_TYPE}; charset=utf-8`,
            "cache-control": "no-store"
          }
        })
      )
    );
  }

  const headers = new Headers(exposition.headers);
  headers.set("content-type", `${MARKDOWN_CONTENT_TYPE}; charset=utf-8`);
  headers.delete("accept-ranges");
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("content-range");
  headers.delete("etag");
  const body =
    request.method === "HEAD"
      ? null
      : exposition.body
        ? prependText(markdownPreamble(request), exposition.body)
        : markdownPreamble(request);
  return withAcceptVary(
    withSecurityHeaders(
      new Response(body, {
        status: exposition.status,
        statusText: exposition.statusText,
        headers
      })
    )
  );
}

async function fetchStatic(request: Request, env: Env): Promise<Response> {
  return withSecurityHeaders(await env.ASSETS.fetch(request));
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/") {
    if (prefersMarkdown(request)) return markdownHome(request, env);
    return withAcceptVary(await fetchStatic(request, env));
  }
  if (request.method === "GET" || request.method === "HEAD") return fetchStatic(request, env);

  return textResponse("Method not allowed", { status: 405 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error(error);
      return textResponse("Internal server error", { status: 500 });
    }
  }
} satisfies ExportedHandler<Env>;
