## Spec workflow

Spec-driven development runs through seven lifecycle skills (plus `/spec-connect`
when isolation is on) — use them so structure and lifecycle stay consistent (see
`.claude/rules/spec-planning.md`). The everyday loop is
**`spec → go → connect → commit → complete`**:

| Skill | Action | Status | Folder |
|-------|--------|--------|--------|
| `/spec` | (Feature) Grill to a shared understanding, then write a groomed spec | `Ready` (or `Draft`) | `specs/backlog/` |
| `/spec-bug` | (Bug) Reproduce with a failing test, capture spec, drive red→green | `In Progress` | `specs/in-progress/` |
| `/spec-review` | Re-validate a spec against the codebase; refresh stale parts | `—` | (unchanged) |
| `/spec-go` | Provision the env, bring dev servers up, implement the next phase | `In Progress` | `specs/in-progress/` |
| `/spec-complete` | Verify all phases done + tests green; land + tear down | `Complete` | `specs/complete/` |
| `/spec-cancel` | Record progress, stamp a reason; tear down | `Cancelled` | `specs/cancelled/` |
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
parallel specs, no stashing, `main` left free — and brings up the project's host
**dev servers** (`env.config` → `dev`) on the spec's ports. **`/spec-connect
<name>`** then exposes that spec on your canonical `localhost` ports so you can
test it at the normal URL (`/spec-connect main` hands them back). Docker is a
**per-spec escalation**: `/spec` sets `> **Stack:** worktree` (default) or
`worktree + docker` when the spec touches the DB / stateful services, and only
the latter gets a namespaced stack. Teardown is folded into **`/spec-complete`** ·
**`/spec-cancel`**; beneath the skills, `skitterspec spec-env
<up|down|dev|connect|integrate>` is the CLI engine. Independent of lifecycle
status; inactive when `env.config.json` is absent.
