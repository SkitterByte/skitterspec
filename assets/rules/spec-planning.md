# Spec Planning

Spec-driven development is driven by seven skills — use them rather than
hand-rolling specs so the structure and lifecycle stay consistent. Each sets a
status on the spec header (`> **Status:** …`):

| Skill | Purpose | Status | Folder |
|-------|---------|--------|--------|
| `/spec` | (Feature) Grill to a clear shared understanding, then write a new spec | `Draft` | `specs/backlog/` |
| `/spec-bug` | (Bug) Reproduce with a failing test, capture spec, drive red→green | `In Progress` | `specs/in-progress/` |
| `/spec-ready` | Confirm it's groomed (no open questions, phases + tests defined) | `Ready` | `specs/backlog/` |
| `/spec-go` | Implement the next phase (with tests) | `In Progress` | `specs/in-progress/` |
| `/spec-complete` | Verify all phases done + tests green | `Complete` | `specs/complete/` |
| `/spec-cancel` | Record progress, stamp a reason on the header | `Cancelled` | `specs/cancelled/` |
| `/spec-init` | Bootstrap/repair this workflow in a project (idempotent) | — | — |

Status flow: `Draft → Ready → In Progress → Complete` (or `Cancelled` from any
state). `/spec-ready` is a grooming gate only — it does not move the folder.
`/spec-bug` is test-first and starts straight in `In Progress` (work begins
immediately), so it skips Draft/Ready.

## Project conventions (fill this in)

The spec skills tell you to run "your project's typecheck and test commands" and
to "honour project conventions". Make those concrete here so specs stay
consistent with the codebase:

- **Typecheck command:** `<e.g. npm run typecheck>`
- **Test command:** `<e.g. npm test>` (single file/dir: `<e.g. npx vitest run path>`)
- **Lint/format:** `<e.g. npm run lint>`
- **Other rules specs must honour:** link the relevant `.claude/rules/*.md`
  (architecture, code style, testing, database, etc.) rather than restating them.

## Spec types — Feature vs Bug

Every spec is one of two types, recorded **both** in the header and the filename:

- **Header field:** `> **Type:** Feature` or `> **Type:** Bug` (authoritative,
  greppable: `grep -rl 'Type:.*Bug' specs/`).
- **Filename prefix:** `feat-<name>` for features, `bug-<name>` for bugs
  (visible in listings; glob-safe — never use `[BUG]`/`[FEATURE]` brackets).

Both types share the same lifecycle folders below — type is orthogonal to status.

## Header fields & State log (audit trail)

Every spec header carries:

- `> **Author:**` — who created the spec (set at `/spec` / `/spec-bug`, defaults
  to `git config user.name`).
- `> **Developer:**` — who implements it (`—` until `/spec-go` starts work, then
  set to `git config user.name`; `/spec-bug` sets it immediately).

Every spec also has a **State log** table — the audit trail of folder/status
transitions. Each lifecycle skill appends exactly one row when it changes state:

```
## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-01-01 | Draft | backlog | Jane Dev |
| 2026-01-02 | In Progress | in-progress | Jane Dev |
```

Keep the **State log** (state transitions) separate from the **Changelog**
(decisions and course-corrections) — state moves go in the table, not the
changelog.

When asked for a plan, implementation strategy, or feature breakdown:

1. Create or update a spec under `specs/` — never plan only in chat.
2. Reach a clear shared understanding of the requirement AND the proposed
   solution before writing (the `/spec` skill grills for this).
3. Use markdown checkboxes `- [ ]` for tasks, `- [x]` when done.
4. Organise work into phased sections with short goal descriptions.
5. Tasks must be granular enough to complete in one coding session.
6. Every phase ends with creating and running tests — a phase is not done until
   its tests are green (run the project's typecheck + test commands above).
7. Keep specs **as concise as possible**.
8. Record decisions and course-corrections in the spec's **Changelog** section.

## Lifecycle folders

```
specs/backlog/       Draft + Ready specs (/spec, /spec-ready)
specs/in-progress/   under active implementation (/spec-go, /spec-bug)
specs/complete/      finished (/spec-complete)
specs/cancelled/     abandoned, with a reason on the header (/spec-cancel)
specs/.core/         project rules — ALWAYS APPLY, never moved
```

Every spec is a **folder** `specs/<bucket>/<name>/` whose entry point is
`00-overview.md` — never a bare file, even for simple changes. Larger, multi-area
specs add further files (`01-<area>.md`, `02-<area>.md`…) alongside `00-overview.md`.
Legacy specs may be a bare `<name>.md` — the skills
read those, but new specs always use the folder + `00-overview.md` form.

## Folder indexes (`00-index.md`)

Two folders keep a skill-maintained `00-index.md` file (never hand-edit):

- `specs/backlog/00-index.md` — **live view** of the backlog (`Added | Spec | Type |
  Status`, newest first). `/spec` prepends a row; `/spec-ready` updates its
  status; `/spec-go` and `/spec-cancel` remove the row when the spec leaves.
- `specs/complete/00-index.md` — **append-only completion log** (`Completed | Spec |
  Type`, newest first). `/spec-complete` prepends a row — use it to find the
  latest completed specs.

`/spec-init` ensures both exist. No index for `in-progress` or `cancelled`.

## Rules

- If a spec already exists, update it — don't rewrite from scratch.
- Preserve completed `[x]` tasks.
- Add new tasks to the appropriate phase.
- Never delete historical notes.
- The spec file is the single source of truth for implementation progress.
- Move specs between buckets with `git mv` to preserve history.
