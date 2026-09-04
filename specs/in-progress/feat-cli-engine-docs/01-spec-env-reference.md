---
linear_issue_id: "SKS-59"
---

# Phase 1 — `spec-env` reference on index.html 🔄

> Spec: [00-overview.md](00-overview.md) · **Status:** In progress

**Goal:** `index.html` documents all ten `spec-env` verbs, each labelled by who
runs it, and the docs-claims suite fails if the engine gains a verb the page does
not mention. Proven by the new bidirectional guard.

## Tasks

- [ ] Classify all ten verbs — `up`, `down`, `prune`, `dev`, `connect`,
      `integrate`, `hotfix`, `live`, `status`, `resolve` — as `skill` or `you`,
      reading `packages/common/src/cli.js` rather than guessing. Note that
      `connect` and `live` are now driven by the `/spec-connect` and `/spec-live`
      **commands**, so they are `you` by way of a command, not a bare CLI call.
- [ ] Add the reference section to `docs/index.html`, matching the existing table
      markup and section rhythm (see the skills table around line 780). Include
      the **Run by** column.
- [ ] Add the "the ones you'd actually type" block for the `you` verbs, quoting
      **real** output — run each and paste what it prints, per
      `bug-stale-docs-samples`; do not compose plausible-looking output.
- [ ] Say plainly that `up`/`down`/`integrate`/`hotfix land` are **planners**:
      they print commands and create nothing, and the skill runs what they print.
      This is the single most misleading thing about the engine if left unsaid.
- [ ] Extend `scripts/docs-claims.test.js`'s existing name check to `spec-env`
      (it currently anchors on `spec-sync` only), so a verb named on the page must
      exist in the dispatch.
- [ ] Add the reverse check plus the `UNDOCUMENTED` allowlist described in
      Decision 4, with a reason string per entry.
- [ ] Add a **stays-silent** test (`.claude/rules/negative-checks.md` rule 3): a
      verb correctly documented, and one correctly allowlisted, must both produce
      no failure — so the guard cannot fire on the healthy case.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

The verb list must come from the dispatch, not from the usage string. Those two
already disagree in shape: the usage string writes `hotfix` where the dispatch
takes `hotfix land <spec>`, and `dev` where it takes `dev up|down`. Document the
real invocation.
