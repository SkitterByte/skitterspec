---
linear_issue_id: "SKS-321"
---

# Phase 1 — The tiers, and what turns them on ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `review.allowNetwork` and `review.allowRemote` exist, decide the bind
and whether publishing is permitted, and `spec-env review allow <tier>` writes
them — proven by a test that flips each and watches the bind follow.

## Tasks

- [x] Add `review.allowNetwork` (default `true`) and `review.allowRemote`
      (default `false`) to `DEFAULT_CONFIG`, validated the way the other review
      keys are: a non-boolean leaves the default standing rather than being read
      as a refusal.
- [x] **Take the bind from `allowNetwork`, not from reader detection.** That is
      the last thing detection decided, and the guess is what this spec exists
      to remove: `allowNetwork` binds `0.0.0.0`, off binds loopback.
- [x] Say beside it that `reader` now decides only wording on a failed serve, and
      that if it ever decides nothing it should be **removed** rather than kept
      as a vestige.
- [x] Add `spec-env review allow <network|remote> [--off]`, which writes the
      setting into `specs/.core/env.config.json` and prints what changed.
- [x] **`allow remote` permits, it does not publish.** Say so in its output, and
      say what a publish costs: a page skitterspec cannot delete, and a verdict
      there needs `/spec-reviewed` rather than waking the wait.
- [x] **Name the blind spot beside the writer** (`.claude/rules/negative-checks.md`
      rule 2): it edits a **committed** config file, so turning network reviews
      on for yourself turns them on for everyone who pulls. Say that in the
      output rather than leaving it to be discovered by a colleague's render.
- [x] Tests: each setting defaults as specified; `allow network` then a render
      binds every interface, `allow network --off` binds loopback; a non-boolean
      in the file leaves the default; `allow remote` writes the key and publishes
      nothing.
- [x] **Stays-silent test** (rule 3): a project with neither key in its config
      behaves exactly as it does today — network on, remote off, same bind, same
      URL.
- [x] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

The bind moving off detection is the quiet win here. `feat-every-render-serves`
stopped detection deciding *whether* to serve and `feat-one-review-link` stopped
it deciding the URL's shape; this takes the last decision it had.

**THE DEFAULT EXPOSURE CHANGED, and it is the one thing in this spec worth
arguing about.** `allowNetwork` defaults `true`, so a fresh project binds every
interface on its first render — where before, a local or unknown reader was
confined to loopback. `feat-every-render-serves` made a point of
*"serving more never means listening wider"* and added a test to guard it.

That guarantee **survives, conditioned on the setting**: `allowNetwork: false`
binds loopback whatever the reader, and the test asserting it was rewritten
rather than deleted, with a second test asserting the on-case binds the network.
What changed is the default, from closed to open, so a phone can open the page
with nobody configuring anything. That was the operator's decision and it is
recorded here rather than left in a commit message.

**`allow` is the first thing in this engine to write `env.config.json`**, and
running it from a worktree exposed the trap: `dir` is re-anchored to the primary
checkout, so it writes a file in a **different tree** and leaves that tree dirty
— which a later `/spec-complete` would report as pre-existing uncommitted work.
Found by running it, having to revert the surprise, and then making the output
name the absolute path and say whose tree it dirtied.

**One guard turned out to be nearly unreachable.** The verb re-reads the config
and refuses an unparseable one — but `loadEnvConfig` already rejects the whole
`spec-env` command first, naming the parse position. The branch is kept for the
file-changed-mid-run race and its comment now says so; the test asserts the
upstream refusal, because that is the behaviour a user actually meets.
