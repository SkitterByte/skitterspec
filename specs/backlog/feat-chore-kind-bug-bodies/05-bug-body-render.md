---
github_issue_id: "#80"
---

# Phase 5 — Bug-shaped body render ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a bug or hotfix spec's projected ticket body leads with the bug
sections — Symptom/Repro, Root cause, Fix — rather than the feature overview
shape, as a different render of the same `00-overview.md` sections.

## Tasks

- [ ] Locate the body projection in `packages/sync-core/src` (the spec →
      description render all providers share) and add a kind-aware section
      order: `bug`/`hotfix` lead with Symptom (the repro material), Root
      cause, Failing test, Fix; `feat`/`chore` keep today's order unchanged.
- [ ] Sections a spec does not have are skipped, never invented — a legacy
      bug spec with feature-shaped sections renders exactly as today
      (stays-silent).
- [ ] Tests: a bug spec renders Repro/Root cause/Fix first; a feature spec's
      render is byte-identical to before; a bug spec with no bug sections is
      untouched. Typecheck + tests green.

## Notes

Generic by decision 7 — every provider benefits, and base-snapshot hash
comparisons must be regenerated only by a real push, so confirm the render
change does not strand existing snapshots as "edited" (same symmetry concern
as phase 4).
