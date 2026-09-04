# skitterspec

<!-- skitterspec:start -->
## Spec workflow

Spec-driven development runs through the lifecycle **skills** below — use them so
structure and lifecycle stay consistent (see `.claude/rules/spec-planning.md`).
The everyday loop is **`spec → go → commit → complete`**, with `/spec-connect`
in the middle when you want to test the spec in a browser.

| Skill | Action | Status | Folder |
|-------|--------|--------|--------|
| `/spec` | (Feature) Grill to a shared understanding, then write a groomed spec | `Ready` (or `Draft`) | `specs/backlog/` |
| `/spec-bug` | (Bug) Reproduce with a failing test, capture spec, drive red→green | `In Progress` | `specs/in-progress/` |
| `/spec-review` | Re-validate a spec against the codebase; refresh stale parts | `—` | (unchanged) |
| `/spec-go` | Provision the env, bring dev servers up, implement the next phase | `In Progress` | `specs/in-progress/` |
| `/spec-complete` | Verify all phases done + tests green; land + tear down | `Complete` | `specs/complete/` |
| `/spec-cancel` | Record progress, stamp a reason; tear down | `Cancelled` | `specs/cancelled/` |
| `/spec-hotfix` | (Hotfix) Fork a worktree from a release tag, red→green, land by tag | `In Progress` | `specs/in-progress/` |
| `/spec-to-main` | Land the branch on the base mid-spec, without finishing | (unchanged) | (unchanged) |
| `/spec-init` | Bootstrap/repair this workflow in a project (idempotent) | — | — |

**Skills vs commands.** The table is skills — Claude reads them and exercises
judgment. `/spec-connect` and `/spec-live` are **slash commands** instead: each
pre-executes one `spec-env` verb and relays it, so only you can run them. A skill
that wants one will tell you to type it.

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
**dev servers** (`env.config` → `dev`) on the spec's ports. The **`/spec-connect <name>`** command then exposes that spec on your canonical
`localhost` ports so you can test it at the normal URL (`/spec-connect main`
hands them back); for a code-only spec, **`/spec-live <name>`** reuses the dev
server you already have running instead. Docker is a
**per-spec escalation**: `/spec` sets `> **Stack:** worktree` (default) or
`worktree + docker` when the spec touches the DB / stateful services, and only
the latter gets a namespaced stack. Teardown is folded into **`/spec-complete`** ·
**`/spec-cancel`**; beneath the skills, `skitterspec spec-env` is the CLI engine — `up`, `down`,
`prune`, `dev`, `connect`, `integrate`, `hotfix`, `live`, `status` and `resolve`.
Most are planners the skills run; omit the spec name and it uses the worktree you
are standing in. Independent of lifecycle
status; inactive when `env.config.json` is absent.
<!-- skitterspec:end -->

<!-- skittership:start -->
## Release tooling

This project uses **skittership** for commits, changelog, and user-facing release
notes. See `.claude/rules/commit-messages.md` for the full commit grammar.

- **Commit with `/commit`** — stages task-related files, runs typecheck + the
  relevant tests, then writes a Conventional Commit (`type(scope): subject`).
- **`Release-Note:` footer** — add it to any user-visible commit (a plain-English,
  benefit-framed sentence). `Release-Note!:` promotes the note into the release
  Highlights; `Release-Area:` overrides the scope→area mapping; `Release-Note:
  none` marks a commit explicitly not user-facing.
- **Generation** — the dev-facing changelog (`CHANGELOG.md`) and the user-facing
  release notes (`RELEASES.md`) are regenerated from commits at `npm version`
  (when the hook is wired), or on demand via `npm run changelog` / `npm run
  releases`. Filenames, product name, and the scope→area map live in
  `skittership.config.json`.
<!-- skittership:end -->
