---
linear_issue_id: "SKS-305"
---

# Phase 1 — Disowning stops needing a worktree ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-env review <spec> --drop <code>` clears a pass on a spec whose
worktree is gone, proven by a test that fails today, while every path that reads
the diff or acts on a verdict still refuses.

## Tasks

- [x] **Write the failing test first.** A spec resolvable from `specs/complete/`
      with a pending pass and no worktree on disk: `--drop <code>` clears it and
      exits without the provision message. This is red against `cli.js` as it
      stands.
- [x] Move the `--drop` branch (`cli.js:2227`) ahead of the worktree check
      (`cli.js:2046`) in `specEnvReview`. The pending store lives in the primary
      checkout, so the branch reads and writes `.spec-env/reviews/` only.
- [x] Keep the check for every other path — the render, `--claim`,
      `--claim-since`, `--notes`, `--verdict`, `--resolve`. Each either reads the
      diff through `git -C <worktree>` or acts on a verdict that needs the tree.
- [x] **Name the blind spot beside the relaxed gate**
      (`.claude/rules/negative-checks.md` rule 2): what would fool it is a spec
      folder **deleted** rather than completed — `resolveSpecWithWorktree` has no
      document to resolve, so the pass stays unreachable *by name* and only
      `review waiting` can see it. Relaxing the worktree check does not cover
      that, deliberately.
- [x] Rewrite the refusal the worktree-requiring paths emit. Today it says
      `run /spec-start to provision it`, which for a completed spec is advice to
      resurrect it in order to throw a pass away. It should name the pass count
      when there is one, `--drop <code>`, and `spec-env review waiting`.
- [x] Clear the ten waiting passes with repeated `--drop`, and record each code
      and verdict in the spec's Changelog — dropping a verdict unread is a
      decision, so it goes on the record.
- [x] Tests: `--claim` on a worktree-less spec still refuses **and** its message
      names `--drop`; `--drop` on a provisioned spec behaves exactly as it does
      today; a code matching nothing still refuses and still names nothing.
- [x] **Stays-silent test** (rule 3): a repo whose specs are all provisioned and
      have no waiting pass produces byte-identical output for the render, for
      `review waiting`, and for a `--drop` of an unknown code.
- [x] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

The ten passes are good fixtures, so run `spec-env review waiting` before the
clear-out and keep the output for the test's expectations.

Dropping them is the last task, not the first: the test must be red against the
current code, and the fixtures are what prove the fix on real data.

## What this phase found

**The refusal needed to be two messages, not one rewritten one.** Decision 3
reads as though `run /spec-start to provision it` should go — and for a reader
holding a stranded pass it should. But that message is overwhelmingly read by
someone pointing at a spec in `backlog/` that nobody has started, and there
`/spec-start` is exactly the right advice. So the branch is on a **positive
signal** — a pass actually sitting in the store — and the no-pass message is left
byte-for-byte as it was. A corrupt store reads as zero and takes the untouched
message rather than inventing a count.

**A successful drop with no worktree had to become its own ending.** The
existing `--drop` deliberately falls *through* to the render, so the page is
rewritten without the pass on it. With no worktree there is no page to rewrite,
so the gate turns that case into an ending instead — reported with the same
`dropped: <code> — merged nothing` spelling the render uses, because a drop
reported one way here and another way there is two events to anyone reading
their scrollback.

**The refusal now says why claiming is not offered.** A reader told only
"disown it" can reasonably ask why they cannot just claim it; the answer — with
no worktree a verdict has nowhere to land — is one line and was previously left
to be worked out.

**The ten fixtures, dropped and recorded**, every one a committing verdict on a
spec that has since landed:

| Spec | Code | Verdict | Sent |
|------|------|---------|------|
| `feat-verdict-is-the-action` | 068804 | commit | 2026-09-14 |
| `feat-verdict-is-the-action` | 259403 | commit | 2026-09-14 |
| `feat-verdict-is-the-action` | 934749 | commit | 2026-09-14 |
| `feat-verdict-is-the-action` | 608223 | commit-continue | 2026-09-14 |
| `feat-page-knows-the-phase` | 282653 | commit-continue | 2026-09-14 |
| `feat-page-knows-the-phase` | 403376 | commit | 2026-09-14 |
| `feat-page-hands-you-the-command` | 837325 | commit-continue | 2026-09-14 |
| `feat-seamless-review-loop` | 592598 | commit-continue | 2026-09-15 |
| `bug-review-gate-hook-install` | 416964 | commit | 2026-09-15 |
| `feat-no-pass-waits-unheard` | 635132 | commit | 2026-09-16 |

Each approved work that is already on `main` — the specs completed and landed
with their verdicts given another way — so nothing was discarded that had not
already been acted on. `spec-env review waiting` now says *nothing waiting*.
