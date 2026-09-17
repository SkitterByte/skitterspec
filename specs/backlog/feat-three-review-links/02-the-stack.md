---
linear_issue_id: "SKS-322"
---

# Phase 2 — The render stacks them, labelled ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every render prints one line per tier — `local`, `network`, `remote` —
each a URL or a greyed line naming the command that turns it on, so a reader
anywhere can see which one reaches them.

## Tasks

- [ ] Replace the single `open:` line with a stack, in a fixed order — `local`,
      `network`, `remote` — so the same tier is always in the same place.
- [ ] Print an **enabled** tier as its URL: `local` is the loopback http URL
      (not `file://` — that page cannot POST), `network` the LAN one,
      `remote` the published URL when this spec has been published before.
- [ ] Print a **disabled or unavailable** tier as one greyed line naming what
      would turn it on: the `allow` command for a setting that is off, and for
      `remote` with no published page, the fact that publishing is an ask.
- [ ] **Keep `also:` for the extra interfaces**, but under `network` where they
      belong, and **only addresses a reader could plausibly reach** — today it
      offers Parallels adapters (`10.211.55.2`, `10.37.129.2`) as alternatives
      to a working link, which is the misleading follow-up this folds in.
- [ ] **Say which tiers the wait covers.** `local` and `network` share one store,
      so the wait is real for both; `remote` writes to the artifact's own store
      and needs `/spec-reviewed`. One line, next to `remote`, not a paragraph.
- [ ] Carry the same structure in `--json` as an array of tiers, so a skill reads
      it rather than parsing prose.
- [ ] Tests: all three enabled prints three labelled lines in order; a disabled
      network prints the `allow` command and no URL; `remote` with no published
      page says publishing is an ask; the `also:` lines carry no address the
      machine cannot route from.
- [ ] **Stays-silent test** (rule 3): a render whose only reachable tier is
      `local` prints exactly one URL and no warnings — a machine with no network
      is not a problem to report.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The fixed order matters more than it looks. A reader who has learnt that the
middle line is the one their phone opens should not have to re-read the labels
every render, and a stack that reorders itself by availability would make them.

This is also where the misleading `also:` addresses finally get fixed, rather
than in a spec of their own: they are alternatives *to the network tier*, and
they only make sense once the tier is named.
