# Phase 2 — Config schema + loader ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec.config.json` is defined, documented, and read by the
generators at runtime, with safe defaults when absent or partial.

## Tasks

- [x] Add the zero-dep loader: `loadConfig(dir)` reads
      `skitterspec.config.json` from `dir` (default `process.cwd()`),
      `JSON.parse`es it, merges over defaults, returns a normalised config.
      Missing file → all defaults. Exports `DEFAULT_CONFIG` + schema `version`.
      **Implemented in `assets/scripts/lib/config.js`** (ships with the
      generators); `src/config.js` re-exports it for the CLI — see Notes.
- [x] Define defaults: `changelog.enabled=true`, `changelog.file="CHANGELOG.md"`,
      `releases.enabled=true`, `releases.file="RELEASES.md"`,
      `releases.productName=<basename(dir)>`, `releases.scopeAreas={}`,
      `versionHook=true`, `version=1`.
- [x] Wire the generator CLI entrypoints (`generate-changelog.js`,
      `generate-releases.js`) to call `loadConfig()` and feed filename,
      `productName`, and `scopeAreas` into the (already-parameterised) functions
      from Phase 1. The header text in `generate-releases.js` uses `productName`.
- [x] Validate gracefully: a malformed config file prints a clear error and
      exits non-zero; unknown keys are ignored (forward-compat); an `enabled:false`
      feature makes its generator a no-op that logs and exits 0.
- [x] Add `test/config.test.js` — defaults when no file; merge of a partial
      file; product-name default from dir basename; malformed JSON path.
- [x] Add `test/generate-releases.test.js` cases proving `scopeAreas` from
      config override the Title-Case fallback, and `productName` reaches the
      rendered header.
- [x] Run `node --test` — green before the phase is done (48 pass, 0 fail).

## Notes

The loader lives in `src/` (shared by the CLI and importable by the shipped
scripts via a relative path once copied). Decide at implementation time whether
the copied `scripts/` read config through a tiny inlined reader or a copied
`scripts/lib/config.js` — prefer copying a `scripts/lib/config.js` so the
consumer's scripts have no dependency back into the skitterspec package.

**As-built:** chose the copied-`lib/config.js` option. The loader implementation
lives in `assets/scripts/lib/config.js` (so it ships next to the generators and
gets copied into the consumer's `scripts/lib/` in Phase 3 — zero back-dependency
on the package). `src/config.js` is a one-line re-export of that module so the
CLI has a stable `src/`-relative import. Single source of truth, no duplication.
`scopeAreas` is replaced wholesale on merge (it's a complete map), not
deep-merged. Generators resolve config in `main()` and exit 0 (no-op) when a
feature is disabled.
