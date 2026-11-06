---
github_issue_id: "#110"
---

# Phase 4 — completion: disposition guard + two-run complete; cancel abandons PR ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-complete` in PR mode is two runs — ready the PR after every
loose end is disposed, then finish after the merge — and `/spec-cancel` closes
the door it opened.

## Tasks

- [x] Engine: no new verb needed — `spec-env integrate` IS both runs (decision
      recorded in the Changelog): a `(pr)` plan is run 1 (rebase, consent-gated
      push, create-or-ready via `prPlanCommand` — a draft met without `--draft`
      is flipped ready); a landed branch prints the **finish** — base catch-up
      in the primary checkout plus the deferred `afterLand` with the land's own
      range (`plan.finish`, the `hotfix land`/`finish` shape). Bucket move and
      teardown stay the skill's.
- [x] Disposition input: `spec-env disposition [<spec>] [--json]`
      (`env/disposition.js`, pure `collectDisposition`) — unticked tasks with
      file:line, phase-index rows not `✅`, `Follow-up surfaced:` changelog
      lines (all of them: whether a spec followed is not knowable from the
      file, so the operator reads the list). Information only; never refuses.
- [x] Fork `/spec-complete` (SKILL.md §6-pr): disposition pass first (tick with
      evidence · spin off a linked ticket · drop with a dated reason; refuse to
      ready while anything is undisposed), consent naming branch/base/remote,
      run the plan, defer the finalise (§4 move follows `land.specDocs`:
      trunk → run 2 on base; branch → rides the PR), stop keeping the
      worktree. Run 2: finish commands + deferred afterLand, the §4 move,
      re-test, §7 teardown (host-merged counts as landed; auto-deleted remote
      branch is an already-gone no-op).
- [x] `/spec-cancel` in PR mode: a forced teardown past an open/draft PR plans
      the abandon in the confirm-first `remoteCommands` (never run blind), the
      skill asks and runs it before any remote branch delete.
- [x] `spec-env integrate --strategy <ff|pr>`: per-invocation override of
      `land.strategy` (config stays the default) — LSC's mixed flow. An
      unrecognised value refuses by name (a flag typo is retypable now, unlike
      a config typo), never falls through to the other strategy.
- [x] The push-consent ask names the **base branch** as well as the remote
      (SKILL.md §6-pr step 2) — a spec that outlived a release roll is caught
      by the operator reading a stale rc name. Engine-side staleness check
      stays with the rolling-base follow-up spec.
- [x] No new review-page verdict; report vocabulary (`PR #N opened` /
      `PR #N merged`) is phase 6's rule text, as planned.
- [x] Tests: disposition enumeration (unticked/nested, non-✅ rows, follow-ups,
      clean stays-silent, null input), `prPlanCommand` state table, finish plan
      (with and without primaryPath), forced-down abandon + its stays-silent
      pair, CLI `--strategy` both directions + unknown-value refusal, CLI
      host-landed finish with real afterLand range, CLI disposition + --json.
- [x] Run `pnpm test` — green (4296 pass). Guard tests caught four integration
      gaps and were satisfied properly: `disposition` added to SPEC_ENV_VERBS,
      --help, both verb enumerations in rules/config docs, and a minimal
      `docs/reference.html` entry (full docs pass stays phase 6); one bold-span
      wrap fixed; base-skill wording kept tracker-free.

## Notes

Why the guard is mandatory here: once the PR is ready, anyone can merge from
the host UI and the tracker closes the ticket — `/spec-complete` run 1 is the
last moment skitterspec is guaranteed to be standing there. Spun-off tickets
are minted at disposition time (not queued), so a follow-up survives even if
run 2 never happens on this machine.
