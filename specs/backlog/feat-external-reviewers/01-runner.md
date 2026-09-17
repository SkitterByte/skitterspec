---
linear_issue_id: "SKS-335"
---

# Phase 1 — The contract and the runner ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `runReviewers()` takes a config and a worktree and returns checks plus
one outcome per reviewer — proven by tests that a missing binary, a crash, a
timeout and a garbage stream each produce zero findings, exit 0, and a named
outcome.

## Tasks

- [ ] Add `review.reviewers` to `DEFAULT_CONFIG` (empty array) in
      `packages/common/src/env/config.js`, and merge it in `mergeConfig` —
      validating each entry as either `{use}` or `{name, command, format}`,
      dropping an entry that is neither (and listing it in the unknown-key
      report, which already exists).
- [ ] Add `packages/common/src/env/reviewers.js` with a pure `parseRdjsonl(text)`
      → `{findings, malformed}`: one JSON object per line,
      `{path, range:{start:{line}}, severity, message}`. A line that does not
      parse is **counted, not fatal** — the same call that drops one bad line
      keeps the other forty.
- [ ] Add pure `levelFor(severity)` — `error` → `flag`, anything else →
      `confirm`, never `good` (Decision 9).
- [ ] Add pure `substitute(command, vars)` for `${scope}`, `${base}`, `${spec}`,
      `${worktree}`. An unknown `${…}` is left verbatim rather than blanked, so a
      typo shows up in the command that failed instead of silently becoming an
      empty argument.
- [ ] Add `runReviewer(entry, ctx)` — spawn with `cwd` = the worktree, the
      entry's `timeout` (default 180s), stdout captured, stderr kept for the
      outcome detail. Returns `{checks, outcome}` where `outcome.state` is one of
      `findings` · `clean` · `failed` · `timeout` · `missing`.
- [ ] Add `runReviewers(config, ctx)` — run each entry **in sequence** (a free
      tier is rate-limited per hour; two reviewers racing is how you spend two
      and get one), collect checks and outcomes, and never throw. A single
      reviewer's failure is its own outcome, not the run's.
- [ ] Add the cache: `.spec-env/reviews/<spec>.checks.json`, holding
      `{version, spec, diffHash, at, checks, outcomes}`. Pure `readChecks` /
      `writeChecks` mirroring `readNotes` / `writeNotes`, including the
      **corrupt** third state — an unreadable cache is a miss, never an empty
      result.
- [ ] Add pure `diffHashOf(files)` — a stable hash over the collected files'
      paths and patches, so an unchanged diff reuses findings and any change at
      all re-runs.
- [ ] Add `.spec-env/reviews/*.checks.json` to whatever ignores the sibling
      sidecars (confirm `.spec-env/` is already ignored wholesale; if it is,
      this task is a check rather than an edit).
- [ ] **Stays-silent tests** (`.claude/rules/negative-checks.md` rule 3), one per
      healthy-but-unusual input, each asserting zero findings, no throw, and a
      named outcome: binary not on `PATH` (`missing`); exit 1 with a rate-limit
      message on stderr (`failed`, detail preserved); exit 0 with empty stdout
      (`clean`); exit 0 with HTML on stdout (`failed`, malformed count reported);
      a command that never returns (`timeout`); `reviewers: []` (no outcomes, no
      work done); a corrupt cache file (treated as a miss).
- [ ] Add tests for the positive path: two reviewers, findings from both, ordered
      and each carrying its `source`; a cache hit on an unchanged diff hash; a
      cache miss on a changed one.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`runReviewers` writes nothing to the page and knows nothing about rendering —
phase 2 wires it in. Keeping it a pure-ish module with one spawn boundary is
what makes the stays-silent tests cheap enough to actually write.

**The blind spot to name beside the outcome logic:** a reviewer that exits 0 with
empty stdout is indistinguishable, from here, between "reviewed it and found
nothing" and "silently declined". Only the adapter knows the difference (phase 3
teaches the CodeRabbit one to recognise its own auth and rate-limit failures),
so the generic path calls it `clean` and the page says which reviewer said so.
