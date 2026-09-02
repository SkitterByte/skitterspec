# Phase 1 — Pure rewrite planner over stamps, snapshots and config ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** given an old and new team key, enumerate every machine-read field that
must change — and nothing else — as a pure plan, proven by fixtures that include
prose the planner must leave alone.

## Tasks

- [ ] Add `packages/sync-core/src/retarget.js` with `planRetarget({ dir, oldKey,
      newKey, config })` returning `{ stamps, snapshots, configKey }` — no writes.
      **Move `packages/linear/src/doctor.js` here rather than writing it fresh:**
      `scanDrift` is `planRetarget` with the old key implicit, and its
      `rewriteFrontmatter` / snapshot-key logic already does the work below.
      Drop its `mentions` category — prose is out of scope (decision 5), and
      counting it only existed to caveat a repair that now never touches prose.
- [x] `stamps`: for each `specs/**/*.md`, rewrite `SKI-<n>` → `SKS-<n>` **only**
      inside the leading `---` frontmatter block, covering `linear_identifier`,
      `linear_url` (identifier segment only, slug preserved) and
      `linear_issue_id`. Reuse `parseFrontmatter` from `normalize.js`.
      *(Built in 10.4.0 as `rewriteFrontmatter`; carries over with the move.)*
- [x] `snapshots`: for each `{sync.baseDir}/<oldKey>-<n>.base.json`, plan the
      rename plus the `subIssues` key remap, preserving each hash value and the
      file's existing formatting. *(Built in 10.4.0; hash preservation is proven by the round-trip test where `spec-sync status` still reads `up to date`.)*
- [ ] Add `deriveRecordedKey(dir, config)` — returns `config.linear.teamKey` when
      set, else the single prefix observed across `specs/**` stamps; returns a
      structured "ambiguous" result (never a throw) when the stamps disagree, so
      the caller phrases its own refusal.
- [ ] Export both from `packages/sync-core/index.js`.
- [ ] Add `packages/sync-core/test/retarget-plan.test.js` covering: frontmatter
      rewritten; **prose containing `SKI-28` left byte-identical**; a doc
      placeholder outside frontmatter untouched; `linear_url` slug preserved;
      snapshot rename + re-key; `deriveRecordedKey` with an empty `teamKey`; and
      the ambiguous-stamps case. Port the equivalents out of
      `packages/linear/test/cli-doctor.test.js` — the first five already exist
      there; only `deriveRecordedKey`'s two cases are new.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

Prose is the phase's sharpest constraint and the reason the planner is pure and
fixture-tested: a naive repo-wide `SKI-` → `SKS-` substitution passes a casual
eyeball and quietly rewrites history. Frontmatter-only is the whole rule.
