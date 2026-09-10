---
linear_issue_id: "SKS-133"
---

# Phase 3 — `--force` must not write through a link ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec update --force` in a self-hosted checkout refuses the
linked paths instead of writing composed assets into `packages/*/assets`.

## Tasks

- [ ] In `writeFile` (`packages/common/src/init.js`), when `force` is set and the
      target is a **live** symlink, refuse it: write nothing, record it in the
      report, and name the path plus what to do (unlink it, or run the relink
      script). Keep the existing **dangling**-symlink branch exactly as it is —
      that one is a repair and is correct.
- [ ] Surface the refusals in the command's output as their own group, not folded
      into `skipped`. "Skipped because you edited it" and "refused because
      writing would corrupt the asset it links to" are different facts, and a
      reader who cannot tell them apart will reach for a bigger hammer.
- [ ] Name the blind spot beside the check: this fires on a live symlink only.
      A **hard** link would take the same corrupting path and is invisible to
      `lstat` — out of scope, and said so rather than left to be discovered.
- [ ] Add tests over a temp tree: `--force` through a live symlink refuses and
      leaves **the link target's content unchanged** (assert the target file, not
      just the exit code — the whole point is what did not get written); a
      dangling symlink is still repaired; a plain file is still overwritten by
      `--force`; and without `--force` a linked target is skipped as before.
- [ ] Confirm the refusal cannot fire in an ordinary consumer install — nothing
      there is linked — with a test asserting a normal `--force` run reports zero
      refusals.
- [ ] Run `pnpm test` at the repo root, and in `packages/linear` — green before
      the phase is done.

## Notes

This is the only phase that changes shipped code, and it changes the meaning of
`--force`. The refusal is narrow on purpose: it fires only where writing would
follow a link out of `.claude/` and into the assets the link points at, which
cannot happen in a consumer.
