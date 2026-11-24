# Spec Planning

Spec-driven development runs through the lifecycle skills. Use them rather than
writing specs by hand, so structure and lifecycle stay consistent.

| Skill | Does | Folder |
|-------|------|--------|
| `/spec` | Feature, chore or issue. Grills to a shared understanding, proposes the kind, writes the spec in its own worktree, and lands it on the verdict | `backlog/` |
| `/spec-bug` | Bug: reproduces it with a failing test, writes the spec, drives red→green | `in-progress/` |
| `/spec-hotfix` | Hotfix: forks from a release tag, red→green, lands by tag + cherry-pick | `in-progress/` |
| `/spec-incident` | Incident: records a live outage while it happens; its fixes are separate linked specs | `in-progress/` |
| `/no-spec` | Mechanical work with no spec (bump, rename): own branch, worktree, page and land | — |
| `/spec-idea` | Captures an idea without specing it; `/spec idea:<id>` or `/spec #N` promotes it | — |
| `/spec-review` | Re-validates a spec against the code and refreshes stale parts | unchanged |
| `/spec-start` | Puts a spec in flight: provisions its branch, then builds phase 1 | `in-progress/` |
| `/spec-next` | Builds the next phase of the spec this session is in | unchanged |
| `/spec-reviewed` | Picks up a review verdict sent from the page | unchanged |
| `/spec-epic-next` | Names the epic member that can start now | unchanged |
| `/spec-resume` | Goes back into a spec in flight, by name or `#N`; never starts anything | unchanged |
| `/spec-park` | Records a `Blocked on:` wait outside the repo | unchanged |
| `/spec-to-main` | Lands the branch mid-spec without finishing it | unchanged |
| `/spec-complete` | Verifies phases and tests, lands, tears down | `complete/` |
| `/spec-cancel` | Records progress and a reason, tears down | `cancelled/` |
| `/spec-tada` · `/spec-todo` | Evening recap and morning pick-up across projects. Read-only | — |
| `/spec-init` | Bootstraps or repairs this workflow (idempotent) | — |

Status flow: `Ready → In Progress → Complete`, or `Cancelled` from any state.
`/spec` writes `Draft` only when open questions are deliberately left.
`/spec-bug`, `/spec-hotfix` and `/spec-incident` start straight in
`In Progress`.

The spec layout, header fields, kinds and folders are in
`.claude/rules/spec-format.md`, which loads when you touch `specs/`. This
project's typecheck and test commands are in
`.claude/rules/project-conventions.md`.

## Skills vs commands

The table lists **skills**, which Claude reads and applies judgment to. These
are **slash commands that only a person can run**:

- `/spec-connect` and `/spec-live` each pre-run one `spec-env` verb.
- `/spec-epic` pre-runs `skitterspec epic status`.
- `/allow-main`, `/allow-project` and `/spec-skip` lift guards aimed at Claude.
  **Claude must never be able to lift a guard aimed at Claude.**

`/spec-reviewed`, `/spec-to-main`, `/spec-status` and `/spec-sync` are skills,
but user-only. When a skill wants one of these, it tells the user to type it and
never runs it itself. Every other skill is model-invocable.

## Guards

- **The main guard** (`.claude/hooks/main-guard.cjs`) refuses an Edit or Write
  in the **primary checkout on the base branch**. `main` is where work lands,
  not where it happens. There is **no allowlist**. Move the work instead:
  `/spec-start <name>` or `/no-spec <name>`, which Claude may take on its own.
  Only a person can type `/allow-main`. The engine is
  `skitterspec spec-env main <check|allow|status>`, and
  `guards.mainIsLandingZone` turns the guard off.
- **The project guard** (`.claude/hooks/project-guard.cjs`) refuses writes, git
  changes and `skitterspec` lifecycle commands aimed at **another** skitterspec
  project. Reads pass. A session works on the project it started in. Reports
  that read across projects suggest work elsewhere and never act on it. Only a
  person can type `/allow-project <name>`. `guards.projectBoundary` turns it
  off.
