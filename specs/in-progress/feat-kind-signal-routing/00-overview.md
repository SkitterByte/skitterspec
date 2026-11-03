---
github_identifier: "#100"
github_url: "https://github.com/SkitterByte/skitterspec/issues/100"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Signal-based kind routing in the entry skills

> **Type:** Feature
> **Name:** feat-kind-signal-routing
> **Status:** In Progress — Phase 1 (started 2026-11-03)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-11-03
> **Area:** packages/common/assets/skills/{spec,spec-bug,spec-hotfix,spec-incident}/SKILL.md, packages/common/assets/rules/spec-planning.md, packages/common/test, docs/reference.html
> **Stack:** worktree
> **Docs:** reference

## Problem

`/spec` is the default door — especially for someone new to skitterspec, for
whom "spec it" becomes the reflex regardless of what the work is. Today the
only exits are label routing (requires a GitHub issue with intake labels) and
the end-of-grill kind proposal (covers only the three kinds `/spec` writes
itself). Someone who types `/spec` and then describes a prod outage, a defect,
or a bug on the released version in their own words falls through both nets:
the grilling carries on shaping a feature spec for work that needed
`/spec-incident`, `/spec-hotfix` or `/spec-bug`. The same blindness exists in
the other direction — `/spec-bug` run on something that turns out to be a
feature request has no exit either.

## Decisions

1. **Signal-based routing during the grill, full matrix.** Every entry skill
   watches, while grilling, for the signals that mark the *other* kinds, and
   proposes a hand-off when one appears — escalation (`/spec` → bug / hotfix /
   incident) and de-escalation (`/spec-bug` et al. → `/spec` when the work is a
   feature/chore/issue request, not a defect). Rejected: `/spec`-only — the
   wrong-door problem is symmetric, and `/spec-incident` entered wrongly is the
   costliest (it skips review pages and starts in `in-progress/`).
2. **Raise it the moment the signal appears, not at the end of the grill.** For
   an incident especially, finishing a feature grill first is actively harmful —
   `/spec-incident` exists to be written *during* the outage.
3. **Always confirm; never silently switch.** The skill names the signal
   (quoting the user's words) and proposes the kind with a one-line reason; the
   user confirms or declines, and a decline ends the matter — the grill carries
   on where it was, and the same signal is not re-raised. A pasted stack trace
   in "handle this error nicely" is a feature, not a bug: the signal is a
   question to raise, never a verdict. Rejected: auto-switch on "unambiguous"
   signals — a wrong read costs a wrong workflow.
4. **Hand off in-session, carrying the context.** On a confirmed switch the
   current skill invokes the target skill directly and seeds it with everything
   the grilling already established (symptom, version, impact, repro material,
   decisions so far) — the same "seed, don't skip, the grill" principle issue
   adoption already uses. The target grills only what it still needs. Rejected:
   stop-and-tell (the label-routing shape) — mid-grill it throws away the
   answers already given.
5. **Signals are judgment, not configuration.** The skill text gives example
   signals per kind; Claude weighs them in context. No new config keys, no
   signal lists to maintain. Skills are read by Claude, which exercises
   judgment — that is the documented difference between skills and commands.
6. **Precedence: incident > hotfix > bug.** When one description carries
   several signals, propose the most specific destination — the same reasoning
   label routing documents for hotfix-over-bug.
7. **Phase 0 label routing is unchanged.** It fires before any grilling, so
   there is no context to lose and "run `/spec-bug #123`" costs one retype.
   Out of scope.
8. **Base skills only.** The routing text lives in `packages/common` — it is
   provider-agnostic (no labels, no tracker). Supersets pick it up at build.

## Solution overview

A shared **routing matrix** documented once in `spec-planning.md`, and a short
"watch for the other doors" section in each entry skill's grill:

| In | Watches for | Hands to |
|----|-------------|----------|
| `/spec` | defect · defect-on-released · live outage | `/spec-bug` · `/spec-hotfix` · `/spec-incident` |
| `/spec-bug` | on-released · live outage · not a defect | `/spec-hotfix` · `/spec-incident` · `/spec` |
| `/spec-hotfix` | live outage · not on released / not a defect | `/spec-incident` · `/spec-bug` or `/spec` |
| `/spec-incident` | no live outage | defect → `/spec-bug` (on released → `/spec-hotfix`), else `/spec` |

Feature, chore and issue all route to `/spec` — one door for the three kinds it
writes, where the existing kind proposal picks between them. Example signals:
*defect* — "it's broken", behaviour differing from intended, a stack trace of a
failure; *on released* — "in prod", "since v2.1", a deployed version named;
*live outage* — down or degraded **right now**, users affected as we speak;
*not a defect* — the ask is new or changed behaviour, not restoring intended
behaviour.

The confirmation names the signal and the destination; the hand-off is an
in-session invocation of the target skill seeded with the grilled context.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `spec/SKILL.md` — Phase A gains signal routing; kind proposal cross-refs it |
| Skill/rule | update | `spec-bug/SKILL.md`, `spec-hotfix/SKILL.md` — escalation + de-escalation watch |
| Skill/rule | update | `spec-incident/SKILL.md` — no-live-outage routing in its grill |
| Skill/rule | update | `spec-planning.md` — routing matrix + precedence documented once |
| Docs | update | `docs/reference.html` — routing described, `verified:` bump |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `/spec` signal routing + matrix in spec-planning.md | ✅ | [01-spec-routing.md](01-spec-routing.md) |
| 2 | `/spec-bug` and `/spec-hotfix` watches | ✅ | [02-bug-hotfix-watches.md](02-bug-hotfix-watches.md) |
| 3 | `/spec-incident` no-outage routing | ✅ | [03-incident-routing.md](03-incident-routing.md) |
| 4 | Ship — docs, build, full suite | ⬜ | [04-ship.md](04-ship.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-11-03 | Ready | backlog | Reuben Greaves |
| 2026-11-03 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-11-03 — Spec created.
