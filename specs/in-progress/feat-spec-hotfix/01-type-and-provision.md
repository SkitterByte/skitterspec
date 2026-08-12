# Phase 1 — Hotfix type + fork-from-tag provisioning + live refusal ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** The isolation engine understands a `Type: Hotfix` spec, provisions its
worktree forked from the spec's `Base version` **tag** (not `main`), and the live
engine refuses it — all proven by unit tests, with no skill/CLI UX yet.

## Tasks

- [ ] `resolve.js` `splitPrefix`: accept `hotfix` — regex `^(feat|bug|hotfix)-(.+)$`
      so a `hotfix-<slug>` folder resolves to `{ type: 'hotfix', slug }` and the
      branch pattern yields `hotfix/<slug>`.
- [ ] `resolve.js` `resolveSpec`: read the `> **Base version:** <tag>` blockquote
      field from `00-overview.md` (new `readBaseVersionField` helper, same idiom
      as `readStackField`) into `spec.baseRef` (null when absent / non-hotfix).
- [ ] `provision.js` `planUp`: when `spec.baseRef` is set, emit
      `git worktree add <path> -b <branch> <baseRef>` (fork from the tag); when
      absent, keep the current `-b <branch>` form (fork from base HEAD). Attach
      (existing branch) form is unchanged.
- [ ] `live.js` `take` planner: refuse when `spec.type === 'hotfix'` with a clear
      reason ("hotfix is built on an old tag — use /spec-connect, not /spec-live");
      return the existing structured-refusal shape so the skill phrases it.
- [ ] Add/extend tests (`*.test.js` beside each module, `node --test`): prefix
      split for `hotfix-`; `Base version` parsed into `baseRef` (and null when
      missing); `planUp` command string includes the tag for a hotfix and omits
      it for a feature; `live take` refuses a hotfix and still allows a feature.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

- `Base version` is authored by the `/spec-hotfix` skill (Phase 3); this phase
  only needs the engine to *read* it, so tests use fixtures.
- No `hotfix` config block yet — that arrives with the landing engine (Phase 2).
