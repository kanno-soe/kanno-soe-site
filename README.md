# Kannō-Sōe Mutual Dependence (KSMD) Site

Cloudflare Worker + static self-serve UI for using the kanno-soe source with AI
tools. The home page provides frozen context snapshots, a rendered Exposition,
and a link to the public GitHub repository.

## Setup

Add these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `SOURCE_READ_TOKEN`

The deploy workflow checks out the `kanno-soe` source repository, reads its
committed Exposition Markdown, writes the public frozen context bundles,
typechecks, and deploys. Until `CLOUDFLARE_API_TOKEN` is configured, the
workflow warns and skips only the final deploy step.

## Source Repo Notification

Add this workflow to `kanno-soe/.github/workflows/notify-site.yml` so pushes
to the source repo redeploy the site with a fresh frozen context:

```yaml
name: Notify site

on:
  push:
    branches: [main]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch site rebuild
        env:
          GH_TOKEN: ${{ secrets.SITE_DISPATCH_TOKEN }}
          SITE_REPO: ${{ github.repository_owner }}/website
          SOURCE_SHA: ${{ github.sha }}
        run: |
          gh api "repos/${SITE_REPO}/dispatches" \
            --method POST \
            --field event_type=source-push \
            --raw-field client_payload="{\"sha\":\"${SOURCE_SHA}\"}"
```

`SITE_DISPATCH_TOKEN` should be a fine-grained token or GitHub App token allowed
to call `repository_dispatch` on the site repository.

## Domains

Serve the Worker at `ksmd-theory.org`. In Cloudflare, add a redirect rule:

```text
ksmd-theory.net/* -> https://ksmd-theory.org/$1
```

Use status code `301`.

## Local Preview

```sh
pnpm install
pnpm dev
```

Starting the preview refreshes a cached checkout of
`https://github.com/kanno-soe/kanno-soe` at `main`, rebuilds the frozen context
and generated KaTeX assets, and then starts Wrangler. This ensures the preview
uses the current public source content and serves every linked stylesheet.

Set `KANNO_SOE_REF` to preview another source branch or commit. Advanced local
testing can also set `KANNO_SOE_REPO_URL`.

## Manual Context Build

```sh
pnpm install
node scripts/build-context.mjs --source ../kanno-soe --repo-url https://github.com/kanno-soe/kanno-soe
pnpm run check
```

`node scripts/build-context.mjs` reads the committed Markdown from the source
checkout's `Exposition/` directory. Lines containing the `GENERATED` marker are
removed from Markdown included in the generated artifacts. Exposition HTML is
rendered with `markdown-it`; dollar-delimited inline math and fenced `math`
blocks are converted to static HTML plus MathML with KaTeX, while raw HTML in
the source Markdown remains escaped. The build also copies KaTeX's stylesheet,
fonts, and license into the ignored `public/vendor/` output directory.

KaTeX's generated HTML normally stores its vertical layout measurements in
inline `style` attributes. The context build replaces those attributes with
stable references and writes the declarations to
`public/context/katex-layout.css`, so the HTML fallback works without weakening
the site's `style-src 'self'` Content Security Policy.

KaTeX HTML is the fail-safe visual rendering. Before inserting the fetched
Exposition HTML, the page checks native MathML layout and tries to load a known
local OpenType math font. It reveals the MathML and hides the KaTeX HTML only
when both checks pass, so unsupported browsers, missing fonts, and failed or
inconclusive probes retain the static HTML rendering.

The build writes the default modular snapshot at
`public/context/kanno-soe.md`, all alternate module-selection snapshots,
`public/context/exposition.md`, `public/context/exposition.html`,
`public/context/katex-layout.css`, and `public/context/manifest.json`; the
directory is ignored because those files are generated from the source
checkout.

## Self-Serve Use

`GET /` serves the unrecorded self-serve page.

- Choose snapshot modules on the home page and download the matching Markdown
  file.
  The default selection is Code plus Exposition; the page updates the byte count
  and token estimate for the current selection. This keeps answers pinned to the
  exact frozen commit used by the deployed site.
- Read the rendered Exposition Markdown committed to the source repository on
  the home page.
- Connect an AI assistant's GitHub connector to the public source repository.
  This avoids downloading a file, but the connector reads live `main`, so its
  answers can drift from the frozen site context.

Requests to `/` that prefer `text/markdown` over `text/html` receive the raw
Exposition Markdown. The response begins with the site's introductory context,
repository link, and individual Code and Exposition download links.

The page fetches `/context/manifest.json` for commit/date/size metadata.

## Acceptance Checks

- `/` should show the self-serve snapshot and GitHub connector choices.
- `/` should render every Markdown file under the source repository's
  `Exposition/` directory beneath the self-serve choices.
- Requests to `/` that prefer `text/markdown` should receive the raw Exposition
  Markdown with source and per-module `.md` download links first.
- Direct `/context/*.md` responses should declare
  `Content-Type: text/markdown; charset=utf-8`.
- After a local context build, `/context/kanno-soe.md` and the alternate
  module-selection snapshots should exist, and `public/context/exposition.html`
  should contain the rendered Exposition Markdown.
  `public/context/manifest.json`'s `commit` should equal the checked-out source
  commit.
