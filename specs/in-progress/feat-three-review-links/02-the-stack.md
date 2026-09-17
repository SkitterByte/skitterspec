---
linear_issue_id: "SKS-322"
---

# Phase 2 — The render stacks them, labelled ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every render prints one line per tier — `local`, `network`, `remote` —
each a URL or a greyed line naming the command that turns it on, so a reader
anywhere can see which one reaches them.

## Tasks

- [x] Replace the single `open:` line with a stack, in a fixed order — `local`,
      `network`, `remote` — so the same tier is always in the same place.
- [x] Print an **enabled** tier as its URL: `local` is the loopback http URL
      (not `file://` — that page cannot POST), `network` the LAN one,
      `remote` the published URL when this spec has been published before.
- [x] Print a **disabled or unavailable** tier as one greyed line naming what
      would turn it on: the `allow` command for a setting that is off, and for
      `remote` with no published page, the fact that publishing is an ask.
- [x] **Keep `also:` for the extra interfaces**, but under `network` where they
      belong, and **only addresses a reader could plausibly reach** — today it
      offers Parallels adapters (`10.211.55.2`, `10.37.129.2`) as alternatives
      to a working link, which is the misleading follow-up this folds in.
- [x] **Say which tiers the wait covers.** `local` and `network` share one store,
      so the wait is real for both; `remote` writes to the artifact's own store
      and needs `/spec-reviewed`. One line, next to `remote`, not a paragraph.
- [x] Carry the same structure in `--json` as an array of tiers, so a skill reads
      it rather than parsing prose.
- [x] Tests: all three enabled prints three labelled lines in order; a disabled
      network prints the `allow` command and no URL; `remote` with no published
      page says publishing is an ask; the `also:` lines carry no address the
      machine cannot route from.
- [x] **Stays-silent test** (rule 3): a render whose only reachable tier is
      `local` prints exactly one URL and no warnings — a machine with no network
      is not a problem to report.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The fixed order matters more than it looks. A reader who has learnt that the
middle line is the one their phone opens should not have to re-read the labels
every render, and a stack that reordered itself by availability would make them.

This is also where the misleading `also:` addresses finally got fixed, rather
than in a spec of their own: they are alternatives *to the network tier*, and
they only make sense once the tier is named. The ranking already put virtuals
last, so the best guess was always right — what was wrong was offering them at
all. `offerableLanAddresses` drops them and keeps `unknown`-tier interfaces,
because a machine with unusual naming is likelier to have a real address than a
fake one.

**`reviewServedUrls` now always carries the loopback URL.** It returned `null`
for a wide-bound server with no LAN address, which threw the loopback URL away
with it — and a `0.0.0.0` server answers on `127.0.0.1` too, so `local` is a
real tier even on a machine with no network. That test was rewritten to assert
both halves: no invented network URL, and a surviving local one.

**Two outputs were removed, deliberately.** The old fallback printed
*"will not open where you are reading"* and a `serve: --host 0.0.0.0` hint —
both telling the reader what was *not* available. The stack states every tier
and its state instead, which answers the same question positively and names a
**setting** rather than a one-off flag. Their tests were rewritten to assert the
replacement rather than deleted.

**Twenty-one tests moved**, all because the single `open:` line became a stack.
Most were one substitution on a shared `urlOf` helper; the ones worth reading
are the two above, where the assertion was about behaviour that is now gone.

**One test was failing for a reason that had nothing to do with this phase.**
`runQuiet` hijacks `process.stdout.write`, and `node --test` writes its report
to the same stream — so a call that awaits long enough captured the runner's
binary protocol, which then matched `/error|failed/` against an embedded
`test:fail` event and broke a `--json` parse. The render now runs in a child
process, which is the pattern the other serving suites already use.
