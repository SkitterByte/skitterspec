# Phase 3 — Skills: /spec-hotfix, hotfix-aware /spec-complete, /spec-live note ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** The operator-facing surface: a new `/spec-hotfix` skill that captures a
Hotfix spec and drives it red→green on a tag-forked worktree, a `/spec-complete`
that lands a hotfix via the Phase 2 engine, and a `/spec-live` that documents the
refusal enforced in Phase 1.

## Tasks

- [x] New `packages/common/assets/skills/spec-hotfix/SKILL.md`, modelled on
      `spec-bug/SKILL.md` (test-first), with these differences:
      - **Argument:** `/spec-hotfix <tag> <name>` — require the base tag; if
        absent, ask. Verify the tag exists (`git rev-parse --verify <tag>^{commit}`)
        before provisioning; refuse with a clear message otherwise.
      - **Capture:** seed `specs/in-progress/hotfix-<name>/00-overview.md` with
        `> **Type:** Hotfix`, `> **Base version:** <tag>`, `> **Status:** In
        Progress`, a `## Symptom` and `## Fix` block — lean, like a Bug spec.
      - **Provision:** run `skitterspec spec-env up hotfix-<name>` (now forks the
        worktree from the tag) and the same worktree-move + bootstrap + trust
        steps as `/spec-bug` §2. Isolation is required for a hotfix — if
        `env.config.json` is absent, say so and stop (no in-place fallback).
      - **Red→green:** failing test first on the branch, then the minimal fix,
        then `pnpm test` green. Never touch `main`.
      - **Stack:** default `> **Stack:** worktree`; note escalation to
        `worktree + docker` when the fix touches stateful services, and that
        `/spec-live` is refused either way (use `/spec-connect`).
- [x] `spec-complete/SKILL.md`: **`/spec-complete` is the one completion skill —
      it handles a hotfix end-to-end, differing only where noted.** No separate
      `/spec-hotfix-complete`. Make it type-aware:
      - **Step 2 (verify):** treat `Type: Hotfix` like `Type: Bug` — confirm the
        originally-failing test named in the spec now passes (the proof the
        hotfix works).
      - **Steps 3–5 (update spec, `git mv` to `complete/`, report):** unchanged.
      - **Step 6 (land):** branch on type — a `Type: Hotfix` spec runs
        `skitterspec spec-env hotfix land <name>` (drive its printed commands in
        order; on a cherry-pick conflict, abort that step and hand back, mirroring
        the integrate conflict handling) **instead of** `spec-env integrate`.
        State clearly that landing tags **locally** and the operator pushes the
        deploy tag; re-run tests on `main` after the cherry-pick.
      - **Step 7 (teardown):** unchanged — relies on the Phase 2 "tagged branch
        counts as landed" logic so a hotfix tears down without `--force`.
- [x] `spec-live/SKILL.md`: add a line under "Code-only" that a `Type: Hotfix`
      spec is always refused (enforced by the engine) — use `/spec-connect`.
- [x] Add/extend a build test (`scripts/build-dist.test.js` or `compose.test.js`)
      asserting the `spec-hotfix` skill is present in **both** built distributions
      (`skitterspec` and `skitterspec-linear`) after a build, and that its
      frontmatter `name: spec-hotfix` is intact.
- [x] Run `pnpm test` — green before the phase is done. **258 common + 35 scripts, 0 fail.**

## Notes

- The skill files live only in `packages/common/assets/skills/` (the source of
  truth); the distributions are regenerated in Phase 4 via `pnpm build`.
- No Linear seam work: `/spec-hotfix` is filesystem-only in v1 (a hotfix is
  reactive; tracker linking can come later if wanted).
