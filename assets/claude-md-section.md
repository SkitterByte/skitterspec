## Spec workflow

Spec-driven development runs through eight skills — use them so structure and
lifecycle stay consistent (see `.claude/rules/spec-planning.md`):

| Skill | Action | Status | Folder |
|-------|--------|--------|--------|
| `/spec` | (Feature) Grill to a clear shared understanding, then write a concise spec | `Draft` | `specs/backlog/` |
| `/spec-bug` | (Bug) Reproduce with a failing test, capture spec, drive red→green | `In Progress` | `specs/in-progress/` |
| `/spec-ready` | Confirm the spec is groomed (no open questions, phases + tests defined) | `Ready` | `specs/backlog/` |
| `/spec-review` | Re-validate a spec against the codebase; refresh stale parts | `—` | (unchanged) |
| `/spec-go` | Implement the next phase (with tests) | `In Progress` | `specs/in-progress/` |
| `/spec-complete` | Verify all phases done + tests green | `Complete` | `specs/complete/` |
| `/spec-cancel` | Record progress, stamp a reason on the header | `Cancelled` | `specs/cancelled/` |
| `/spec-init` | Bootstrap/repair this workflow in a project (idempotent) | — | — |

Every spec has a **type** (`> **Type:** Feature\|Bug`) and a filename prefix
(`feat-<name>` / `bug-<name>`) — never `[BUG]` brackets (glob hazard). Specs use
markdown checkboxes (`- [ ]`) for task tracking and are the single source of
truth for progress. Every spec is a folder: `00-overview.md` is the dashboard
(problem, decisions, solution, **phase index**, logs) and **each phase is its own
file** (`01-<slug>.md`, `02-…`) holding that phase's tasks — never a bare file,
never phases lumped into the overview. **Every phase ends with creating and
running tests**; decisions go in the spec's Changelog, state transitions in its
State log.

> Tailor the per-phase test commands and project conventions referenced by the
> spec skills to this project's stack (see `.claude/rules/spec-planning.md`).

**Per-spec isolation (adopt once, then default):** with isolation adopted
(`skitterspec init --isolation`, or `specs/.core/env.config.json` present),
**`/spec-go`** gives every in-progress spec its own git worktree automatically —
parallel specs, no stashing, `main` left free. Docker is a **per-spec
escalation**: `/spec` sets `> **Stack:** worktree` (default) or `worktree +
docker` when the spec touches the DB / stateful services, and only the latter
gets a namespaced stack (isolated volumes + reserved port block). **`/spec-env`**
· **`/spec-env-down`** are the manual engine (escalate Docker later, re-attach,
tear down — guarding dirty/unpushed work, backing up volumes first). Independent
of lifecycle status; inactive when `env.config.json` is absent.
