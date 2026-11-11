---
github_identifier: "#180"
github_url: "https://github.com/SkitterByte/skitterspec/issues/180"
---

# /spec-next lists manual steps in the terminal

> **Type:** Feature
> **Name:** feat-spec-next-manual-steps
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/180
> **Author:** Reuben Greaves
> **Raised:** 2026-11-11
> **Area:** packages/common/assets/skills/spec-next/SKILL.md, the five distribution copies of it, docs/reference.html
> **Stack:** worktree
> **Docs:** reference

## Summary

When `/spec-next` reaches steps a person has to perform, such as a manual test
pass, it prints them in full in the terminal as a numbered list. It then asks
whether they are done, ticks the ones you confirm and records any that failed,
so you no longer have to open the spec file to find out what to do.

## Problem

`/spec-next` §3 says "work task by task" and has no idea what a manual task is.
On a phase of manual testing it improvised: it said the next steps were manual
and pointed at the phase file. The reader had to leave the terminal to find out
what to do, and nothing recorded the outcome. Manual steps belong in Issue specs
by design, and test passes appear in feature phases too, so this is the normal
case and needs a defined path.

## Acceptance criteria

- On a phase with manual steps, `/spec-next` prints every one of that phase's
  manual steps verbatim, numbered, in the conversation. It never only names the
  file.
- It then asks: All done · Some failed · Not yet.
- **All done** ticks those steps and the phase finishes as normal.
- **Some failed** asks which ones and what happened, and writes a note under
  each of them. It leaves them unticked and the phase 🔄, ends `⚠️`, and offers
  `/spec-bug` when what happened is a defect.
- **Not yet** ticks nothing, leaves the phase 🔄, and ends with `Next` saying to
  re-run `/spec-next` to pick up the same steps.
- A phase with no manual steps behaves exactly as today.

## Decisions

1. **Detection is judgment, not a marker.** Every task in an Issue spec counts
   as manual, as does any task Claude cannot perform itself (operate a UI,
   check a device, confirm something on a board). This matches kind routing,
   where signals are judged in context. Rejected: a `(manual)` marker, because
   existing specs have none and nobody keeps one up to date.
2. **List, then ask, once per phase.** At the first manual task the run builds
   the code tasks before it, then prints all of the phase's remaining manual
   steps as a numbered list and asks one three-way question. Rejected: a picker
   per step, which is tedious at fifteen steps; and list-and-stop, which loses
   the outcome.
3. **It is a mid-run question, so `spec-reports.md` is untouched.** The contract
   already permits speaking mid-run for "a question you cannot answer
   yourself", and whether a person did a step is exactly that. The steps are a
   plain markdown list, never fenced, because a fence reads as an artefact to
   skim. No third amendment to the report contract.
4. **The picker cannot enumerate steps.** It holds at most four options and a
   phase can have more steps than that. So "Some failed" is followed by a
   free-text ask for which step numbers failed and what happened.
5. **A failure is recorded, not hidden.** A note goes under the unticked task in
   the phase file, the phase stays 🔄, and the verdict is `⚠️`. A defect gets
   the `/spec-bug` hand-off offered, as kind routing already does: confirm,
   never switch silently.
6. **Code tasks after a manual step wait.** Task order is kept. If code tasks
   follow an unconfirmed manual step, the run stops at the question rather than
   building past a check that has not passed.
7. **The end-of-phase path is unchanged.** A phase that finishes still renders
   its page, arms the gate and waits as §5 says. A phase left 🔄 by "Some
   failed" or "Not yet" did not end, so it renders nothing and arms nothing.

## Solution overview

A new subsection in `/spec-next` §3, "Manual steps", covers detection, the list,
the three-way ask, and how each answer is recorded. §4 gains one line: a failed
manual step keeps its box unticked with its note. §6 Report adds the `⚠️` case
and the `Next` row for "Not yet" and "Some failed". The change is made in
`packages/common` and carried to the five distribution copies the way the build
already does it.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill | update | `/spec-next` §3 Manual steps, §4 failure note, §6 verdicts/Next |
| Business rule | add | manual steps listed verbatim + All done · Some failed · Not yet |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `/spec-next` lists and confirms manual steps | ⬜ | [01-manual-steps.md](01-manual-steps.md) |

## Open questions

- None

## Changelog

- 2026-11-11 — Spec created.
