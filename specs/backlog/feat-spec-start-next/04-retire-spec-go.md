---
linear_issue_id: "SKS-90"
---

# Phase 4 — Retire /spec-go ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** no shipped surface names `/spec-go`; upgrades remove it; history says
where it went.

## Tasks

- [ ] Delete `packages/common/assets/skills/spec-go/` and add it to `init`'s
      retired-files removal so `skitterspec update` deletes the installed copy.
- [ ] Rename the provider seam `spec-go-start` → `spec-next-start`: the marker in
      the (new) spec-next skill and `packages/linear/assets/seams/spec-go-start.md`
      move together in one commit — a build-time contract, and the compose
      guards fail loudly on a half-rename.
- [ ] Sweep the remaining references (24 files at spec time — re-grep, don't
      trust the count): every skill's prose and template headers ("the handle
      you paste into `/spec-start`"), `spec-planning.md`, `claude-md-section.md`
      (currently 0 — keep it so), READMEs, `env.config.md`, linear SETUP/config
      docs, and the engine's user-facing messages in `cli.js`/`live.js`/
      `teardown.js` ("run /spec-go first" → `/spec-start`).
- [ ] Write the MIGRATION.md entry (spec-go → spec-start + spec-next, with the
      one-line why) and copy-through via the existing build step.
- [ ] Add `spec-go` to `RETIRED_SKILLS` in `docs-claims.test.js` — MIGRATION.md
      stays outside SURFACES, so documenting the removal stays sayable — and
      update the spec-init enumeration (the counting test forces this).
- [ ] Run `pnpm build` + full `pnpm test`; the assets-prose guard ("every
      /spec-… named ships") is the mechanical straggler-sweep — green before the
      phase is done. Major version bump noted for the next release.
