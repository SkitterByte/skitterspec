## Spec workflow

Spec-driven development runs through seven skills — use them so structure and
lifecycle stay consistent (see `.claude/rules/spec-planning.md`):

| Skill | Action | Status | Folder |
|-------|--------|--------|--------|
| `/spec` | (Feature) Grill to a clear shared understanding, then write a concise spec | `Draft` | `specs/backlog/` |
| `/spec-bug` | (Bug) Reproduce with a failing test, capture spec, drive red→green | `In Progress` | `specs/in-progress/` |
| `/spec-ready` | Confirm the spec is groomed (no open questions, phases + tests defined) | `Ready` | `specs/backlog/` |
| `/spec-go` | Implement the next phase (with tests) | `In Progress` | `specs/in-progress/` |
| `/spec-complete` | Verify all phases done + tests green | `Complete` | `specs/complete/` |
| `/spec-cancel` | Record progress, stamp a reason on the header | `Cancelled` | `specs/cancelled/` |
| `/spec-init` | Bootstrap/repair this workflow in a project (idempotent) | — | — |

Every spec has a **type** (`> **Type:** Feature\|Bug`) and a filename prefix
(`feat-<name>` / `bug-<name>`) — never `[BUG]` brackets (glob hazard). Specs use
markdown checkboxes (`- [ ]`) for task tracking and are the single source of
truth for progress. Every spec is a folder whose entry point is `00-overview.md`
(larger features add `01-<area>.md`… alongside it) — never a bare file. **Every
phase ends with creating and running tests**; decisions go in the spec's
Changelog, state transitions in its State log.

> Tailor the per-phase test commands and project conventions referenced by the
> spec skills to this project's stack (see `.claude/rules/spec-planning.md`).
