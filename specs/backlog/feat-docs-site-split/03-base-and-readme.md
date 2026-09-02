# Phase 3 — Refresh `index.html` and the docs README ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the base page documents getting started without a tracker, the command
reference covers everything that ships, and `docs/README.md` describes two pages
instead of one.

## Tasks

- [ ] Replace the Linear-flavoured "Get started" on `index.html` with a **base**
      one: `npx @skitterbyte/skitterspec init`, what lands in `.claude/` and
      `specs/`, the lifecycle buckets, and per-spec isolation — ending with a
      hand-off to `linear.html` for anyone who wants a tracker.
- [ ] Add the missing rows to the command reference: `/spec-linear-setup` and
      `/spec-sync`, both in the Linear group.
- [ ] Correct the reference's framing that the Linear group "only lights up when
      a `linear.config.json` is present" — true for sync, but `/spec-linear-setup`
      and `spec-sync doctor` are precisely the commands you run *before* one
      exists.
- [ ] Update `docs/README.md`: two pages and what each owns, previewing both
      locally, and that the `/docs` branch deploy serves `linear.html` at
      `/linear.html` with no extra configuration.
- [ ] Replace the stale verification line in `docs/README.md` with the versions
      actually checked against, and note that the check is "every command named
      on a page exists", not a version pin.
- [ ] Re-verify every skill named across both pages against the installed
      skills, and every `spec-sync` verb against the dispatch — the same check
      phase 2 applies to `linear.html`, run over the pair.
- [ ] Confirm both pages still render standalone, theme toggle and
      reduced-motion intact.

## Notes

The version line in `docs/README.md` went stale because it pinned numbers nobody
re-checks. Recording the *check* instead of the *version* is what stops it
rotting again — the numbers move every release, the invariant does not.
