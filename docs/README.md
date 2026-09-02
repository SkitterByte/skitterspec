# docs/

Marketing + docs site for **skitterspec** and the **skitterspec-linear** superset.

Two pages, each self-contained — no build step, no dependencies, all CSS/JS and
the favicon inlined:

| Page | Owns |
|------|------|
| `index.html` | The landing page and the **tracker-free base**: the loop, the walkthrough, the full command reference, and getting started with no tracker. |
| `linear.html` | The **Linear superset**, end to end: a new team, `/spec-linear-setup`, the API key, checking with `spec-sync doctor`, and repairing a renamed team with `spec-sync retarget`. |

Each links to the other; the command reference stays whole on `index.html` so one
page still answers "what are all the commands?". Two sibling assets support link previews: `og.png` (the 1200×630 social
card, referenced by absolute URL because scrapers require a real raster image)
and `favicon.svg` (the icon source; also inlined into `index.html`). It all lives
outside the `packages/*` pnpm workspace glob, so it has no effect on
`pnpm install` or the release tooling.

`og.png` is regenerated from `../scratchpad`-style source by screenshotting an
HTML card at 1200×630 with headless Chrome — re-render it if the headline or brand
changes.

> Named `docs/` (not `site/`) because branch-based GitHub Pages only serves the
> repo root or a `/docs` folder — an arbitrary `/site` folder isn't selectable.

## Preview locally

Just open the file:

```
open docs/index.html          # macOS
open docs/linear.html
```

Or serve them (any static server works — needed if you want the cross-page links
to behave exactly as deployed):

```
npx serve docs
```

## Deploy (GitHub Pages, no CI needed)

1. Repo **Settings → Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `main`, **Folder:** `/docs`.

GitHub serves `docs/index.html` at the site root and `docs/linear.html` at
`/linear.html` — no extra configuration for the second page. (No `.nojekyll`
needed — both are self-contained files with no `_`-prefixed asset paths.)

Prefer to keep an arbitrary folder name / more control? Switch the Pages source to
**GitHub Actions** and add `.github/workflows/pages.yml` using
`actions/upload-pages-artifact` pointed at the folder — but for a single static
file the `/docs` branch deploy above is the least machinery.

## Editing

Both pages are theme-aware (light/dark, with a manual toggle), responsive, and
respect `prefers-reduced-motion`. Keep them dependency-free — inline any new CSS
or JS rather than linking a CDN. `og.png` is shared deliberately: one social card
for the project, with only `og:url` and the title/description differing per page.

**Content is verified by test, not by a version note.** `scripts/docs-claims.test.js`
asserts that every `spec-sync` verb and every `/spec-…` skill named on either page
really exists in the engine, that no in-page or cross-page link is dead, that
neither page fetches anything off-origin, and that each carries its own canonical
`og:url`. Those hold at any version, which a pinned number does not — this note
used to read "verified against v13 / v6" long after both had moved on.

Two things the tests cannot check, so check them yourself when editing: that the
prose is still true, and that the pasted command output still matches what the
command prints.
