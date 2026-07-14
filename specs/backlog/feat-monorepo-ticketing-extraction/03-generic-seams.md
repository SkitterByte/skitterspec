# Phase 3 — Generic seams + compose + neutral branch naming ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** The shared `/spec` and `/spec-go` in `common` are provider-agnostic with
named seam markers; a zero-dep compose step fills them from a provider's fragments
(empty for base). Branch naming is provider-neutral isolation config. Proven by:
`scripts/compose.test.js` (base-empty, superset-filled, seam-coverage) and the
env tests pass.

## Tasks

- [ ] Port the seam-marked shared skills into `common`: `/spec` Phase E → generic
      "link to a ticketing provider" wrapping `<!-- seam:spec-tracker-link -->`;
      `/spec-go` step 3b → generic "pull from the tracker first" wrapping
      `<!-- seam:spec-go-pull -->`. Scrub `assets/rules/spec-planning.md` of
      Linear-specific prose (generic provider seam + skill-name/CLI contract).
- [ ] Port `scripts/compose.js` (+ `scripts/compose.test.js`): `composeText`,
      `loadFragments`, `composeAssets` — fixed-marker string substitution, zero-dep,
      idempotent. The `linear` package supplies a fragment per declared seam.
- [ ] Port the **provider-neutral branch naming** into `packages/common`: move
      branch config into `env.config.json` (`branch.pattern` + `branch.identifierField`);
      `env/resolve.js` `branchFor` expands `{type}/{slug}` and only reads the named
      frontmatter field when the pattern uses `{identifier}`. Remove `linkLinear`,
      `loadLinearConfig`, `readLinearIdentifier`, `LINEAR_CONFIG` from `resolve.js`;
      update `env.config.json.example` + `env.config.md`. Point the linear provider
      docs at `env.config.json` (no `branch` block in `linear.config`).
- [ ] Update `env-resolve` + `env-config` tests for the neutral branch naming; run
      `node --test` — green. Confirm `resolve.js` and the composed base are
      `grep -ri linear` clean.

## Notes

- Seam names are the contract between `common` and any provider — adding a provider
  = supplying fragments for existing seam names, never editing `common`.
- Fragment doc-comment headers must not embed a literal `<!-- … -->` (HTML comments
  don't nest; the non-greedy strip would stop early). Name the seam without markers.
