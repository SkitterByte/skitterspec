---
linear_issue_id: "SKS-143"
---

# Phase 5 — strip the tab machinery from `/spec-start` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** starting a spec does one thing — build the worktree and tell you where
it is. Everything that existed to move a shell or open a terminal is gone, and
the skill has one path through it instead of three.

Independent of phases 1–4; buildable first if you want the simplification before
the viewer.

## Tasks

- [ ] Remove the **`open.command`** config key entirely: the default in
      `packages/common/src/env/config.js`, its merge branch, `expandOpenCommand`
      in `src/env/render.js`, `openCommand` on the provision plan
      (`src/env/provision.js`), and the line that prints it in `src/cli.js`.
- [ ] Drop the `open` block from this repo's own
      `specs/.core/env.config.json` too. Nothing else needs doing: the config
      merge copies known keys only, so any leftover `open` block anywhere is
      ignored rather than rejected.
- [ ] Collapse `/spec-start` step 3 in
      `packages/common/assets/skills/spec-start/SKILL.md` from three branches to
      **one**: provision, bootstrap with `cd "<worktreePath>" && …` in a single
      call, housekeep with `git -C <worktreePath>`, print the path, say to run
      `/spec-next` from a session there. Delete the `EnterWorktree` step, the
      cwd-already-in-a-worktree branch, the availability branch, and the
      "never `cd` first" warning that only existed to protect the call.
- [ ] Keep the worktree **trust** step. It is not tab machinery: worktrees live
      outside the checkout, and the `additionalDirectories` entry is what stops
      Claude prompting on the first write. Keep the `/add-dir` note with it.
- [ ] Rewrite `packages/common/test/assets-spec-start-enter.test.js` to guard the
      new shape: the skill names exactly one path, never mentions
      `EnterWorktree`, and never mentions `open.command`. The old assertions
      invert — that is the point of them existing.
- [ ] Update `packages/common/assets/rules/spec-planning.md`: `worktree` mode no
      longer "moves the session you typed into". Say what it does — builds the
      branch in its own checkout and tells you the path.
- [ ] Strip the opener from the docs: the `open.command` block in
      `packages/common/assets/core/env.config.md`, the recipe list in
      `packages/common/README.md`, and any mention on `docs/index.html`.
- [ ] Delete the opener's own tests (`env-provision.test.js` openCommand cases,
      the `env-config.test.js` default/override case) rather than leaving them
      asserting a key that no longer exists.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done. The built distributions under `packages/skitterspec*`
      are composed by `scripts/build-dist.js`, so change only `common`/`linear`
      and let the build carry it.

## Notes

**What is deliberately NOT removed.** `spec-env connect` (canonical ports) and
`/spec-live` (the overlay) are not tab machinery — they exist to reach a
*running app*, not to move a shell, and a web project still needs both. Same for
`spec-env dev`. If they should go too, that is a separate decision on its own
evidence, not a side effect of this one.

The three specs this phase cleans up after — SKS-82, SKS-121, SKS-134 — are all
cancelled with their reasoning intact. The opener survived SKS-121's cancellation
only because nothing had been built to replace it; phases 1–4 are that
replacement, which is what makes deleting it safe now rather than earlier.
