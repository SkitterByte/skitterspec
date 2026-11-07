---
github_issue_id: "#117"
---

# Phase 4 — Skills, config reference, docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the operator meets the retarget where they already look, and the
config is documented.

## Tasks

- [x] `/spec-start`, `/spec-complete`, `/spec-to-main`: relay the engine's
      retarget line and the no-match refusal (naming `spec-env base`)
- [x] `env.config.md`: document `baseBranchPattern`, precedence, newest-by-date,
      why no-match refuses, and the overlapping-rc caveat (pin instead) — and that `*` does not cross `/` (`rc/*` misses `rc/a/b`)
- [x] `docs/reference.html`: `spec-env base` and the key; bump `verified:`
- [x] Tests: asset text assertions for the relayed lines; `node scripts/docs-freshness.js check`; run `pnpm test` — green before done
