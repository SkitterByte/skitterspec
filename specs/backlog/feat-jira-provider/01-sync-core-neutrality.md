---
linear_issue_id: "SKS-371"
---

# Phase 1 — De-Linearise sync-core & common ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** sync-core and common carry zero Linear vocabulary; every existing
Linear test stays green, proving the parameterisation is behaviour-preserving.

## Tasks

- [ ] Add a `fields` block to the provider config surface (identifier, url,
      issueId, assigneeId, assigneeName key names); `packages/linear/src/config.js`
      defaults it to the current `linear_*` names.
- [ ] Thread `fields` through sync-core: `normalize.js:391,723`, `write.js:152`,
      `retarget.js:44` (`STAMP_FIELDS`), `legacy.js:31-32` — no literal
      `linear_` string survives in `packages/sync-core/src`.
- [ ] Parameterise `retarget.js:257` — config file path and team-key JSON key
      come from the caller, not a hardcoded `linear.config.json` path.
- [ ] Extract the dialect hook: `joinEmphasisAcrossBreaks`/`canonicalizeMarkdown`
      (`normalize.js:91-223`), `tables.js`, and `verify.js` `canonicalForCompare`/
      `stream` become a `dialect` object the provider passes in; Linear's moves
      to `packages/linear/src/dialect.js`. Default dialect is identity.
- [ ] `compare.js` hashes `descriptionStream` via the injected dialect; snapshot
      format unchanged for Linear (assert byte-identical `.base.json` on the
      existing fixtures).
- [ ] Generalise `remoteStateName` (`normalize.js:923-929`) and
      `remoteDescriptionEdited` (`compare.js:125-137`) so the adapter can
      supply the remote state/description accessors.
- [ ] `common/src/env/resolve.js:192-194` — resolve the spec identifier via
      `branch.identifierField` from `env.config.json` instead of the literal
      `linear_identifier`/`linear_url` reads; keep those exact names as the
      documented default so existing repos resolve unchanged.
- [ ] Deduplicate `LIFECYCLE_BUCKETS` (defined in `sync-core/normalize.js:692`,
      `sync-core/retarget.js:34`, linear `config.js:216`, common resolve
      `BUCKETS`) into one sync-core export.
- [ ] Add stays-silent tests (`.claude/rules/negative-checks.md` rule 3): a
      repo with no provider config still resolves; a spec with no identifier
      frontmatter accuses nothing.
- [ ] Run the full workspace suite (`pnpm -r test`) — all common, sync-core,
      and linear tests green before the phase is done.

## Notes

Shippable as a refactor-only `skitterspec-linear` release; doing so before
phase 3 is the regression proof Decision 2 relies on.
