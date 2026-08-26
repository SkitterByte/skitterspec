# docs/

Marketing + docs site for **skitterspec** and the **skitterspec-linear** superset.

`index.html` — no build step, no dependencies, all CSS/JS and the favicon
inlined. Two sibling assets support link previews: `og.png` (the 1200×630 social
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
```

Or serve it (any static server works):

```
npx serve docs
```

## Deploy (GitHub Pages, no CI needed)

1. Repo **Settings → Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `main`, **Folder:** `/docs`.

GitHub serves `docs/index.html` at the site root. (No `.nojekyll` needed — it's a
single self-contained file with no `_`-prefixed asset paths.)

Prefer to keep an arbitrary folder name / more control? Switch the Pages source to
**GitHub Actions** and add `.github/workflows/pages.yml` using
`actions/upload-pages-artifact` pointed at the folder — but for a single static
file the `/docs` branch deploy above is the least machinery.

## Editing

`index.html` is theme-aware (light/dark, with a manual toggle), responsive, and
respects `prefers-reduced-motion`. Keep it dependency-free — inline any new CSS
or JS rather than linking a CDN. Content is verified against the package source
(skitterspec v13, skitterspec-linear v6); update the version line in the footer
when those bump.