- **The review gate.** A phase that ended owes a verdict. `/spec-next` arms the
  gate when it renders the end-of-phase page. A **committing verdict** or
  `skitterspec spec-env review skip "<reason>"` (`/spec-skip`) clears it. While
  it is armed, `/spec-next` refuses, and the hook refuses `git commit` in that
  spec's worktree. Mid-phase renders arm nothing.
- **Never claim a review pass you were not asked to.** Inside a wait the run
  started, the engine's `--claim-since` claims it. Outside one, only a person
  typing `/spec-reviewed` does.
- Every guard fails **open** on a cannot-tell
  (`.claude/rules/negative-checks.md`). Where a refusal carries an `offer`,
  follow `.claude/rules/offered-unblocks.md`. Never invent an offer.

## Isolation, briefly

With `specs/.core/env.config.json` present, each spec gets its own git
worktree (`mode: worktree`, the default) or is built in the primary checkout
(`mode: checkout`, one spec at a time). `/spec-start` moves the session into the
worktree with a plain `cd`. A bare command uses the worktree you are standing
in, or else the only provisioned spec. `/spec` writes a new spec in its own
`--docs` worktree, and its committing verdict lands it on the base branch.
Under `land.specDocs: "branch"` it rides the feature branch instead. Without
`env.config.json`, none of this applies.

Workspace modes, Docker stacks, `/spec-connect`, the live overlay, spec-docs
landing and staging are detailed in `.claude/skills/spec-start/isolation.md`.
Read it when a skill sends you there.

**Commit with a pathspec on both halves**: `git add -- <paths>` and
`git commit -m "…" -- <paths>`. Every session shares one `.git/index`, so a bare
`git commit` takes whatever someone else staged. `skitterspec spec-env stage`
splits the tree into this spec's documents and everything else.

## Autonomous runs

A spec can build every phase without stopping for a verdict: `--auto` on
`/spec-start` or `/spec-next`, a `> **Run:** auto` header, or `auto.default`
in `env.config.json`. Each phase is committed and its page kept as a snapshot.
The run stops for red tests, a blocker, manual steps or an open decision, and
ends as `auto.then` (or `--then`) says: `pause`, `push` or `pr`. The loop is
in `.claude/skills/spec-next/autonomous.md`.

## Ticketing provider (when one is installed)

The repo owns each spec's **content**. The tracker is a one-way generated
mirror: nothing is ever pulled back or merged. Under the default
`sync.fieldOwnership` value `pull`, the tracker owns **status and assignee**.
Skills then write no `Status:` or `Developer:` header and no State log row. Ask
`spec-sync ownership` rather than assuming. Buckets record what was done to the
code. A board that finished first is reported, never obeyed. Each lifecycle
skill refreshes the mirror at its seam, and `/spec-push` does it on demand.

## Release gating (when `specs/.core/gating.config.json` exists)

Every new spec records `> **Gating:** <flag>` or `none: <one-line reason>`. A
bare `none` does not count. Skitterspec asks the question and cites the
project's guidance. It never reads flag code, and `gating check` always exits 0.

## When asked for a plan

1. Create or update a spec under `specs/`. Never plan only in chat.
2. Reach a clear shared understanding of the requirement and the solution
   before writing (`/spec` grills for this).
3. Tasks are checkboxes, `- [ ]`, ticked `- [x]` when done, and each fits in one
   session.
4. Organise the work into phase files, each with a short goal.
5. Every phase ends with tests. It is not done until the typecheck and tests are
   green.
6. Keep specs as concise as possible.
7. Record decisions and course corrections in the spec's **Changelog**.

---

Why the workflow is shaped this way, and the amendments behind it:
[docs/rationale/spec-planning.md](https://github.com/SkitterByte/skitterspec/blob/main/docs/rationale/spec-planning.md).
