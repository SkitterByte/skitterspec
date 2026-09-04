---
linear_issue_id: "SKS-59"
---

# Phase 1 — `spec-env` reference on index.html ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `index.html` documents all ten `spec-env` verbs, each labelled by who
runs it, and the docs-claims suite fails if the engine gains a verb the page does
not mention. Proven by the new bidirectional guard.

## Tasks

- [x] Classify all ten verbs from `packages/common/src/cli.js`'s dispatch, not by
      guesswork. They fall into three groups, and the page uses those groups:
      **planners** (`up`, `down`, `integrate`, `hotfix land`) that print commands
      and create nothing; **actions** (`dev`, `connect`, `live`) a skill or command
      drives; and **`resolve` / `prune` / `status`**, which have no skill in front
      of them.
- [x] Add the reference section to `docs/index.html`, matching the existing table
      markup and section rhythm, with a **Run by** column naming the skill or
      command that drives each verb.
- [x] Add the "the ones you'd actually type" block, quoting **real** output — every
      sample was run in this worktree and pasted, per `bug-stale-docs-samples`.
- [x] State plainly that the planners create nothing and the skill runs what they
      print — the single most misleading thing about the engine if left unsaid.
- [x] Document that **the spec name is optional**, resolving from the worktree you
      are standing in (shipped in `feat-script-only-commands`) — the page is the
      first place that behaviour is described anywhere.
- [x] Extend `scripts/docs-claims.test.js` with an `ENGINES` map and a forward
      check: every verb the dispatch exposes must appear on the page, or sit in
      that engine's `undocumented` map **with a reason** (asserted non-empty).
- [x] Add the reverse check: every verb the page documents must be dispatched.
- [x] Add a **stays-silent** test: a documented verb and a reasoned allowlist entry
      both pass without a failure.
- [x] Run `pnpm test` — **1263 green** — and `pnpm build`.

### Found while documenting

- [x] `spec-env status` reads only the **Docker slot registry**, so in a project
      with `docker.enabled: false` it reports `no provisioned specs` while
      worktrees are standing. Documented honestly with a caveat pointing at
      `git worktree list` / `spec-env resolve`. **Logged as a follow-up bug** —
      not fixed here, since this is a docs branch.

## Notes

Both guard directions caught a real mistake as they were written, which is the
evidence they are not vacuous: the forward check demanded docs for `init`
(my extractor had run past the end of `specEnv()` into cli.js's own top-level
switch), and the reverse check demanded a verb called `is`, matched from the
prose *"spec-env is the per-spec isolation engine"*. Both now read the table's
`<td class="cmd">` cells and a function-bounded slice of the dispatch.

The verb list must come from the dispatch, not from the usage string. Those two
already disagree in shape: the usage string writes `hotfix` where the dispatch
takes `hotfix land <spec>`, and `dev` where it takes `dev up|down`. Document the
real invocation.
