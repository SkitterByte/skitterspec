---
github_identifier: "#202"
github_url: "https://github.com/SkitterByte/skitterspec/issues/202"
---

# A morning to-do, an evening ta-da, and sessions that stay in their project

> **Type:** Feature
> **Name:** feat-spec-todo (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/202
> **Author:** Reuben Greaves
> **Raised:** 2026-11-13
> **Area:** packages/common/src/tada/, packages/common/src/env/, packages/common/src/cli.js, packages/common/src/init.js, packages/common/assets/skills/spec-tada/SKILL.md, packages/common/assets/skills/spec-todo/SKILL.md, packages/common/assets/hooks/project-guard.cjs, packages/common/assets/commands/allow-project.md, packages/common/assets/rules/spec-planning.md, docs/index.html, docs/reference.html
> **Stack:** worktree
> **Docs:** index, reference

## Summary

`/spec-tada` keeps its closing advice to the project it was run from and
leads with the day's wins. A new `/spec-todo` answers the morning question of
where you left off and what's ahead. A guard stops a session in one project
from writing to, or running lifecycle commands in, another.

## Problem

`/spec-tada` covers every project in a category, but its `Next` row and
standup named an action in a different repo. On 2026-11-13 a skitterspec
session was told `/spec-complete chore-perf-alerts`, an ereqs spec. It acted
on that, `cd`-ing into ereqs and starting the completion there. A bottom row
is what readers copy and paste, so it must only name work this session owns.
Nothing stopped the session from crossing over either.

The ta-da list also serves two moods that it only half meets. In the evening
it should show plainly that a lot got done, and lead with the saves that
mattered: the gnarly bug, the hotfix. In the morning there is usually nothing
yet for "today". The useful answer then is where each project was left on
the last working day, and what's next.

## Acceptance criteria

- `/spec-tada` run from skitterspec closes its `Next` row on a skitterspec
  action, or `nothing in flight here`. It never names another project's
  command there.
- Other projects' next steps appear only inside their own sections, worded
  as suggestions such as "ereqs has chore-perf-alerts ready to complete".
- The standup's **Done** line spans every project. Its **Next** and
  **Blockers** lines cover this project only.
- The evening recap opens with **Wins**. A completed hotfix, incident or bug
  is marked as saved bacon. A completed spec or a release cut is marked as a
  win. The model may promote one more from the prompts, saying why.
- `/spec-todo` on a Monday morning reports Friday's state per project:
  - where each spec was left;
  - waiting verdicts and armed gates;
  - the next actions;
  - and only this project's action in `Next`.
- From a skitterspec session, an `Edit` into `../ereqs/…` is refused. So is
  `cd ../ereqs && skitterspec spec-env …` or `git -C ../ereqs commit …`. Each
  refusal names `/allow-project ereqs` as the exit.
- `git -C ../ereqs log` and `skitterspec tada` still run. So does any write
  inside this repo or its own worktrees.
- `/allow-project ereqs` lifts the guard for that project for this session
  only. A new session is guarded again.

## Decisions

1. **The engine marks the home project, and the skills scope to it.** The
   digest flags the project the run started from as `here`, matched by git
   common dir so a worktree counts as home. `Next` and the standup's
   Next/Blockers lines draw only from that project. Other projects' in-flight
   lines stay in their own sections, and the skill rewrites them as
   suggestions rather than bare commands.
   Rejected: dropping other projects' next steps entirely. They are useful in
   context; the risk was only their position at the bottom.
2. **Wins are engine facts, and the model may add one.** A completed hotfix,
   incident or bug spec is tagged `saved-bacon`. A completed spec or a release
   tag cut in the window is tagged `win`. The text form marks them with `★`.
   The skill leads the recap with them and may promote one extra from the
   prompts (for example a long debugging session that ended in a fix),
   naming its evidence.
   Rejected: model-only judging, because it is inconsistent from one night
   to the next.
3. **`/spec-todo` is its own command**, the counterpart of the ta-da list. It
   is model-invocable ("where did I leave off", "what's on today"). A bare
   `/spec-tada` whose today is empty says that `/spec-todo` would answer the
   morning question.
   Rejected: one command that switches shape by time of day, because you
   could not predict which shape you would get.
4. **"Left off" means the last active day.** That is the most recent day
   before today with any session or commit in scope, looking back at most 14
   days. Monday reads Friday, and a day off is skipped. If nothing falls in
   the 14 days, the report says so.
   Rejected: strictly yesterday, which makes every Monday blank.
5. **`skitterspec todo` is the engine.** It reuses the tada digest for the
   left-off day and adds, per project:
   - where each spec stands: the last move or commit and its in-flight line;
   - review passes waiting and gates armed, read off each project's
     `.spec-env/`, read-only;
   - today's activity so far, if any.
   It takes the same scope flags as `tada` (category, `--here`,
   `--all-projects`) and supports `--page`.
6. **The guard is a hook plus an engine check, aimed at another skitterspec
   project.** That means a git repo whose `specs/.core/` exists, a positive
   signal because the installer always writes it. The home project and its
   worktrees are excluded because they share a git common dir.
   `.claude/hooks/project-guard.cjs` decides nothing itself: it hands the
   call to `skitterspec spec-env project check`.
7. **Refused:** `Edit`/`Write`/`NotebookEdit`/`MultiEdit` whose path lands in
   another project. Also refused: a Bash command running `skitterspec` or a
   mutating `git` subcommand whose effective directory is another project.
   The effective directory is the payload `cwd`, plus every `cd <p>`,
   `git -C <p>` and `--dir <p>` target in the command. **Allowed:**
   - read-only git (`status`, `log`, `diff`, `show`, `rev-parse`,
     `worktree list`, `branch --show-current`);
   - read-only skitterspec verbs (`tada`, `todo`, `status`, `resolve`,
     `review waiting`);
   - every other program.
   The guard is about writes and lifecycle commands, not the shell at large.
8. **The exit is `/allow-project <name>`.** It is user-only for
   `/allow-main`'s reason: Claude must not be able to lift a guard aimed at
   Claude. It is keyed to the payload's `session_id` and recorded in the
   home repo's gitignored `.spec-env/`, so a new session is guarded again.
   `/allow-project <name> off` revokes it early. `guards.projectBoundary:
   false` in `env.config.json` turns the guard off for a project.
9. **It fails open everywhere.** No engine, an unreadable payload, a path
   that will not resolve, or a command it cannot parse all allow the call
   (`.claude/rules/negative-checks.md`). Each refusal is paired with a test
   that stays silent on a healthy but unusual input: this repo's own
   worktree, a sibling folder with no `specs/.core`, or a read-only git.

## Solution overview

- `tada/repo.js` resolves the home project. `digest.js` stamps `here: true`
  on it and tags `win` and `saved-bacon` events. `format.js` prints `(here)`
  on that project's heading and `★` lines for wins.
- `tada/todo.js` holds `lastActiveDay()` and the per-project left-off and
  blockers fold. `skitterspec todo` prints it in text form, the same shape
  as `tada`.
- `env/project-guard.js` checks a path or a command and returns allow or
  deny. `spec-env project <check|allow|status>` exposes it.
  `assets/hooks/project-guard.cjs` is registered by `init` and `update` on
  the write tools and on Bash.
- The skills: `/spec-tada` gets the scoping and Wins wording, and
  `/spec-todo` is new. The `/allow-project` command is new, and
  `spec-planning.md` gets a paragraph beside `/allow-main`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `skitterspec todo [--since/--on] [--here/--all-projects] [--page]` |
| CLI command | add | `skitterspec spec-env project <check\|allow\|status>` |
| CLI output | update | `tada` text: `(here)` on the home project, `★ win` / `★ saved bacon` lines |
| Skill | add | `/spec-todo` |
| Skill | update | `/spec-tada`: Wins first, home-scoped `Next` and standup |
| Command | add | `/allow-project <name> [off]` (user-only) |
| Hook | add | `project-guard.cjs` on Edit\|Write\|NotebookEdit\|MultiEdit and Bash |
| Config key | add | `guards.projectBoundary` (default on) |
| Rule | update | `spec-planning.md`: table row for `/spec-todo`, guard paragraph |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Home-scoped ta-da, with wins | ✅ | [01-home-scope-and-wins.md](01-home-scope-and-wins.md) |
| 2 | `/spec-todo` — where you left off | ✅ | [02-spec-todo.md](02-spec-todo.md) |
| 3 | The project guard and `/allow-project` | ⬜ | [03-project-guard.md](03-project-guard.md) |
| 4 | Docs and rules | ⬜ | [04-docs.md](04-docs.md) |

## Open questions

- [ ] None.

## Changelog

- 2026-11-13 — Spec created. Prompted by a skitterspec session acting on an
  ereqs spec that `/spec-tada`'s `Next` row had named.
- 2026-11-13 — Phase 1: a "release" is any tag on one of the window's
  commits, annotated or lightweight. Git cannot tell a release tag from any
  other, and a project's tag naming is its own. The served page shows the same
  wins as chips and marks the home project. A home project with no activity in
  the window is not listed, so the recap's `Next` reads `nothing in flight
  here`; phase 2's todo is where its open specs show.
- 2026-11-13 — Phase 2:
  - `todo` takes no `--since`/`--on`. The engine finds the left-off day
    itself, so a window flag would only contradict it.
  - A spec the left-off day completed or cancelled is named on one
    `finished:` line rather than given a section. Work on no spec is left
    out, because it is history rather than somewhere to pick up.
  - Waiting passes count as blockers only for specs still in flight. That
    keeps a month-old pass for a finished spec out of the morning.
  - The page is served through the existing `_tada` route with `?todo=1`
    rather than a new route.
  - The docs tests demand that every shipped command and skill is named, so
    the README tables, the index chip, the reference row and the linear
    page's skill count moved here from phase 4. Phase 4 keeps the rules,
    CLAUDE.md and the `verified:` bumps.
