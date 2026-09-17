---
linear_issue_id: "SKS-319"
---

# Phase 1 — The daemon knows its build is old ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a render whose daemon is running an older build of the same version
replaces it and says which engine was replaced, proven by a test that touches
the script and asserts the restart.

## Tasks

- [x] **Write the failing test first.** Start a server, touch the engine script
      so its mtime moves without its version changing, render again, and assert
      the process was replaced. It is green-by-accident today: `staleServer`
      compares versions, they match, and the stale process is adopted.
- [x] Record `scriptMtime` beside `engine` when `ensureReviewServer` spawns, in
      the settings file it already writes.
- [x] Widen the staleness verdict to take the recorded mtime as well as the
      recorded version — same three answers (`stale`, `current`, `unknown`), so
      every caller downstream is untouched.
- [x] **Keep `unknown` adopting, in silence.** A settings file from before this
      exists has no `scriptMtime`, and an unreadable script has no mtime to
      compare; both are cannot-tell, and restarting a healthy server over an
      absent field is the destructive reading
      (`.claude/rules/negative-checks.md` rule 4).
- [x] **Name the blind spot beside the check** (rule 2): mtime moves when a file
      is rebuilt with **identical content**, so this can restart a server that
      did not need it. That is the harmless direction — a restart now preserves
      the URL — and it is the cost of not carrying a content manifest.
- [x] Reuse the existing replaced-engine wording rather than adding a second
      message. The reader needs to know the answering engine changed; which
      staleness signal noticed is not their question.
- [x] Tests: a moved mtime at the same version restarts; a matching mtime
      adopts; a settings file with no `scriptMtime` adopts; a changed **version**
      still restarts exactly as it does today; the token survives the restart, so
      the URL is unchanged.
- [x] **Stays-silent test** (rule 3): a render whose daemon matches the code on
      disk prints exactly what it prints today — no engine line, no restart, no
      new key in `--json`.
- [x] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

**The dependency on `feat-one-review-link` is the whole reason this is safe.**
Restarting the daemon used to mint a fresh token and kill every handed-out link,
so a check that restarted more often would have traded a broken diagnosis for a
broken link. The token now outlives the process, which is what turns "restart
it" from a cost into the obvious answer — and the URL-unchanged assertion in the
live test pins that, so the two specs cannot drift apart.

**One phase, deliberately.** The engine already had the replacement path, the
message and the token reuse; this added a second input to an existing verdict.

**`staleServer` gained two optional arguments rather than a new signature.** A
two-argument call behaves exactly as before — pinned by its own stays-silent
test — so every existing caller and test is untouched. Rejected passing objects:
it would have rewritten call sites that had nothing wrong with them.

**The rebuild was simulated by rewinding the RECORDED mtime, not by touching the
engine file.** Every test in the suite shares that file, so moving it would have
been a global side effect reaching tests that have nothing to do with this. The
recorded value is the same fact from the engine's point of view.

**Not proven against the live daemon in this repo**, and deliberately so: doing
that means restarting the real server, which is the thing that broke a reader's
link three times. The live test stands its own server up on a free port, replaces
it, and asserts the URL survived — which is the same claim without the cost.
