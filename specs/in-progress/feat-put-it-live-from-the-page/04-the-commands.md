---
linear_issue_id: "SKS-328"
---

# Phase 4 — The lines name a command a person types ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every surface line names the **one command** that changes it, `remote`
gets a slash command of its own, and the page stops offering to hand `main`
back.

## Tasks

- [x] Add `--set <on|off|"">` to `spec-env review allow <tier>` — an empty value
      **toggles**, `on`/`off` are explicit, anything else is refused by name.
      Bare `allow <tier>` and `--off` keep their exact current behaviour, so
      every existing caller and test is untouched.
- [x] Ship **`/spec-remote-review`** (`assets/commands/spec-remote-review.md`),
      `disable-model-invocation` like its two siblings, relaying the engine
      verbatim. Bare toggles; `on`/`off` are accepted after it. `init`/`update`
      discover `assets/commands/*.md`, so shipping the file installs it.
- [x] Make the text render name a command rather than describe a capability:
      `live: off — /spec-live to put it live`,
      `live: on — running at <url>; /spec-live main to restore main`,
      `remote: off — /spec-remote-review to turn it on`.
- [x] **Drop `live-off`** from the page, from `ACTIONS`, and from `/spec-diff`
      §2b's routing (decision 14). Putting *this* change live is about this
      review; handing the whole instance back to `main` is a workspace decision
      that has nothing to do with the diff on screen.
- [x] Tests: the toggle in all three forms and the refusal; the command file's
      contract (user-only, one verb, relays verbatim); each line names its
      command; no page offers `live-off`.
- [x] **Stays-silent test** (`.claude/rules/negative-checks.md` rule 3): an
      `unavailable` live state still prints nothing, and `network` keeps naming
      the engine command rather than gaining a slash command nobody asked for.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

**Why a command and not a link.** The banner is markdown in a terminal, so the
only clickable thing it has is a URL — and a URL that *acts* when fetched is one
a link previewer or a prefetcher can fire without a person. Three shapes were
weighed (act on open; act on open except the one that commits; open the page at
the strip) and all three were rejected as more machinery than the problem is
worth. What was actually wanted is simpler: **say the command**, so nobody has
to reconstruct it.

**Why `network` keeps the engine command.** It is ON by default, so turning it
off is a rare deliberate act; a slash command per tier is clutter for the tier
nobody touches. The engine accepts `--set` for both tiers either way, so
shipping `/spec-network-review` later is a one-file change if that turns out to
be wrong.

**The quotes on `$ARGUMENTS` are load-bearing**, and a test says so.
`--set "$ARGUMENTS"` passes an empty string for a bare invocation, which is the
toggle; unquoted, bare drops the argument entirely and `--set` swallows whatever
comes next — or nothing, which reads as the flag never having been passed. That
is the whole reason `--set` takes a **word** rather than being `--toggle`: a
slash command makes one static substitution, so the word the person typed has to
reach the engine as a word.

**Two extra places had to learn the command**, or it would have been a control
nobody discovers: `spec-planning.md`'s skills-vs-commands paragraph, which is
the canonical list every spec skill points at, and `spec-reports.md`'s banner
example. The rule also records *why* these are commands and not links, so the
next reader does not re-propose the clickable banner and rediscover the
prefetcher problem.

**One thing to know about running this while building it.** Exercising the
toggle wrote `review.allowRemote` into the **primary checkout's**
`specs/.core/env.config.json` — a committed file — and it was reverted. That is
`allow` behaving exactly as documented; it is worth naming because the obvious
way to check a config writer is to run it, and here running it dirties a tree
you are not standing in.
