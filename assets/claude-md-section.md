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

Also installed: **`/commit`** — stage only the task's files, run typecheck +
tests, then write a conventional-commit message with a `Release-Note:` footer
for user-visible changes (grammar in `.claude/rules/commit-messages.md`). If the
release tooling is enabled (`skitterspec.config.json`), those footers feed the
generated `CHANGELOG.md`/`RELEASES.md` at `npm version`.

**Per-spec isolation (opt-in):** **`/spec-env`** gives an in-progress spec its
own git worktree + namespaced Docker stack (isolated volumes + a reserved port
block) and an optional editor/terminal opener, so specs run in parallel without
clashes; **`/spec-env-down`** tears it down (guards against dirty/unpushed work;
backs up volumes first). Independent of the lifecycle status above; active only
when `specs/.core/env.config.json` exists (copy `env.config.json.example` to
adopt).
