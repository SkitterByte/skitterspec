# Phase 2 — Config schema + loader ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec.config.json` is defined, documented, and read by the
generators at runtime, with safe defaults when absent or partial.

## Tasks

- [ ] Add `src/config.js` — a zero-dep loader: `loadConfig(dir)` reads
      `skitterspec.config.json` from `dir` (default `process.cwd()`),
      `JSON.parse`es it, deep-merges over defaults, and returns a normalised
      config. Missing file → all defaults. Export `DEFAULT_CONFIG` and the
      schema `version`.
- [ ] Define defaults: `changelog.enabled=true`, `changelog.file="CHANGELOG.md"`,
      `releases.enabled=true`, `releases.file="RELEASES.md"`,
      `releases.productName=<basename(dir)>`, `releases.scopeAreas={}`,
      `versionHook=true`, `version=1`.
- [ ] Wire the generator CLI entrypoints (`generate-changelog.js`,
      `generate-releases.js`) to call `loadConfig()` and feed filename,
      `productName`, and `scopeAreas` into the (already-parameterised) functions
      from Phase 1. The header text in `generate-releases.js` uses `productName`.
- [ ] Validate gracefully: a malformed config file prints a clear error and
      exits non-zero; unknown keys are ignored (forward-compat); an `enabled:false`
      feature makes its generator a no-op that logs and exits 0.
- [ ] Add `test/config.test.js` — defaults when no file; merge of a partial
      file; product-name default from dir basename; malformed JSON path.
- [ ] Add `test/generate-releases.test.js` cases proving `scopeAreas` from
      config override the Title-Case fallback, and `productName` reaches the
      rendered header.
- [ ] Run `node --test` — green before the phase is done.

## Notes

The loader lives in `src/` (shared by the CLI and importable by the shipped
scripts via a relative path once copied). Decide at implementation time whether
the copied `scripts/` read config through a tiny inlined reader or a copied
`scripts/lib/config.js` — prefer copying a `scripts/lib/config.js` so the
consumer's scripts have no dependency back into the skitterspec package.
