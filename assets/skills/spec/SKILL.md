---
name: spec
description: Create a new spec-driven-development spec. Grills the user to a clear, shared understanding of the requirement AND the proposed solution FIRST, then writes one concise, phased, test-included, change-logged spec into specs/backlog/. Use when the user wants to plan a feature, write a spec, capture a requirement, or says "/spec" or "spec this out".
---

# /spec — author a new spec

Produce ONE concise spec in `specs/backlog/`. Do not start coding — this skill
plans only. Implementation happens later via `/spec-go`.

Lifecycle (the governing skills) — status in parentheses:
`/spec` (Draft, backlog) → `/spec-ready` (Ready, still backlog) → `/spec-go`
(In Progress, in-progress; implement phase 1) → `/spec-complete` (Complete) /
`/spec-cancel` (Cancelled). See `.claude/rules/spec-planning.md`.

## Phase A — reach a clear shared understanding (grill first)

Interview the user until requirement AND proposed solution are unambiguous. Do
not write the spec until this is resolved.

- Break the problem into **distinctive areas** and work them in logical order,
  resolving dependencies between decisions one at a time.
- Ask **one question at a time**. For each, give your **recommended answer**.
- If a question can be answered by **reading the codebase, read it** instead of
  asking. Verify endpoints/models/files actually exist before relying on them.
- Cover, at minimum, the areas that apply:
  1. **Problem & why** — what's broken/missing, who feels it, why now.
  2. **Scope & non-goals** — explicit out-of-scope items.
  3. **Affected areas** — concrete files/modules/packages this touches.
  4. **Proposed solution shape** — the chosen approach and the alternatives
     rejected, with the reason (this becomes "Decisions").
  5. **Data / API impact** — schema/model changes, new endpoints, and
     **backward compatibility** (additive = safe; breaking = needs explicit
     permission and coordination).
  6. **Security & multi-tenancy** — authz, tenant scoping, untrusted input.
  7. **Edge cases & failure modes.**
  8. **Testing approach** — what proves each phase correct.
  9. **Open questions** — anything still undecided.

Stop grilling when there are no unresolved branches that would change the spec.
Briefly play back the agreed understanding before writing.

## Phase B — write the spec

This skill is for **features**. For bugs, use `/spec-bug` (test-first, red→green).

- **Every spec is a folder** — never a bare file, even for a one-line change:
  `specs/backlog/feat-<kebab-name>/`. Create it with `mkdir -p`.
- The entry point is **always `00-overview.md`** — the index/dashboard for the
  spec. It holds the header block, Problem, Decisions, Solution overview, the
  **phase index** (a table linking to each phase file), Open questions, State
  log, and Changelog. It does **not** hold the per-phase task lists.
- **Each phase is its own file** — `01-<phase-slug>.md`, `02-<phase-slug>.md`, …
  numbered in execution order; the slug is a short kebab description of the phase
  goal (e.g. `01-data-model.md`, `02-api-endpoints.md`). The phase file holds
  that phase's goal, its task checkboxes (tests included), and any phase-specific
  notes. **Even a single-phase spec gets `01-….md`** — never lump phase tasks
  into `00-overview.md`. This keeps each phase easy to dive into on its own.
- Choose a short kebab-case name and **prefix it `feat-`** (the bug counterpart
  uses `bug-`).

Use this template (keep it **as concise as possible** — no filler, no restating
the codebase, link rather than duplicate):

```markdown
# <Feature title>

> **Type:** Feature
> **Status:** Draft — not started
> **Author:** <git user.name — `git config user.name`>
> **Developer:** —
> **Raised:** <YYYY-MM-DD (today)>
> **Area:** <comma-separated files/modules this touches>

## Problem

<2–6 sentences: what's wrong/missing and why it matters. No fluff.>

## Decisions

<Numbered, confirmed decisions from Phase A. Each: the choice + one-line why,
and the rejected alternative when it sharpens the choice. This is the heart of
the spec — be specific.>

## Solution overview

<Short prose or bullets describing the chosen shape end-to-end. Optional small
schema/grammar/output snippets where they remove ambiguity.>

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | <goal> | ⬜ | [01-<phase-slug>.md](01-<phase-slug>.md) |
| 2 | <goal> | ⬜ | [02-<phase-slug>.md](02-<phase-slug>.md) |

## Open questions

- [ ] <anything deferred — or "None">

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| <YYYY-MM-DD> | Draft | backlog | <author> |

## Changelog

- <YYYY-MM-DD> — Spec created.
```

Then create **one file per phase** (`01-<phase-slug>.md`, `02-…`, in execution
order). Each phase file uses this template:

```markdown
# Phase 1 — <goal> ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** <one line — what this phase delivers and how it's proven>.

## Tasks

- [ ] <clear, verb-first task>
- [ ] <clear, verb-first task>
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

<Phase-specific decisions, gotchas, or context. Delete if empty.>
```

Keep the `00-overview.md` phase index and the phase files in sync: the index row
is the one-line summary + status; the phase file is the detail.

The **State log** is the audit trail of folder/status transitions — every
lifecycle skill (`/spec-ready`, `/spec-go`, `/spec-complete`, `/spec-cancel`)
appends one row when it moves the spec. The **Changelog** is for decisions and
course-corrections only — keep the two separate.

Rules for the spec body:

- **Every phase is independently shippable and ends with tests.** A phase is
  not "done" until its tests are written and the suite is green. Bake a test
  task into each phase — never a separate "testing phase" at the end only.
- **Tasks are checkboxes** (`- [ ]`), clear, verb-first, and granular enough to
  finish in one session. They live in the **phase files**, not the overview. Use
  `⬜`/`🔄`/`✅` on each phase-file heading and mirror it in the `00-overview.md`
  phase index.
- **Honour project conventions** when writing tasks — reference the relevant
  `.claude/rules/*.md` rather than re-explaining them.
- **Changelog** is mandatory and lives in the spec. Every later decision or
  course-correction gets a dated one-line entry. Convert relative dates to
  absolute.
- Keep it tight. If a section adds no information, delete it.

## Phase C — finish up

After writing, tell the user the path and that it's a `Draft` in `backlog`. Next
step is `/spec-ready` once it's groomed, then `/spec-go` to start building.

## Phase D — offer isolation (opt-in, only if configured)

**Only when `specs/.core/env.config.json` exists** (the per-spec isolation
feature is enabled), offer — don't force — to provision an isolated environment
for the new spec: "Want me to run `/spec-env <name>` to give this spec its own
worktree + Docker stack?" If they decline, or if `env.config.json` is absent, do
nothing and finish as above.
