---
name: spec-ready
description: Mark a Draft spec as Ready — confirm it's groomed (no unresolved open questions, phases and per-phase tests defined, decisions captured) and flip its status to Ready so it's a candidate for /spec-go. Stays in specs/backlog/. Targets a spec by name (arg) or the spec in context. Use when the user says "/spec-ready", "this spec is ready", or "mark <spec> ready to start".
---

# /spec-ready — promote a Draft spec to Ready

A grooming gate between authoring (`/spec`, status `Draft`) and implementation
(`/spec-go`, status `In Progress`). It does **not** move the spec — it stays in
`specs/backlog/`; it only confirms quality and flips the status to `Ready` so
you can see at a glance which backlog specs are good to start.

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate the spec folder under `specs/backlog/`. Entry point is its `00-overview.md`
  (legacy specs may be a bare `<name>.md`).

## 2. Check it's actually ready — don't rubber-stamp

Review the spec against the readiness bar. If any of these fail, **stop and tell
the user what's missing** rather than marking it Ready:

- **Open questions resolved** — the `## Open questions` section is empty or
  reads "None". Unresolved branches mean it isn't ready.
- **Decisions captured** — the chosen solution and key trade-offs are recorded.
- **Phased with clear tasks** — work is broken into phases, each with verb-first
  `- [ ]` tasks granular enough for one session.
- **Tests baked into every phase** — each phase ends with a create-and-run-tests
  task (a phase isn't done until green).
- **Concise and current** — no stale/contradictory sections.

Offer to fix small gaps inline if the user wants; otherwise leave it `Draft`.

## 3. Mark Ready

- Set the **Status** header in the entry point:
  `> **Status:** Ready (<YYYY-MM-DD>)`.
- Append a **State log** row: `| <YYYY-MM-DD> | Ready | backlog | <git user.name> |`
  (no folder change — Ready stays in `backlog`).
- Update the spec's row in `specs/backlog/00-index.md` — set its Status column to
  `Ready` (the row stays; the spec is still in backlog).
- Optionally add a **Changelog** note if grooming changed anything substantive.

## 4. Report

Confirm it's Ready and note it stays in `backlog` until `/spec-go` picks it up.
If you blocked it, list exactly what needs resolving first.
