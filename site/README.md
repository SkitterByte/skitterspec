# site/

Marketing + docs site for **skitterspec** and the **skitterspec-linear** superset.

A single, self-contained `index.html` — no build step, no dependencies, all CSS
and JS inlined. It lives outside the `packages/*` pnpm workspace glob, so it has
no effect on `pnpm install` or the release tooling.

## Preview locally

Just open the file:

```
open site/index.html          # macOS
```

Or serve it (any static server works):

```
npx serve site
```

## Deploy (GitHub Pages, no CI needed)

The lowest-friction path, since there's no existing CI:

1. Repo **Settings → Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `main`, **Folder:** `/site`.

GitHub serves `site/index.html` directly. (No `.nojekyll` needed — it's a single
self-contained file with no `_`-prefixed asset paths.)

Prefer a workflow instead? Add `.github/workflows/pages.yml` using
`actions/upload-pages-artifact` pointed at `site/`.

## Editing

`index.html` is theme-aware (light/dark, with a manual toggle), responsive, and
respects `prefers-reduced-motion`. Keep it dependency-free — inline any new CSS
or JS rather than linking a CDN. Content is verified against the package source
(skitterspec v13, skitterspec-linear v6); update the version line in the footer
when those bump.
